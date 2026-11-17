import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Info,
  Plus,
  Wrench,
} from 'lucide-react'
import '../css/base.css'
import '../css/pages.css'
import { AppShell } from '../components/AppShell'
import { EmptyState, Field, FormError, Modal, Spinner, toast } from '../components/ui'
import { StatusChip } from '../components/StatusChip'
import { useSession } from '../js/session'
import {
  addDays,
  addMonths,
  fmtDate,
  fmtDateLong,
  fmtMonthYear,
  fmtRange,
  fmtTime,
  monthMatrix,
  sameMonth,
  startOfWeek,
  todayISO,
  weekDays,
} from '../js/dates'
import { getApi } from '../services/data'
import { freeSegments, toMinutes } from '../services/rules'
import type {
  Profile,
  Reservation,
  ReservationRequest,
  Resource,
  Settings,
} from '../services/types'

type View = 'dia' | 'semana' | 'mes'

interface CalEvent {
  id: string
  kind: 'reserva' | 'solicitud' | 'bloqueo'
  status: string
  start: string
  end: string
  /** Fecha YYYY-MM-DD; vacía para bloqueos permanentes. */
  date: string
  title: string
  subtitle: string
  requester?: string
  purpose?: string
  resourceId: string
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 6) // 06:00–18:00

function CalendarPage() {
  const { profile, loading } = useSession()
  const [view, setView] = useState<View>('semana')
  const [cursor, setCursor] = useState(todayISO())
  const [resourceFilter, setResourceFilter] = useState<string>('all')
  const [resources, setResources] = useState<Resource[]>([])
  const [requests, setRequests] = useState<ReservationRequest[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal de reserva administrativa
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    resource_id: '',
    request_date: todayISO(),
    start_time: '08:00',
    end_time: '10:00',
    purpose: '',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<CalEvent | null>(null)

  const isAdmin = profile?.role === 'encargado'
  const reload = useCallback(async () => {
    try {
      const api = getApi()
      const [res, req, rs, st] = await Promise.all([
        api.listResources(),
        api.listRequests(),
        api.listReservations(),
        api.getSettings(),
      ])
      setResources(res)
      setRequests(req)
      setReservations(rs)
      setSettings(st)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (profile) void reload()
  }, [profile, reload])

  const events = useMemo<CalEvent[]>(() => {
    const list: CalEvent[] = []
    for (const r of reservations) {
      if (r.status !== 'aprobada') continue
      list.push({
        id: `res-${r.id}`,
        kind: 'reserva',
        status: 'aprobada',
        start: r.start_time,
        end: r.end_time,
        date: r.reservation_date,
        title: r.resource_label?.split(' · ')[0] ?? 'Reserva',
        subtitle: `Prof. ${r.requester_name ?? '—'}`,
        requester: r.requester_name,
        purpose: 'Reserva aprobada',
        resourceId: r.resource_id,
      })
    }
    for (const q of requests) {
      if (q.status !== 'pendiente') continue
      list.push({
        id: `req-${q.id}`,
        kind: 'solicitud',
        status: 'pendiente',
        start: q.start_time,
        end: q.end_time,
        date: q.request_date,
        title: q.resource_label?.split(' · ')[0] ?? 'Solicitud',
        subtitle: `Prof. ${q.requester_name ?? '—'}`,
        requester: q.requester_name,
        purpose: q.purpose,
        resourceId: q.resource_id,
      })
    }
    for (const r of resources) {
      if (r.status !== 'mantenimiento' && r.status !== 'fuera_servicio') continue
      list.push({
        id: `blk-${r.id}`,
        kind: 'bloqueo',
        status: r.status,
        start: '06:00',
        end: '18:00',
        date: '',
        title: r.name,
        subtitle: r.status === 'mantenimiento' ? 'Bloqueo / Mantenimiento' : 'Fuera de servicio',
        purpose: r.status,
        resourceId: r.id,
      })
    }
    return list
  }, [reservations, requests, resources])

  const dateOf = (ev: CalEvent): string => ev.date

  const visible = events.filter((ev) => {
    if (resourceFilter !== 'all' && ev.resourceId !== resourceFilter) return false
    return true
  })

  const eventsForDate = (iso: string): CalEvent[] =>
    visible
      .filter((ev) => dateOf(ev) === iso || (ev.kind === 'bloqueo' && dateOf(ev) === ''))
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))

  const canCreate = Boolean(isAdmin)

  const openCreate = (date?: string, resourceId?: string) => {
    if (!canCreate) return
    setForm({
      resource_id: resourceId ?? (resourceFilter !== 'all' ? resourceFilter : resources[0]?.id ?? ''),
      request_date: date ?? cursor,
      start_time: '08:00',
      end_time: '10:00',
      purpose: '',
    })
    setFormError(null)
    setCreating(true)
  }

  /** Reserva administrativa directa: crea la solicitud y la aprueba de inmediato. */
  const submitReservation = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      const api = getApi()
      const created = await api.createRequest({
        resource_id: form.resource_id,
        request_date: form.request_date,
        start_time: form.start_time,
        end_time: form.end_time,
        purpose: form.purpose || 'Reserva administrativa',
      })
      await api.decideRequest(created.id, 'aprobada', 'Reserva creada por el encargado de sistemas.')
      toast.success('Reserva creada y aprobada.')
      setCreating(false)
      await reload()
    } catch (e) {
      setFormError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const goPrev = () => {
    if (view === 'dia') setCursor(addDays(cursor, -1))
    else if (view === 'semana') setCursor(addDays(cursor, -7))
    else setCursor(addMonths(cursor, -1))
  }
  const goNext = () => {
    if (view === 'dia') setCursor(addDays(cursor, 1))
    else if (view === 'semana') setCursor(addDays(cursor, 7))
    else setCursor(addMonths(cursor, 1))
  }

  const opening = settings?.opening_time ?? '06:00'
  const closing = settings?.closing_time ?? '18:00'
  const hours = HOURS.filter((h) => h >= toMinutes(opening) / 60 && h <= toMinutes(closing) / 60 - 1)

  const dayForHour = (iso: string, hour: number) => {
    const start = `${String(hour).padStart(2, '0')}:00`
    const end = `${String(hour + 1).padStart(2, '0')}:00`
    return eventsForDate(iso).filter(
      (ev) => toMinutes(ev.start) < toMinutes(end) && toMinutes(start) < toMinutes(ev.end),
    )
  }

  const week = weekDays(cursor)
  const month = monthMatrix(cursor)
  const dayBusy = eventsForDate(cursor).map((ev) => ({ start_time: ev.start, end_time: ev.end }))
  const dayFree = freeSegments(opening, closing, dayBusy)

  if (loading) return <Spinner label="Verificando sesión…" />
  if (!profile) return null

  return (
    <AppShell
      profile={profile}
      title="Calendario"
      subtitle={isAdmin ? 'Programación general de espacios y recursos' : 'Consulta de disponibilidad'}
      actions={
        canCreate ? (
          <button className="btn btn-primary btn-sm" onClick={() => openCreate()}>
            <Plus size={15} /> Nueva reserva
          </button>
        ) : (
          <a className="btn btn-primary btn-sm" href="/nueva-solicitud.html">
            <Plus size={15} /> Solicitar
          </a>
        )
      }
    >
      {error && (
        <div className="form-error mb-16">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="calendar-toolbar">
        <div className="segmented" role="group" aria-label="Vista del calendario">
          {(['dia', 'semana', 'mes'] as View[]).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'dia' ? 'Día' : v === 'semana' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <button className="icon-btn" onClick={goPrev} aria-label="Anterior">
            <ChevronLeft size={16} />
          </button>
          <strong className="text-sm nowrap" style={{ minWidth: 150, textAlign: 'center' }}>
            {view === 'mes'
              ? fmtMonthYear(cursor)
              : view === 'semana'
                ? `${fmtDate(week[0])} – ${fmtDate(week[6])}`
                : fmtDate(cursor)}
          </strong>
          <button className="icon-btn" onClick={goNext} aria-label="Siguiente">
            <ChevronRight size={16} />
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setCursor(todayISO())}>
            Hoy
          </button>
        </div>

        <div className="flex items-center gap-8" style={{ marginLeft: 'auto' }}>
          <select
            className="select"
            style={{ maxWidth: 220 }}
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
            aria-label="Filtrar por recurso"
          >
            <option value="all">Todos los recursos</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="resource-filter-chips mb-12">
        <button
          className="chip chip-select"
          aria-pressed={resourceFilter === 'all'}
          onClick={() => setResourceFilter('all')}
        >
          Todos
        </button>
        {resources.slice(0, 8).map((r) => (
          <button
            key={r.id}
            className="chip chip-select"
            aria-pressed={resourceFilter === r.id}
            onClick={() => setResourceFilter(r.id)}
          >
            {r.name}
          </button>
        ))}
      </div>

      {busy ? (
        <Spinner label="Cargando calendario…" />
      ) : (
        <div className="calendar-layout">
          <div className="cal-board">
            {view === 'mes' && (
              <>
                <div className="cal-month">
                  {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
                    <div className="cal-month-dow" key={d}>
                      {d}
                    </div>
                  ))}
                  {month.flat().map((iso) => {
                    const dayEvents = eventsForDate(iso)
                    return (
                      <button
                        key={iso}
                        className={[
                          'cal-month-cell',
                          sameMonth(iso, cursor) ? '' : 'other',
                          iso === todayISO() ? 'today' : '',
                          iso === cursor ? 'selected' : '',
                        ].join(' ')}
                        onClick={() => setCursor(iso)}
                        onDoubleClick={() => openCreate(iso)}
                        aria-label={`${fmtDate(iso)}, ${dayEvents.length} eventos`}
                      >
                        <span className="cal-month-daynum">{Number(iso.slice(8))}</span>
                        {dayEvents.slice(0, 3).map((ev) => (
                          <span
                            key={ev.id}
                            className={`cal-month-pill ${
                              ev.kind === 'bloqueo' ? 'mantenimiento' : ev.status
                            }`}
                          >
                            {fmtTime(ev.start)} {ev.title}
                          </span>
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="cal-month-more">+{dayEvents.length - 3} más</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {view === 'dia' && (
              <div>
                <div className="cal-week-head" style={{ gridTemplateColumns: '58px 1fr' }}>
                  <div />
                  <div className={`cal-day-head ${cursor === todayISO() ? 'today' : ''}`}>
                    {fmtDateLong(cursor)}
                  </div>
                </div>
                <div className="cal-week-body" style={{ gridTemplateColumns: '58px 1fr', maxHeight: 560 }}>
                  <div className="cal-hour-col">
                    {hours.map((h) => (
                      <div className="cal-hour" key={h}>
                        {`${String(h).padStart(2, '0')}:00`}
                      </div>
                    ))}
                  </div>
                  <div className="cal-col">
                    {hours.map((h) => (
                      <div className="cal-slot" key={h} />
                    ))}
                    {eventsForDate(cursor).map((ev) => {
                      const top = ((toMinutes(ev.start) - toMinutes(opening)) / 60) * 48
                      const height = Math.max(
                        26,
                        ((toMinutes(ev.end) - toMinutes(ev.start)) / 60) * 48 - 3,
                      )
                      return (
                        <button
                          key={ev.id}
                          className={`cal-event ${ev.kind === 'bloqueo' ? 'mantenimiento' : ev.status}`}
                          style={{ top, height }}
                          onClick={() => setSelected(ev)}
                        >
                          <span className="ev-title">{ev.title}</span>
                          <span className="ev-meta">{ev.subtitle}</span>
                          <span className="ev-meta">{fmtRange(ev.start, ev.end)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {view === 'semana' && (
              <div>
                <div className="cal-week-head">
                  <div />
                  {week.map((iso) => (
                    <button
                      key={iso}
                      className={`cal-day-head ${iso === todayISO() ? 'today' : ''}`}
                      onClick={() => setCursor(iso)}
                      style={{ border: 0, background: 'transparent', cursor: 'pointer' }}
                    >
                      <div style={{ fontSize: 11, opacity: 0.75 }}>
                        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][week.indexOf(iso)]}
                      </div>
                      <div>{Number(iso.slice(8))}</div>
                    </button>
                  ))}
                </div>
                <div className="cal-week-body">
                  <div className="cal-hour-col">
                    {hours.map((h) => (
                      <div className="cal-hour" key={h}>
                        {`${String(h).padStart(2, '0')}:00`}
                      </div>
                    ))}
                  </div>
                  {week.map((iso) => (
                    <div className="cal-col" key={iso}>
                      {hours.map((h) => (
                        <div className="cal-slot" key={h}>
                          {dayForHour(iso, h)
                            .slice(0, 1)
                            .map((ev) => (
                              <span key={ev.id} className="sr-only">
                                {ev.title}
                              </span>
                            ))}
                        </div>
                      ))}
                      {eventsForDate(iso).map((ev) => {
                        const top = ((toMinutes(ev.start) - toMinutes(opening)) / 60) * 48
                        const height = Math.max(
                          24,
                          ((toMinutes(ev.end) - toMinutes(ev.start)) / 60) * 48 - 3,
                        )
                        const overlapping = eventsForDate(iso).filter(
                          (o) =>
                            o.id !== ev.id &&
                            o.resourceId !== ev.resourceId &&
                            toMinutes(o.start) < toMinutes(ev.end) &&
                            toMinutes(ev.start) < toMinutes(o.end),
                        ).length
                        return (
                          <button
                            key={ev.id}
                            className={`cal-event ${ev.kind === 'bloqueo' ? 'mantenimiento' : ev.status}`}
                            style={{
                              top,
                              height,
                              left: 3,
                              right: overlapping ? 3 + Math.min(overlapping, 2) * 6 : 3,
                            }}
                            onClick={() => setSelected(ev)}
                          >
                            <span className="ev-title">{ev.title}</span>
                            <span className="ev-meta">{ev.subtitle}</span>
                            <span className="ev-meta">{fmtTime(ev.start)}</span>
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="cal-side">
            <div className="card card-pad">
              <div className="flex justify-between items-center mb-12">
                <h2 className="card-title">Detalle</h2>
                <CalendarDays size={16} style={{ color: 'var(--ink-400)' }} />
              </div>
              <div className="cal-detail">
                <div className="title">{fmtDateLong(cursor)}</div>
                <p className="meta">
                  {eventsForDate(cursor).filter((e) => e.kind !== 'bloqueo').length} eventos ·{' '}
                  {dayFree.length} franjas libres
                </p>
              </div>

              <div className="availability-bar mt-12" aria-hidden="true">
                {dayFree.map((f) => (
                  <span
                    key={`f${f.start_time}`}
                    className="free"
                    style={{ flex: toMinutes(f.end_time) - toMinutes(f.start_time) }}
                  />
                ))}
                {dayBusy.map((b, i) => (
                  <span
                    key={`b${b.start_time}${i}`}
                    className="busy"
                    style={{ flex: toMinutes(b.end_time) - toMinutes(b.start_time) }}
                  />
                ))}
              </div>
              <div className="availability-slots">
                {dayFree.length ? (
                  dayFree.map((f) => (
                    <span className="slot-chip" key={f.start_time}>
                      {fmtRange(f.start_time, f.end_time)}
                    </span>
                  ))
                ) : (
                  <span className="slot-chip busy">Sin disponibilidad</span>
                )}
              </div>

              {canCreate && (
                <button className="btn btn-secondary btn-block mt-16" onClick={() => openCreate(cursor)}>
                  <Plus size={15} /> Reservar este día
                </button>
              )}
            </div>

            <div className="card card-pad">
              <h2 className="card-title mb-12">Convenciones</h2>
              <div className="legend">
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: 'var(--green-500)' }} />
                  Reserva aprobada
                </div>
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: 'var(--mauve-500)' }} />
                  Solicitud pendiente
                </div>
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: 'var(--sand-500)' }} />
                  Bloqueo o mantenimiento
                </div>
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: 'var(--cream-300)' }} />
                  No disponible
                </div>
              </div>
              <p className="text-xs text-muted mt-12" style={{ lineHeight: 1.5 }}>
                <Info size={12} style={{ verticalAlign: '-2px' }} /> Una reserva cancelada no bloquea la
                disponibilidad.
              </p>
            </div>
          </aside>
        </div>
      )}

      {/* Detalle de evento */}
      <Modal
        open={Boolean(selected)}
        title={selected?.title ?? ''}
        subtitle={selected ? fmtRange(selected.start, selected.end) : undefined}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div>
            <div className="flex gap-8 items-center mb-12">
              {selected.kind === 'bloqueo' ? (
                <span className="chip chip-mauve">
                  <Wrench size={12} /> {selected.subtitle}
                </span>
              ) : (
                <StatusChip status={selected.status as ReservationRequest['status']} />
              )}
              <span className="text-xs text-muted">{selected.requester ?? 'Sistema'}</span>
            </div>
            <div className="delivery-detail-list">
              <div className="delivery-detail-row">
                <span className="k">Propósito</span>
                <span className="v">{selected.purpose ?? '—'}</span>
              </div>
              <div className="delivery-detail-row">
                <span className="k">Recurso</span>
                <span className="v">{resources.find((r) => r.id === selected.resourceId)?.name ?? '—'}</span>
              </div>
              <div className="delivery-detail-row">
                <span className="k">Fecha</span>
                <span className="v">{dateOf(selected) ? fmtDate(dateOf(selected)) : 'Bloqueo permanente'}</span>
              </div>
            </div>
            {!isAdmin && selected.kind === 'reserva' && (
              <p className="text-xs text-muted">
                Esta franja está ocupada. Puedes solicitar otro horario libre.
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Reserva administrativa */}
      <Modal
        open={creating}
        title="Nueva reserva administrativa"
        subtitle="El encargado puede crear reservas aprobadas directamente."
        onClose={() => !saving && setCreating(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCreating(false)} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={submitReservation} disabled={saving}>
              {saving ? 'Guardando…' : 'Crear reserva'}
            </button>
          </>
        }
      >
        <form onSubmit={submitReservation}>
          <FormError message={formError} />
          <Field label="Recurso" htmlFor="cal-resource">
            <select
              id="cal-resource"
              className="select"
              value={form.resource_id}
              onChange={(e) => setForm({ ...form, resource_id: e.target.value })}
              required
            >
              {resources
                .filter((r) => r.is_reservable)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.location_label}
                  </option>
                ))}
            </select>
          </Field>
          <div className="form-row two">
            <Field label="Fecha" htmlFor="cal-date">
              <input
                id="cal-date"
                className="input"
                type="date"
                value={form.request_date}
                onChange={(e) => setForm({ ...form, request_date: e.target.value })}
                required
              />
            </Field>
            <div />
          </div>
          <div className="form-row two">
            <Field label="Hora de inicio" htmlFor="cal-start">
              <input
                id="cal-start"
                className="input"
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                required
              />
            </Field>
            <Field label="Hora de fin" htmlFor="cal-end">
              <input
                id="cal-end"
                className="input"
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                required
              />
            </Field>
          </div>
          <Field label="Propósito" htmlFor="cal-purpose">
            <textarea
              id="cal-purpose"
              className="textarea"
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              placeholder="Motivo de la reserva"
            />
          </Field>
        </form>
      </Modal>
    </AppShell>
  )
}

createRoot(document.getElementById('root')!).render(<CalendarPage />)
