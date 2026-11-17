import {
  CalendarX2,
  CircleDashed,
  Clock,
  PackageCheck,
  ShieldAlert,
  Wrench,
} from 'lucide-react'
import type { DeliveryStatus, RequestStatus, ResourceStatus } from '../services/types'
import { DELIVERY_STATUS_LABEL, REQUEST_STATUS_LABEL, RESOURCE_STATUS_LABEL } from '../services/rules'

/** Chips de estado: misma paleta en toda la aplicación. */

const REQUEST_TONE: Record<RequestStatus, string> = {
  pendiente: 'chip-mauve',
  aprobada: 'chip-green',
  rechazada: 'chip-sand',
  cancelada: 'chip-neutral',
  finalizada: 'chip-soft-green',
}

export function StatusChip({ status }: { status: RequestStatus }) {
  return <span className={`chip ${REQUEST_TONE[status]}`}>{REQUEST_STATUS_LABEL[status]}</span>
}

const RESOURCE_TONE: Record<ResourceStatus, string> = {
  disponible: 'chip-green',
  en_uso: 'chip-mauve',
  mantenimiento: 'chip-mauve',
  fuera_servicio: 'chip-sand',
  prestado: 'chip-blue',
}

const RESOURCE_PREFIX: Record<ResourceStatus, string> = {
  disponible: 'Operativo',
  en_uso: 'En uso',
  mantenimiento: 'En mantenimiento',
  fuera_servicio: 'Fuera de servicio',
  prestado: 'Prestado',
}

/** El mockup usa "Chip: Operativo" / "Chip: En mantenimiento". */
export function ResourceChip({ status, withPrefix = true }: { status: ResourceStatus; withPrefix?: boolean }) {
  const label = RESOURCE_STATUS_LABEL[status]
  return (
    <span className={`chip ${RESOURCE_TONE[status]}`}>
      {withPrefix ? `Chip: ${label}` : label}
    </span>
  )
}

const DELIVERY_TONE: Record<DeliveryStatus, string> = {
  pendiente: 'chip-mauve',
  entregado: 'chip-blue',
  devuelto: 'chip-green',
  vencida: 'chip-red',
}

export function DeliveryChip({ status }: { status: DeliveryStatus }) {
  return (
    <span className={`chip ${DELIVERY_TONE[status]}`}>
      {status === 'vencida' ? <ShieldAlert size={12} /> : null}
      {DELIVERY_STATUS_LABEL[status]}
    </span>
  )
}

/** Etiqueta de estado genérica para el historial (estado anterior → nuevo). */
export function StatePill({ value }: { value: string | null }) {
  if (!value) return <span className="chip chip-neutral">—</span>
  const v = value.toLowerCase()
  if (v.includes('aprob') || v.includes('devuelt') || v === 'activa' || v === 'disponible')
    return <span className="chip chip-green">{prettyState(value)}</span>
  if (v.includes('pendient')) return <span className="chip chip-mauve">{prettyState(value)}</span>
  if (v.includes('cancel') || v.includes('inactiva')) return <span className="chip chip-neutral">{prettyState(value)}</span>
  if (v.includes('rechaz')) return <span className="chip chip-sand">{prettyState(value)}</span>
  if (v.includes('uso') || v.includes('prestad')) return <span className="chip chip-blue">{prettyState(value)}</span>
  if (v.includes('mantenim')) return <span className="chip chip-mauve">{prettyState(value)}</span>
  return <span className="chip chip-neutral">{prettyState(value)}</span>
}

export const prettyState = (value: string): string => {
  const map: Record<string, string> = {
    pendiente: 'Pendiente',
    aprobada: 'Aprobada',
    rechazada: 'Rechazada',
    cancelada: 'Cancelada',
    finalizada: 'Finalizada',
    entregado: 'Entregado',
    devuelto: 'Devuelto',
    vencida: 'Vencida',
    disponible: 'Disponible',
    prestado: 'Prestado',
    en_uso: 'En uso',
    mantenimiento: 'En mantenimiento',
    fuera_servicio: 'Fuera de servicio',
    activa: 'Activa',
    inactiva: 'Inactiva',
  }
  return map[value.toLowerCase()] ?? value
}

export const StateIcons = { CalendarX2, CircleDashed, Clock, PackageCheck, Wrench }
