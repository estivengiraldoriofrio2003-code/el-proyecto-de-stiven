import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AlertTriangle, ArrowRight, Download, Filter, History } from 'lucide-react'
import '../css/base.css'
import '../css/pages.css'
import { AppShell } from '../components/AppShell'
import { EmptyState, Field, Modal, Spinner, toast } from '../components/ui'
import { StatePill } from '../components/StatusChip'
import { useSession } from '../js/session'
import { fmtDate, fmtDateTime } from '../js/dates'
import { getApi } from '../services/data'
import type { AuditEntry, Profile } from '../services/types'

const ENTITY_LABEL: Record<string, string> = {
  solicitud: 'Solicitud',
  entrega: 'Entrega',
  recurso: 'Recurso',
  cuenta: 'Cuenta',
  reserva: 'Reserva',
}

const PAGE_SIZE = 12

function HistorialPage() {
  const { profile, loading } = useSession()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState('todas')
  const [entity, setEntity] = useState('todas')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const isAdmin = profile?.role === 'encargado'

  const load = useCallback(async () => {
    try {
      const data = await getApi().listAudit({
        action: action === 'todas' ? undefined : action,
        entity: entity === 'todas' ? undefined : entity,
        from: from || undefined,
        to: to || undefined,
      })
      setEntries(data)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [action, entity, from, to])

  useEffect(() => {
    if (profile) void load()
  }, [profile, load])

  const actions = useMemo(
    () => [...new Set(entries.map((e) => e.action))].sort(),
    [entries],
  )

  const filtered = useMemo(() => {
    if (!query.trim()) return entries
    const q = query.toLowerCase()
    return entries.filter(
      (e) =>
        e.action.toLowerCase().includes(q) ||
        e.actor_email.toLowerCase().includes(q) ||
        (e.resource_label ?? '').toLowerCase().includes(q),
    )
  }, [entries, query])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const exportCsv = () => {
    const header = ['Fecha y hora', 'Usuario', 'Perfil', 'Acción', 'Entidad', 'Recurso', 'Estado anterior', 'Estado nuevo', 'Observaciones']
    const lines = filtered.map((e) =>
      [
        fmtDateTime(e.created_at),
        e.actor_email,
        e.actor_role ?? '—',
        e.action,
        ENTITY_LABEL[e.entity] ?? e.entity,
        e.resource_label ?? '',
        e.previous_state ?? '',
        e.new_state ?? '',
        e.notes ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    )
    const csv = `\uFEFF${[header.join(','), ...lines].join('\n')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `historial-iuc-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Historial exportado en CSV.')
  }

  if (loading) return <Spinner label="Verificando sesión…" />
  if (!profile) return null

  return (
    <AppShell
      profile={profile}
      title="Historial"
      subtitle={
        isAdmin
          ? 'Trazabilidad completa de las operaciones del sistema'
          : 'Registro de tus propias operaciones'
      }
      actions={
        <button className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={!filtered.length}>
          <Download size={15} /> Exportar CSV
        </button>
      }
    >
      {error && (
        <div className="form-error mb-16">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="history-filters">
        <div className="search-wrap">
          <Filter size={15} />
          <input
            className="input"
            placeholder="Buscar por acción, usuario o recurso…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
            aria-label="Buscar en el historial"
          />
        </div>
        <select
          className="select filter-select"
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value)
            setPage(1)
          }}
          aria-label="Entidad"
        >
          <option value="todas">Todas las entidades</option>
          {Object.entries(ENTITY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          className="select filter-select"
          value={action}
          onChange={(e) => {
            setAction(e.target.value)
            setPage(1)
          }}
          aria-label="Acción"
        >
          <option value="todas">Todas las acciones</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={() => setFiltersOpen(true)}>
          Rango de fechas
        </button>
        {(from || to) && (
          <span className="chip chip-soft-blue">
            {from ? fmtDate(from) : 'inicio'} → {to ? fmtDate(to) : 'hoy'}
          </span>
        )}
      </div>

      {busy ? (
        <Spinner label="Cargando historial…" />
      ) : filtered.length === 0 ? (
        <div className="card card-pad">
          <EmptyState
            icon={<History />}
            title="Sin operaciones registradas"
            hint="Las aprobaciones, rechazos, entregas y devoluciones quedarán registradas aquí."
          />
        </div>
      ) : (
        <>
          {/* Escritorio */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="table-wrap">
              <table className="table table-responsive">
                <thead>
                  <tr>
                    <th>Fecha y hora</th>
                    <th>Usuario</th>
                    <th>Acción</th>
                    <th>Recurso</th>
                    {isAdmin && <th>Entidad</th>}
                    <th>Estado anterior → Estado resultante</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <td data-label="Fecha y hora" className="nowrap text-xs">
                        {fmtDateTime(e.created_at)}
                      </td>
                      <td data-label="Usuario" className="text-xs">
                        <div>{e.actor_email}</div>
                        <div className="text-muted" style={{ fontSize: 11 }}>
                          {e.actor_role === 'encargado' ? 'Encargado' : e.actor_role === 'profesor' ? 'Profesor' : 'Sistema'}
                        </div>
                      </td>
                      <td data-label="Acción" className="text-xs">
                        {e.action}
                        {e.notes && (
                          <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                            {e.notes}
                          </div>
                        )}
                      </td>
                      <td data-label="Recurso" className="text-xs">
                        {e.resource_label ?? '—'}
                      </td>
                      {isAdmin && (
                        <td data-label="Entidad" className="text-xs">
                          {ENTITY_LABEL[e.entity] ?? e.entity}
                        </td>
                      )}
                      <td data-label="Estado">
                        <span className="state-flow">
                          <StatePill value={e.previous_state} />
                          <ArrowRight size={14} />
                          <StatePill value={e.new_state} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pagination">
            <button onClick={() => setPage(current - 1)} disabled={current <= 1} aria-label="Anterior">
              ‹
            </button>
            <button onClick={() => setPage(1)} aria-label="Primera" disabled={current <= 1}>
              1
            </button>
            <span className="text-xs text-muted" style={{ padding: '0 8px' }}>
              {current} / {pages}
            </span>
            <button onClick={() => setPage(pages)} aria-label="Última" disabled={current >= pages}>
              {pages}
            </button>
            <button onClick={() => setPage(current + 1)} disabled={current >= pages} aria-label="Siguiente">
              ›
            </button>
          </div>

          <p className="text-xs text-muted mt-12" style={{ lineHeight: 1.6 }}>
            La trazabilidad es permanente: las reservas canceladas o modificadas no se eliminan del
            historial. {isAdmin ? 'Como encargado ves las operaciones de todos los usuarios.' : 'Aquí solo aparecen tus propias operaciones.'}
          </p>
        </>
      )}

      <Modal
        open={filtersOpen}
        title="Filtrar por rango de fechas"
        onClose={() => setFiltersOpen(false)}
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setFrom('')
                setTo('')
                setFiltersOpen(false)
              }}
            >
              Limpiar
            </button>
            <button className="btn btn-primary" onClick={() => setFiltersOpen(false)}>
              Aplicar
            </button>
          </>
        }
      >
        <div className="form-row two">
          <Field label="Desde" htmlFor="from">
            <input
              id="from"
              className="input"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="Hasta" htmlFor="to">
            <input
              id="to"
              className="input"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </AppShell>
  )
}

createRoot(document.getElementById('root')!).render(<HistorialPage />)
