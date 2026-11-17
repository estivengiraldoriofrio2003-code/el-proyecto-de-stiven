/** Utilidades de fecha/hora en español (es-CO) sin dependencias externas. */

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DAYS_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const pad = (n: number) => String(n).padStart(2, '0')

export const toISO = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const todayISO = (): string => toISO(new Date())

/** Interpreta YYYY-MM-DD como fecha local (evita el desfase UTC). */
export const parseISO = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0)
}

export const addDays = (iso: string, days: number): string => {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

export const addMonths = (iso: string, months: number): string => {
  const d = parseISO(iso)
  d.setMonth(d.getMonth() + months)
  return toISO(d)
}

/** Semana que inicia en lunes. */
export const startOfWeek = (iso: string): string => {
  const d = parseISO(iso)
  const day = d.getDay() === 0 ? 7 : d.getDay()
  return addDays(iso, 1 - day)
}

export const weekDays = (iso: string): string[] => {
  const start = startOfWeek(iso)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Matriz de 6x7 días para la vista mensual. */
export const monthMatrix = (iso: string): string[][] => {
  const d = parseISO(iso)
  const first = new Date(d.getFullYear(), d.getMonth(), 1, 12)
  const start = startOfWeek(toISO(first))
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)),
  )
}

export const sameMonth = (iso: string, ref: string): boolean => iso.slice(0, 7) === ref.slice(0, 7)

export const fmtDateShort = (iso: string): string => {
  const d = parseISO(iso)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

export const fmtDate = (iso: string): string => {
  const d = parseISO(iso)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

export const fmtDateLong = (iso: string): string => {
  const d = parseISO(iso)
  return `${DAYS_LONG[d.getDay()]}, ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}`
}

export const fmtMonthYear = (iso: string): string => {
  const d = parseISO(iso)
  const name = MONTHS_LONG[d.getMonth()]
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${d.getFullYear()}`
}

export const fmtDayName = (iso: string, short = false): string => {
  const d = parseISO(iso)
  return short ? DAYS_SHORT[d.getDay()] : DAYS_LONG[d.getDay()]
}

/** '09:00' -> '9:00 AM' */
export const fmtTime = (time: string): string => {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}:${pad(m || 0)} ${suffix}`
}

export const fmtRange = (start: string, end: string): string => `${fmtTime(start)} - ${fmtTime(end)}`

export const fmtDateTime = (value: string | null | undefined): string => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const fmtDateTimeShort = (value: string | null | undefined): string => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Input datetime-local a partir de Date. */
export const toLocalInput = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

/** Convierte un valor de <input type="datetime-local"> a ISO (UTC) para la base de datos. */
export const dateTimeLocalToISO = (value: string): string => {
  if (!value) return new Date().toISOString()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

/** Valor para <input type="datetime-local"> a partir de un ISO de la base de datos. */
export const isoToLocalInput = (value: string | null | undefined): string => {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : toLocalInput(d)
}

export const isPast = (iso: string): boolean => iso < todayISO()

export const relativeLabel = (iso: string): string => {
  const t = todayISO()
  if (iso === t) return 'Hoy'
  if (iso === addDays(t, 1)) return 'Mañana'
  if (iso === addDays(t, -1)) return 'Ayer'
  return fmtDate(iso)
}

export const isToday = (iso: string): boolean => iso === todayISO()
