import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Filter,
  Plus,
  XCircle,
} from 'lucide-react'
import '../css/base.css'
import '../css/pages.css'
import { AppShell } from '../components/AppShell'
import { EmptyState, Field, FormError, Modal, Spinner, toast } from '../components/ui'
import { StatusChip, prettyState } from '../components/StatusChip'
import { useSession } from '../js/session'
import { fmtDate, fmtRange, todayISO } from '../js/dates'
import { getApi } from '../services/data'
import { canDecide, canProfessorCancel } from '../services/rules'
import type { Profile, ReservationRequest, RequestStatus, Resource } from '../services/types'

const FILTERS: Array<{ key: string; label: string; statuses?: RequestStatus[] }> = [
  { key: 'todas', label: 'Todas' },
  { key: 'pendiente', label: 'Pendientes', statuses: ['pendiente'] },
  { key: 'aprobada', label: 'Aprobadas', statuses: ['aprobada'] },
  { key: 'rechazada', label: 'Rechazadas', statuses: ['rechazada'] },
  { key: 'cancelada', label: 'Canceladas', statuses: ['cancelada'] },
  { key: 'finalizada', label: 'Finalizadas', statuses: ['finalizada'] },
]

function SolicitudesPage() {
  const { profile, loading } = useSession()
  const [requests, setRequests] = useState<ReservationRequest[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('todas')
  const [query, setQuery] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const [deciding, setDeciding] = useState<{ request: ReservationRequest; decision: 'aprobada' | 'rechazada' } | null>(null)
  const [note, setNote] = useState('')
  const [modalError, setModalError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isAdmin = profile?.role === 'encargado'

  const load = useCallback(async () => {
    const api = getApi()
    try {
      const [rs, res] = await Promise.all([api.listRequests(), api.listResources()])
      setRequests(rs)
      setResources(res)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (profile) void load()
  }, [profile, load, reloadKey])

  const filtered = useMemo(() => {
    const def = FILTERS.find((f) => f.key === filter)
    let rows = requests
    if (def?.statuses) rows = rows.filter((r) => def.statuses!.includes(r.status))
    if (query.trim()) {
      const q = query.toLowerCase()
      rows = rows.filter(
        (r) =>
          r.resource_label?.toLowerCase().includes(q) ||
          r.purpose.toLowerCase().includes(q) ||
          r.requester_name?.toLowerCase().includes(q),
      )
    }
    return rows
  }, [requests, filter, query])

  const openDecision = (request: ReservationRequest, decision: 'aprobada' | 'rechazada') => {
    setDeciding({ request, decision })
    setNote('')
    setModalError(null)
  }

  const submitDecision = async () => {
    if (!deciding) return
    if (deciding.decision === 'rechazada' && !note.trim()) {
      setModalError('Debes registrar una observación al rechazar la solicitud.')
      return
    }
    setSaving(true)
    setModalError(null)
    try {
      await getApi().decideRequest(deciding.request.id, deciding.decision, note)
      toast.success(deciding.decision === 'aprobada' ? 'Solicitud aprobada.' : 'Solicitud rechazada.')
      setDeciding(null)
      setReloadKey((k) => k + 1)
    } catch (e) {
      setModalError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const cancel = async (request: ReservationRequest) => {
    if (!window.confirm('¿Cancelar esta solicitud? La acción queda registrada en el historial.')) return
    try {
      await getApi().cancelRequest(request.id)
      toast.success('Solicitud cancelada.')
      setReloadKey((k) => k + 1)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (loading) return <Spinner label="Verificando sesión…" />
  if (!profile) return null

  const pendingCount = requests.filter((r) => r.status === 'pendiente').length

  return (
    <AppShell
      profile={profile}
      title={isAdmin ? 'Solicitudes' : 'Mis reservas'}
      subtitle={
        isAdmin
          ? 'Todas las solicitudes registradas en la plataforma'
          : 'Estado de tus solicitudes y reservas'
      }
      pendingCount={pendingCount}
      actions={
        isAdmin ? (
          <a className="btn btn-primary btn-sm" href="/calendario.html">
            <Plus size={15} /> Nueva reserva
          </a>
        ) : (
          <a className="btn btn-primary btn-sm" href="/nueva-solicitud.html">
            <Plus size={15} /> Nueva solicitud
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

      {isAdmin && pendingCount > 0 && (
        <div className="pending-banner">
          <ClipboardList size={17} />
          <span>
            Hay <strong>{pendingCount}</strong> solicitud{pendingCount === 1 ? '' : 'es'} esperando
            decisión. Revisa los horarios antes de aprobar.
          </span>
        </div>
      )}

      <div className="tabs-line" role="tablist" aria-label="Filtrar solicitudes">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            className="tab-line-btn"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="filter-row">
        <div className="search-wrap">
          <Filter size={15} />
          <input
            className="input"
            placeholder="Buscar por recurso, propósito o profesor…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar solicitudes"
          />
        </div>
        <span className="text-xs text-muted">{filtered.length} registros</span>
      </div>

      {busy ? (
        <Spinner label="Cargando solicitudes…" />
      ) : filtered.length === 0 ? (
        <div className="card card-pad">
          <EmptyState
            icon={<ClipboardList />}
            title="No hay solicitudes en este filtro"
            hint={
              isAdmin
                ? 'Cuando los profesores registren solicitudes aparecerán aquí.'
                : 'Crea una nueva solicitud para reservar un espacio o recurso.'
            }
          />
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="table table-responsive">
              <thead>
                <tr>
                  {isAdmin && <th>Profesor</th>}
                  <th>Recurso</th>
                  <th>Fecha</th>
                  <th>Horario</th>
                  <th>Propósito</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const canCancel =
                    profile &&
                    canProfessorCancel(profile.role, r, profile.id) &&
                    (isAdmin || r.status !== 'finalizada')
                  return (
                    <tr key={r.id}>
                      {isAdmin && <td data-label="Profesor">{r.requester_name}</td>}
                      <td data-label="Recurso">{r.resource_label}</td>
                      <td data-label="Fecha" className="nowrap">
                        {fmtDate(r.request_date)}
                      </td>
                      <td data-label="Horario" className="nowrap text-xs">
                        {fmtRange(r.start_time, r.end_time)}
                      </td>
                      <td data-label="Propósito" className="text-xs" style={{ maxWidth: 240 }}>
                        {r.purpose}
                        {r.decision_note && (
                          <span className="text-xs text-muted" style={{ display: 'block', marginTop: 3 }}>
                            Obs.: {r.decision_note}
                          </span>
                        )}
                      </td>
                      <td data-label="Estado">
                        <StatusChip status={r.status} />
                      </td>
                      <td data-label="Acciones">
                        <div className="table-actions">
                          {isAdmin && r.status === 'pendiente' && canDecide(profile.role) && (
                            <>
                              <button
                                className="btn btn-approve btn-sm"
                                onClick={() => openDecision(r, 'aprobada')}
                              >
                                Aprobar
                              </button>
                              <button
                                className="btn btn-reject btn-sm"
                                onClick={() => openDecision(r, 'rechazada')}
                              >
                                Rechazar
                              </button>
                            </>
                          )}
                          {canCancel && (
                            <button className="btn btn-ghost btn-sm" onClick={() => cancel(r)}>
                              Cancelar
                            </button>
                          )}
                          {!isAdmin && r.status !== 'pendiente' && r.status !== 'aprobada' && (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={Boolean(deciding)}
        title={deciding?.decision === 'aprobada' ? 'Aprobar solicitud' : 'Rechazar solicitud'}
        subtitle={
          deciding
            ? `${deciding.request.resource_label} · ${fmtDate(deciding.request.request_date)} · ${fmtRange(
                deciding.request.start_time,
                deciding.request.end_time,
              )}`
            : undefined
        }
        onClose={() => !saving && setDeciding(null)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setDeciding(null)} disabled={saving}>
              Cancelar
            </button>
            <button
              className={`btn ${deciding?.decision === 'aprobada' ? 'btn-approve' : 'btn-danger'}`}
              onClick={submitDecision}
              disabled={saving}
            >
              {saving ? 'Guardando…' : deciding?.decision === 'aprobada' ? (
                <>
                  <CheckCircle2 size={15} /> Aprobar
                </>
              ) : (
                <>
                  <XCircle size={15} /> Rechazar
                </>
              )}
            </button>
          </>
        }
      >
        <FormError message={modalError} />
        <p className="text-sm text-muted mb-12">
          Solicitada por <strong>{deciding?.request.requester_name}</strong>.
        </p>
        <Field
          label={deciding?.decision === 'rechazada' ? 'Observación (obligatoria)' : 'Observación (opcional)'}
          htmlFor="sol-note"
        >
          <textarea
            id="sol-note"
            className="textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              deciding?.decision === 'rechazada'
                ? 'Explica el motivo del rechazo…'
                : 'Nota interna o indicación para el profesor…'
            }
            disabled={saving}
          />
        </Field>
        <p className="text-xs text-muted">
          Estado actual: {deciding ? prettyState(deciding.request.status) : '—'} →{' '}
          {deciding ? prettyState(deciding.decision) : '—'}. La operación se registra en el historial.
        </p>
      </Modal>
    </AppShell>
  )
}

createRoot(document.getElementById('root')!).render(<SolicitudesPage />)
