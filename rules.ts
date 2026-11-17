import type {
  DeliveryStatus,
  RequestStatus,
  Reservation,
  Resource,
  ResourceStatus,
  Role,
} from './types'

/** ---------- Etiquetas en español (única fuente de verdad) ---------- */

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
  finalizada: 'Finalizada',
}

export const RESOURCE_STATUS_LABEL: Record<ResourceStatus, string> = {
  disponible: 'Disponible',
  en_uso: 'En uso',
  mantenimiento: 'En mantenimiento',
  fuera_servicio: 'Fuera de servicio',
  prestado: 'Prestado',
}

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  pendiente: 'Por entregar',
  entregado: 'Entregado',
  devuelto: 'Devuelto',
  vencida: 'Vencida',
}

export const KIND_LABEL: Record<string, string> = {
  espacio: 'Espacio',
  equipo: 'Equipo',
  elemento: 'Llave / control',
}

/** ---------- Reglas de negocio puras (compartidas por Supabase y demo) ---------- */

export const toMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

export const fromMinutes = (total: number): string => {
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Rango semiabierto [inicio, fin): tocar el borde no es solape. */
export const rangesOverlap = (
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean => toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd)

/** Regla 1: toda solicitud nueva nace pendiente. */
export const INITIAL_REQUEST_STATUS: RequestStatus = 'pendiente'

/** Regla 5: un recurso fuera de servicio (o en mantenimiento) no se puede reservar. */
export const isBookable = (resource: Resource): boolean =>
  resource.status === 'disponible' && resource.is_reservable

/** Regla 4: no puede existir otra reserva activa solapada para el mismo recurso. */
export const findConflict = (
  candidate: { resource_id: string; request_date: string; start_time: string; end_time: string },
  reservations: Reservation[],
): Reservation | undefined =>
  reservations.find(
    (r) =>
      r.status === 'aprobada' &&
      r.resource_id === candidate.resource_id &&
      r.reservation_date === candidate.request_date &&
      rangesOverlap(candidate.start_time, candidate.end_time, r.start_time, r.end_time),
  )

/** Regla 2 y 3: quién puede decidir sobre una solicitud. */
export const canDecide = (role: Role): boolean => role === 'encargado'

/** Regla 3 + 6: el profesor cancela solo lo suyo y mientras siga vigente. */
export const canProfessorCancel = (
  role: Role,
  request: { requester_id: string; status: RequestStatus },
  userId: string,
): boolean => {
  if (role === 'encargado') return request.status === 'pendiente' || request.status === 'aprobada'
  return request.requester_id === userId && (request.status === 'pendiente' || request.status === 'aprobada')
}

/** Regla 7: cualquier cambio de horario debe revalidar disponibilidad. */
export const validateSchedule = (start: string, end: string): string | null => {
  if (!start || !end) return 'Debes indicar la hora de inicio y la de fin.'
  if (toMinutes(end) <= toMinutes(start)) return 'La hora de fin debe ser posterior a la hora de inicio.'
  if (toMinutes(end) - toMinutes(start) < 30) return 'La reserva debe durar al menos 30 minutos.'
  return null
}

/** Segmentos libres de un día, a partir de los rangos ocupados. */
export const freeSegments = (
  opening: string,
  closing: string,
  busy: Array<{ start_time: string; end_time: string }>,
): Array<{ start_time: string; end_time: string }> => {
  const sorted = [...busy].sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time))
  const free: Array<{ start_time: string; end_time: string }> = []
  let cursor = toMinutes(opening)
  const limit = toMinutes(closing)
  for (const b of sorted) {
    const bs = Math.max(toMinutes(b.start_time), cursor)
    if (bs > cursor) free.push({ start_time: fromMinutes(cursor), end_time: fromMinutes(Math.min(bs, limit)) })
    cursor = Math.max(cursor, toMinutes(b.end_time))
  }
  if (cursor < limit) free.push({ start_time: fromMinutes(cursor), end_time: fromMinutes(limit) })
  return free.filter((f) => toMinutes(f.end_time) > toMinutes(f.start_time))
}

/** Mensajes de error legibles para restricciones de PostgreSQL / Supabase. */
export const friendlyDbError = (message: string): string => {
  const m = message.toLowerCase()
  if (m.includes('no_overlap') || m.includes('exclusion') || m.includes('conflict'))
    return 'Ese horario ya está ocupado para el recurso seleccionado. Ajusta la fecha u horas.'
  if (m.includes('row-level security') || m.includes('permission denied') || m.includes('violates row-level'))
    return 'Tu perfil no tiene permiso para realizar esta operación.'
  if (m.includes('duplicate key') || m.includes('unique'))
    return 'Ya existe un registro con ese identificador único.'
  if (m.includes('valid_range') || m.includes('check constraint'))
    return 'Los datos no cumplen una validación del sistema (revisa las horas).'
  return message
}
