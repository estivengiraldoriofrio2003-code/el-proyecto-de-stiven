import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  DoorOpen,
  PackageCheck,
  Plus,
  ShieldAlert,
  Wrench,
  XCircle,
} from 'lucide-react'
import '../css/base.css'
import '../css/pages.css'
import { AppShell } from '../components/AppShell'
import { EmptyState, Modal, Spinner, FormError, toast } from '../components/ui'
import { StatusChip } from '../components/StatusChip'
import { useSession } from '../js/session'
import {
  fmtDate,
  fmtRange,
  fmtTime,
  isToday,
  todayISO,
} from '../js/dates'
import { getApi } from '../services/data'
import { canDecide, isBookable, toMinutes } from '../services/rules'
import type {
  Delivery,
  Profile,
  Reservation,
  ReservationRequest,
  Resource,
} from '../services/types'

interface Bundle {
  requests: ReservationRequest[]
  reservations: Reservation[]
  deliveries: Delivery[]
  resources: Resource[]
}

/* -------------------------------- Profesor -------------------------------- */

function ProfessorPanel({ profile }: { profile: Profile }) {
  const [data, setData] = useState<Bundle | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const api = getApi()
    Promise.all([
      api.listRequests({ onlyMine: true }),
      api.listReservations(),
      api.listDeliveries(),
      api.listResources(),
    ])
      .then(([requests, reservations, deliveries, resources]) =>
        setData({ requests, reservations, deliveries, resources }),
      )
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <EmptyState title="No se pudo cargar el panel" hint={error} />
  if (!data) return <Spinner label="Cargando tu panel…" />

  const today = todayISO()
  const mine = data.requests
  const upcoming = mine
    .filter((r) => r.status === 'aprobada' && r.request_date >= today)
    .sort((a, b) => `${a.request_date}${a.start_time}`.localeCompare(`${b.request_date}${b.start_time}`))
  const next = upcoming[0]
  const pending = mine.filter((r) => r.status === 'pendiente')
  const approved = mine.filter((r) => r.status === 'aprobada')
  const rejected = mine.filter((r) => r.status === 'rechazada' || r.status === 'cancelada')
  const recent = [...mine]
    .sort((a, b) => `${b.request_date}${b.start_time}`.localeCompare(`${a.request_date}${a.start_time}`))
    .slice(0, 5)

  // "Disponible ahora": recursos reservables, operativos y sin reserva activa en este momento.
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()
  const availableNow = data.resources
    .filter((r) => isBookable(r))
    .filter((r) => {
      const busy = data.reservations.some(
        (res) =>
          res.resource_id === r.id &&
          res.status === 'aprobada' &&
          res.reservation_date === today &&
          toMinutes(res.start_time) <= nowMinutes &&
          nowMinutes < toMinutes(res.end_time),
      )
      return !busy
    })

  return (
    <div className="panel-grid">
      <section>
        <h2 className="section-title">Próximas reservas</h2>
        {next ? (
          <div className="next-reservation">
            <div className="title">{next.resource_label}</div>
            <p className="text-sm text-muted">
              {fmtDate(next.request_date)} · {fmtRange(next.start_time, next.end_time)}
            </p>
            <div className="mt-8">
              <StatusChip status={next.status} />
            </div>
            <p className="text-xs text-muted mt-12" style={{ lineHeight: 1.5 }}>
              {next.purpose}
            </p>
          </div>
        ) : (
          <div className="card card-pad">
            <EmptyState
              icon={<CalendarClock />}
              title="Sin reservas próximas"
              hint="Cuando el encargado apruebe una solicitud aparecerá aquí."
            />
          </div>
        )}
        <div className="grid grid-2 mt-12">
          <div className="availability-tile">
            <strong style={{ display: 'block', fontFamily: 'var(--font-display)' }}>{approved.length}</strong>
            Reservas aprobadas
          </div>
          <div className="availability-tile">
            <strong style={{ display: 'block', fontFamily: 'var(--font-display)' }}>{rejected.length}</strong>
            Rechazadas o canceladas
          </div>
        </div>
      </section>

      <section>
        <div className="card-head">
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            Mis solicitudes
          </h2>
          <a href="/solicitudes.html" className="text-xs font-medium">
            Ver todas
          </a>
        </div>
        {recent.length ? (
          <div className="requests-list">
            {recent.slice(0, 4).map((r) => (
              <div className="request-card" key={r.id}>
                <div className="request-card-main">
                  <div className="request-card-title">{r.resource_label}</div>
                  <div className="request-card-meta">
                    <CalendarDays size={13} />
                    {fmtDate(r.request_date)}
                    <Clock size={13} />
                    {fmtRange(r.start_time, r.end_time)}
                  </div>
                </div>
                <StatusChip status={r.status} />
              </div>
            ))}
          </div>
        ) : (
          <div className="card card-pad">
            <EmptyState icon={<ClipboardList />} title="Aún no tienes solicitudes" hint="Crea tu primera solicitud de espacio." />
          </div>
        )}
        {pending.length > 0 && (
          <p className="text-xs text-muted mt-12">
            Tienes {pending.length} solicitud{pending.length === 1 ? '' : 'es'} pendiente
            {pending.length === 1 ? '' : 's'} de aprobación.
          </p>
        )}
      </section>

      <section>
        <h2 className="section-title">Disponible ahora</h2>
        <div className="grid" style={{ gap: 8 }}>
          {availableNow.slice(0, 4).map((r) => (
            <div className="availability-tile" key={r.id}>
              <strong style={{ display: 'block', color: 'var(--ink-900)', fontFamily: 'var(--font-display)' }}>
                {r.name}
              </strong>
              <span className="text-xs text-muted">{r.location_label}</span>
            </div>
          ))}
          {!availableNow.length && (
            <div className="availability-tile text-sm">
              No hay recursos libres en este momento. Consulta el calendario.
            </div>
          )}
        </div>
        <a className="btn btn-primary btn-block mt-16" href="/nueva-solicitud.html">
          <Plus size={16} /> Nueva solicitud
        </a>
      </section>
    </div>
  )
}

/* -------------------------------- Encargado ------------------------------- */

function AdminPanel({ profile }: { profile: Profile }) {
  const [data, setData] = useState<Bundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [deciding, setDeciding] = useState<ReservationRequest | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const load = useCallback(() => {
    const api = getApi()
    return Promise.all([
      api.listRequests(),
      api.listReservations(),
      api.listDeliveries(),
      api.listResources(),
    ])
      .then(([requests, reservations, deliveries, resources]) =>
        setData({ requests, reservations, deliveries, resources }),
      )
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    void load()
  }, [load, reloadKey])

  if (error) return <EmptyState title="No se pudo cargar el panel" hint={error} />
  if (!data) return <Spinner label="Cargando panel administrativo…" />

  const today = todayISO()
  const pending = data.requests.filter((r) => r.status === 'pendiente')
  const todayReservations = data.reservations.filter(
    (r) => r.reservation_date === today && r.status === 'aprobada',
  )
  const pendingDeliveries = data.deliveries.filter((d) => d.status === 'pendiente')
  const pendingReturns = data.deliveries.filter((d) => d.status === 'entregado' || d.status === 'vencida')
  const outOfService = data.resources.filter(
    (r) => r.status === 'fuera_servicio' || r.status === 'mantenimiento',
  )

  const decide = async (decision: 'aprobada' | 'rechazada') => {
    if (!deciding) return
    setBusy(true)
    setModalError(null)
    try {
      await getApi().decideRequest(deciding.id, decision, note)
      toast.success(
        decision === 'aprobada'
          ? 'Solicitud aprobada y reserva creada.'
          : 'Solicitud rechazada y notificada en el historial.',
      )
      setDeciding(null)
      setNote('')
      setReloadKey((k) => k + 1)
    } catch (e) {
      setModalError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Agenda del día: reservas aprobadas + recursos en mantenimiento (como en el mockup).
  const agenda = [
    ...todayReservations.map((r) => ({
      id: r.id,
      start: toMinutes(r.start_time),
      title: r.resource_label ?? 'Reserva',
      subtitle: r.requester_name ? `Prof. ${r.requester_name}` : 'Reserva aprobada',
      kind: 'aprobada' as const,
      time: `${fmtTime(r.start_time)} - ${fmtTime(r.end_time)}`,
    })),
    ...outOfService.map((r) => ({
      id: `m-${r.id}`,
      start: 0,
      title: r.name,
      subtitle: r.status === 'mantenimiento' ? 'Mantenimiento' : 'Fuera de servicio',
      kind: 'mantenimiento' as const,
      time: 'Todo el día',
    })),
  ].sort((a, b) => a.start - b.start)

  return (
    <>
      <div className="stat-grid mb-20">
        <div className="stat-card">
          <div>
            <div className="stat-value">{pending.length}</div>
            <div className="stat-label">Solicitudes pendientes</div>
          </div>
          <ClipboardList />
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-value">{todayReservations.length}</div>
            <div className="stat-label">Reservas de hoy</div>
          </div>
          <Clock />
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-value">{pendingDeliveries.length}</div>
            <div className="stat-label">Entregas pendientes</div>
          </div>
          <PackageCheck />
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-value">{pendingReturns.length}</div>
            <div className="stat-label">Devoluciones pendientes</div>
          </div>
          <AlertCircle />
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-value">{outOfService.length}</div>
            <div className="stat-label">Fuera de servicio</div>
          </div>
          <Wrench />
        </div>
      </div>

      <div className="panel-grid admin">
        <section>
          <div className="card-head">
            <h2 className="section-title" style={{ marginBottom: 0 }}>
              Solicitudes pendientes
            </h2>
            <a href="/solicitudes.html" className="text-xs font-medium">
              Ver todas
            </a>
          </div>

          {pending.length ? (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="table-wrap">
                <table className="table table-responsive">
                  <thead>
                    <tr>
                      <th>Profesor</th>
                      <th>Recurso</th>
                      <th>Fecha y hora</th>
                      <th>Propósito</th>
                      <th style={{ textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((r) => (
                      <tr key={r.id}>
                        <td data-label="Profesor">{r.requester_name}</td>
                        <td data-label="Recurso">{r.resource_label}</td>
                        <td data-label="Fecha y hora" className="nowrap">
                          {fmtDate(r.request_date)}
                          <br />
                          <span className="text-xs text-muted">{fmtRange(r.start_time, r.end_time)}</span>
                        </td>
                        <td data-label="Propósito" className="text-xs">
                          {r.purpose.length > 46 ? `${r.purpose.slice(0, 46)}…` : r.purpose}
                        </td>
                        <td data-label="Acciones">
                          <div className="table-actions">
                            <button
                              className="btn btn-approve btn-sm"
                              onClick={() => {
                                setDeciding(r)
                                setNote('')
                                setModalError(null)
                              }}
                            >
                              Aprobar
                            </button>
                            <button
                              className="btn btn-reject btn-sm"
                              onClick={() => {
                                setDeciding(r)
                                setNote('')
                                setModalError(null)
                              }}
                            >
                              Rechazar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="card card-pad">
              <EmptyState
                icon={<CheckCircle2 />}
                title="No hay solicitudes pendientes"
                hint="Todas las solicitudes recibidas ya fueron decididas."
              />
            </div>
          )}

          <div className="quick-actions mt-16">
            <a className="quick-action" href="/calendario.html">
              <CalendarDays /> Calendario general
            </a>
            <a className="quick-action" href="/recursos.html">
              <DoorOpen /> Administrar recursos
            </a>
            <a className="quick-action" href="/entregas.html">
              <PackageCheck /> Entregas y devoluciones
            </a>
            <a className="quick-action" href="/historial.html">
              <ShieldAlert /> Historial general
            </a>
          </div>
        </section>

        <aside className="card card-pad">
          <h2 className="section-title">Hoy</h2>
          {agenda.length ? (
            <div className="today-panel">
              {agenda.slice(0, 8).map((item) => (
                <div className="today-slot" key={item.id}>
                  <div className="today-slot-time">{item.time.split(' - ')[0]}</div>
                  <div className={`today-slot-event ${item.kind}`}>
                    <span className="t">{item.title}</span>
                    <span className="s" style={{ display: 'block' }}>
                      {item.subtitle} · {item.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<CalendarDays />}
              title="Sin eventos para hoy"
              hint="Cuando se aprueben reservas para la fecha aparecerán aquí."
            />
          )}
        </aside>
      </div>

      <Modal
        open={Boolean(deciding)}
        title="Decidir solicitud"
        subtitle={
          deciding
            ? `${deciding.resource_label} · ${fmtDate(deciding.request_date)} · ${fmtRange(
                deciding.start_time,
                deciding.end_time,
              )}`
            : undefined
        }
        onClose={() => !busy && setDeciding(null)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setDeciding(null)} disabled={busy}>
              Cancelar
            </button>
            <button className="btn btn-reject" onClick={() => decide('rechazada')} disabled={busy}>
              <XCircle size={15} /> Rechazar
            </button>
            <button className="btn btn-approve" onClick={() => decide('aprobada')} disabled={busy}>
              <CheckCircle2 size={15} /> Aprobar
            </button>
          </>
        }
      >
        <FormError message={modalError} />
        <p className="text-sm text-muted mb-12">
          Solicitada por <strong>{deciding?.requester_name}</strong>. Propósito: {deciding?.purpose}
        </p>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label" htmlFor="decision-note">
            Observación (obligatoria al rechazar)
          </label>
          <textarea
            id="decision-note"
            className="textarea"
            placeholder="Motivo del rechazo o nota para el profesor…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
          />
          <p className="field-hint">
            El sistema rechazará la operación si el recurso quedó fuera de servicio o si existe otra
            reserva aprobada en ese horario.
          </p>
        </div>
      </Modal>
    </>
  )
}

/* ---------------------------------- Shell --------------------------------- */

function PanelPage() {
  const { profile, loading } = useSession()

  if (loading) return <Spinner label="Verificando sesión…" />
  if (!profile) return null

  const isAdmin = profile.role === 'encargado'

  return (
    <AppShell
      profile={profile}
      title={isAdmin ? 'Panel administrativo' : 'Inicio'}
      subtitle={
        isAdmin
          ? 'Encargado de sistemas e innovación tecnológica'
          : undefined
      }
      actions={
        isAdmin ? (
          <a className="btn btn-primary btn-sm" href="/calendario.html">
            <Plus size={15} /> Nueva reserva
          </a>
        ) : (
          <a className="btn btn-primary btn-sm" href="/nueva-solicitud.html">
            <Plus size={15} /> Nuevo solicitud
          </a>
        )
      }
    >
      {!isAdmin && (
        <p className="greeting mb-20">
          Hola, Prof. <span>{profile.full_name}</span>
        </p>
      )}
      {isAdmin ? <AdminPanel profile={profile} /> : <ProfessorPanel profile={profile} />}
    </AppShell>
  )
}

createRoot(document.getElementById('root')!).render(<PanelPage />)
