import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Info,
  Send,
} from 'lucide-react'
import '../css/base.css'
import '../css/pages.css'
import { AppShell } from '../components/AppShell'
import { EmptyState, Field, FormError, FormSuccess, Spinner, toast } from '../components/ui'
import { useSession } from '../js/session'
import { addDays, fmtDate, fmtRange, fmtTime, todayISO } from '../js/dates'
import { getApi } from '../services/data'
import { freeSegments, isBookable, toMinutes, validateSchedule } from '../services/rules'
import type { Reservation, ReservationRequest, Resource, Settings } from '../services/types'

const KINDS = [
  { key: 'todos', label: 'Todos' },
  { key: 'espacio', label: 'Espacios' },
  { key: 'equipo', label: 'Equipos' },
  { key: 'elemento', label: 'Laves y controles' },
]

function NuevaSolicitudPage() {
  const { profile, loading } = useSession()
  const [resources, setResources] = useState<Resource[]>([])
  const [requests, setRequests] = useState<ReservationRequest[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [kind, setKind] = useState('todos')
  const [resourceId, setResourceId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('11:00')
  const [purpose, setPurpose] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
    const api = getApi()
    Promise.all([
      api.listResources(),
      api.listRequests({ onlyMine: true }),
      api.listReservations(),
      api.getSettings(),
    ])
      .then(([res, req, rsv, st]) => {
        setResources(res)
        setRequests(req)
        setReservations(rsv)
        setSettings(st)
        const first = res.find((r) => isBookable(r))
        if (first) setResourceId(first.id)
      })
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setBusy(false))
  }, [profile])

  const filteredResources = useMemo(
    () => resources.filter((r) => (kind === 'todos' ? true : r.kind === kind)),
    [resources, kind],
  )

  const selected = resources.find((r) => r.id === resourceId)
  const opening = settings?.opening_time ?? '06:00'
  const closing = settings?.closing_time ?? '18:00'

  /** Ocupación del recurso en la fecha elegida (reservas aprobadas). */
  const busyRanges = useMemo(
    () =>
      reservations
        .filter((r) => r.resource_id === resourceId && r.reservation_date === date && r.status === 'aprobada')
        .map((r) => ({ start_time: r.start_time, end_time: r.end_time })),
    [reservations, resourceId, date],
  )

  const free = useMemo(() => freeSegments(opening, closing, busyRanges), [opening, closing, busyRanges])

  const totalWindow = toMinutes(closing) - toMinutes(opening)
  const busyMinutes = busyRanges.reduce(
    (acc, r) => acc + (toMinutes(r.end_time) - toMinutes(r.start_time)),
    0,
  )
  const busyPct = totalWindow > 0 ? Math.min(100, Math.round((busyMinutes / totalWindow) * 100)) : 0

  const availableSlots = useMemo(() => {
    const slots: string[] = []
    for (let m = toMinutes(opening); m < toMinutes(closing); m += 60) {
      const label = `${String(Math.floor(m / 60)).padStart(2, '0')}:00`
      const isBusy = busyRanges.some(
        (b) => toMinutes(b.start_time) <= m && m < toMinutes(b.end_time),
      )
      if (!isBusy) slots.push(label)
    }
    return slots
  }, [opening, closing, busyRanges])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!resourceId) {
      setError('Selecciona el espacio o recurso que deseas reservar.')
      return
    }
    const scheduleError = validateSchedule(start, end)
    if (scheduleError) {
      setError(scheduleError)
      return
    }
    if (toMinutes(start) < toMinutes(opening) || toMinutes(end) > toMinutes(closing)) {
      setError(`El horario institucional disponible va de ${fmtTime(opening)} a ${fmtTime(closing)}.`)
      return
    }
    if (!purpose.trim() || purpose.trim().length < 6) {
      setError('Describe brevemente el propósito de la reserva.')
      return
    }
    if (date < todayISO()) {
      setError('No puedes solicitar una fecha anterior a hoy.')
      return
    }

    setSaving(true)
    try {
      await getApi().createRequest({
        resource_id: resourceId,
        request_date: date,
        start_time: start,
        end_time: end,
        purpose: purpose.trim(),
      })
      toast.success('Solicitud enviada. Queda pendiente de aprobación.')
      setSuccess(
        'Solicitud registrada correctamente. El encargado de sistemas revisará la disponibilidad y responderá.',
      )
      setPurpose('')
      const refreshed = await getApi().listRequests({ onlyMine: true })
      setRequests(refreshed)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Verificando sesión…" />
  if (!profile) return null
  if (busy) return <Spinner label="Cargando disponibilidad…" />

  const isAdmin = profile.role === 'encargado'
  if (isAdmin) {
    return (
      <AppShell profile={profile} title="Nueva solicitud">
        <div className="card card-pad">
          <EmptyState
            icon={<Info />}
            title="Este formulario es para profesores"
            hint="Como encargado de sistemas puedes crear reservas aprobadas directamente desde el calendario."
          />
          <div className="flex justify-end mt-16">
            <a className="btn btn-primary" href="/calendario.html">
              Ir al calendario
            </a>
          </div>
        </div>
      </AppShell>
    )
  }

  const recent = requests.filter((r) => r.status === 'pendiente').slice(0, 3)

  return (
    <AppShell
      profile={profile}
      title="Nueva solicitud"
      subtitle="Selecciona el recurso, la fecha y el horario que necesitas"
    >
      {loadError && (
        <div className="form-error mb-16">
          <AlertTriangle size={16} />
          <span>{loadError}</span>
        </div>
      )}

      {recent.length > 0 && (
        <div className="pending-banner">
          <Clock size={17} />
          <span>
            Tienes {recent.length} solicitud{recent.length === 1 ? '' : 'es'} pendiente
            {recent.length === 1 ? '' : 's'}. Puedes consultarlas en{' '}
            <a href="/solicitudes.html">Mis reservas</a>.
          </span>
        </div>
      )}

      <div className="request-layout">
        <form className="card card-pad" onSubmit={submit} noValidate>
          <FormError message={error} />
          <FormSuccess message={success} />

          <span className="eyebrow">Tipo de recurso</span>
          <div className="type-chips mt-8">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                className="chip chip-select"
                aria-pressed={kind === k.key}
                onClick={() => setKind(k.key)}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div className="mt-16">
            <Field label="Recurso" htmlFor="resource">
              <select
                id="resource"
                className="select"
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                required
              >
                <option value="">Selecciona un recurso…</option>
                {filteredResources.map((r) => (
                  <option key={r.id} value={r.id} disabled={!isBookable(r)}>
                    {r.name} — {r.location_label}
                    {!isBookable(r) ? ' (no disponible)' : ''}
                  </option>
                ))}
              </select>
              {selected && !isBookable(selected) && (
                <p className="field-hint" style={{ color: 'var(--red-ink)' }}>
                  Este recurso no admite reservas en este momento.
                </p>
              )}
            </Field>
          </div>

          <Field label="Fecha" htmlFor="date">
            <input
              id="date"
              className="input"
              type="date"
              min={todayISO()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>

          <div className="form-row two">
            <Field label="Hora de inicio" htmlFor="start">
              <input
                id="start"
                className="input"
                type="time"
                value={start}
                min={opening}
                max={closing}
                step={900}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </Field>
            <Field label="Hora de fin" htmlFor="end">
              <input
                id="end"
                className="input"
                type="time"
                value={end}
                min={opening}
                max={closing}
                step={900}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </Field>
          </div>

          <Field
            label="Propósito"
            htmlFor="purpose"
            hint="Ej.: Clase de Programación I – Sección A. El encargado usará este dato para decidir."
          >
            <textarea
              id="purpose"
              className="textarea"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Describe la actividad académica y el grupo"
              maxLength={400}
              required
            />
          </Field>

          <div className="flex gap-10 flex-wrap">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              <Send size={15} /> {saving ? 'Enviando…' : 'Enviar solicitud'}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                setPurpose('')
                setError(null)
                setSuccess(null)
              }}
            >
              Limpiar
            </button>
          </div>

          <p className="text-xs text-muted mt-16" style={{ lineHeight: 1.6 }}>
            Al enviar, la solicitud queda en estado <strong>Pendiente</strong>. Solo el encargado de
            sistemas e innovación tecnológica puede aprobarla o rechazarla.
          </p>
        </form>

        <aside className="card card-pad">
          <h2 className="card-title mb-12">Disponibilidad del día</h2>
          <div className="cal-detail mb-12">
            <div className="title">{selected?.name ?? 'Selecciona un recurso'}</div>
            <p className="meta">{fmtDate(date)} · {fmtRange(opening, closing)}</p>
          </div>

          <div className="flex gap-12 text-xs text-muted mb-8">
            <span className="flex items-center gap-4">
              <span className="legend-dot" style={{ background: 'var(--green-500)' }} /> Libre
            </span>
            <span className="flex items-center gap-4">
              <span className="legend-dot" style={{ background: 'var(--wine-600)' }} /> Ocupado
            </span>
          </div>

          <div
            className="availability-bar"
            style={{ height: 12 }}
            role="img"
            aria-label={`Ocupación del ${busyPct}% en la fecha seleccionada`}
          >
            {busyRanges.length ? (
              <>
                {free.map((f) => (
                  <span
                    key={`f-${f.start_time}`}
                    className="free"
                    style={{ flex: toMinutes(f.end_time) - toMinutes(f.start_time) }}
                  />
                ))}
                {busyRanges.map((b, i) => (
                  <span
                    key={`b-${b.start_time}-${i}`}
                    className="busy"
                    style={{ flex: toMinutes(b.end_time) - toMinutes(b.start_time) }}
                  />
                ))}
              </>
            ) : (
              <span className="free" style={{ flex: 1 }} />
            )}
          </div>

          <div className="availability-slots">
            {availableSlots.length ? (
              availableSlots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  className="slot-chip"
                  onClick={() => {
                    setStart(slot)
                    const endMinutes = Math.min(toMinutes(slot) + 120, toMinutes(closing))
                    setEnd(`${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:00`)
                  }}
                  title="Usar esta hora de inicio"
                >
                  {fmtTime(slot)}
                </button>
              ))
            ) : (
              <span className="slot-chip busy">Sin franjas libres</span>
            )}
          </div>

          <div className="mt-16">
            <p className="text-xs text-muted" style={{ lineHeight: 1.6 }}>
              <CalendarDays size={12} style={{ verticalAlign: '-2px' }} /> Las franjas ocupadas
              corresponden a reservas aprobadas. Las solicitudes pendientes no bloquean la
              disponibilidad hasta ser aprobadas.
            </p>
          </div>

          {free.length > 0 && (
            <div className="info-note mt-16">
              <CheckCircle2 size={16} />
              <div>
                Franjas totalmente libres:{' '}
                {free.map((f) => fmtRange(f.start_time, f.end_time)).join(' · ')}
              </div>
            </div>
          )}

          <div className="mt-16" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <p className="eyebrow mb-8">Accesos rápidos</p>
            <div className="flex gap-8 flex-wrap">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDate(todayISO())}>
                Hoy
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setDate(addDays(todayISO(), 1))}
              >
                Mañana
              </button>
              <a className="btn btn-ghost btn-sm" href="/calendario.html">
                Ver calendario
              </a>
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  )
}

createRoot(document.getElementById('root')!).render(<NuevaSolicitudPage />)
