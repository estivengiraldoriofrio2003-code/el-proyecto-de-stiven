import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  PackageCheck,
  PackageOpen,
  Plus,
  RotateCcw,
} from 'lucide-react'
import '../css/base.css'
import '../css/pages.css'
import { AppShell } from '../components/AppShell'
import { EmptyState, Field, FormError, Modal, Spinner, toast } from '../components/ui'
import { DeliveryChip } from '../components/StatusChip'
import { useSession } from '../js/session'
import { fmtDate, fmtDateTimeShort, fmtTime, isoToLocalInput, toLocalInput } from '../js/dates'
import { getApi } from '../services/data'
import type {
  Delivery,
  Profile,
  Reservation,
  Resource,
} from '../services/types'

type Tab = 'porEntregar' | 'entregados' | 'vencidas'

const ITEM_STATES = ['Buen estado', 'Con daños', 'Incompleto', 'Requiere revisión']

const STEPS = ['Entrega', 'Uso', 'Devolución', 'Finalización'] as const

function timelineState(delivery: Delivery): number {
  if (delivery.returned_at) return 3
  if (delivery.status === 'entregado' || delivery.status === 'vencida') return 1
  return 0
}

function DeliveryTimeline({ delivery }: { delivery: Delivery }) {
  const current = timelineState(delivery)
  return (
    <div className="delivery-timeline" aria-label="Ciclo de la entrega">
      {STEPS.map((step, index) => {
        const done = index < current
        const isCurrent = index === current
        return (
          <div
            key={step}
            className={`delivery-step ${done ? 'done' : ''} ${isCurrent ? 'current' : ''}`}
          >
            <span className="delivery-dot" />
            <span>{step}</span>
          </div>
        )
      })}
    </div>
  )
}

function EntregasPage() {
  const { profile, loading } = useSession()
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [professors, setProfessors] = useState<Profile[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('porEntregar')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    resource_id: '',
    recipient_id: '',
    reservation_id: '',
    delivered_at: toLocalInput(new Date()),
    due_at: '',
    item_state: ITEM_STATES[0],
    notes: '',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [returning, setReturning] = useState<Delivery | null>(null)
  const [returnState, setReturnState] = useState(ITEM_STATES[0])
  const [returnNotes, setReturnNotes] = useState('')
  const [returnError, setReturnError] = useState<string | null>(null)
  const [returnSaving, setReturnSaving] = useState(false)

  const isAdmin = profile?.role === 'encargado'

  const load = useCallback(async () => {
    const api = getApi()
    try {
      const [d, r, rsv] = await Promise.all([
        api.listDeliveries(),
        api.listResources(),
        api.listReservations(),
      ])
      setDeliveries(d)
      setResources(r)
      setReservations(rsv)
      if (isAdmin) {
        const profiles = await api.listProfiles()
        setProfessors(profiles.filter((p) => p.role === 'profesor'))
      }
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [isAdmin])

  useEffect(() => {
    if (profile) void load()
  }, [profile, load, reloadKey])

  const buckets = useMemo(() => {
    const isOverdue = (d: Delivery) =>
      d.status === 'vencida' ||
      (d.status === 'entregado' && d.due_at ? new Date(d.due_at).getTime() < Date.now() : false)
    return {
      porEntregar: deliveries.filter((d) => d.status === 'pendiente'),
      entregados: deliveries.filter((d) => d.status === 'entregado' && !isOverdue(d)),
      vencidas: deliveries.filter((d) => d.status === 'vencida' || (d.status === 'entregado' && isOverdue(d))),
    }
  }, [deliveries])

  const list = buckets[tab]
  const selected = deliveries.find((d) => d.id === selectedId) ?? list[0] ?? null

  const deliveryResources = resources.filter((r) => r.requires_delivery_item || r.kind !== 'espacio')
  const eligibleReservations = reservations.filter((r) => r.status === 'aprobada')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)
    if (!form.resource_id) {
      setFormError('Selecciona el elemento que se entrega.')
      return
    }
    if (!form.recipient_id) {
      setFormError('Indica la persona que recibe el elemento.')
      return
    }
    setSaving(true)
    try {
      await getApi().createDelivery({
        reservation_id: form.reservation_id || null,
        resource_id: form.resource_id,
        recipient_id: form.recipient_id,
        delivered_at: form.delivered_at,
        due_at: form.due_at || null,
        item_state: form.item_state,
        notes: form.notes || null,
      })
      toast.success('Entrega registrada. El recurso queda marcado como prestado.')
      setCreating(false)
      setForm({
        resource_id: '',
        recipient_id: '',
        reservation_id: '',
        delivered_at: toLocalInput(new Date()),
        due_at: '',
        item_state: ITEM_STATES[0],
        notes: '',
      })
      setReloadKey((k) => k + 1)
    } catch (e) {
      setFormError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const submitReturn = async () => {
    if (!returning) return
    setReturnSaving(true)
    setReturnError(null)
    try {
      await getApi().registerReturn(returning.id, { return_state: returnState, notes: returnNotes || null })
      toast.success('Devolución registrada correctamente.')
      setReturning(null)
      setReturnNotes('')
      setReturnState(ITEM_STATES[0])
      setReloadKey((k) => k + 1)
    } catch (e) {
      setReturnError((e as Error).message)
    } finally {
      setReturnSaving(false)
    }
  }

  if (loading) return <Spinner label="Verificando sesión…" />
  if (!profile) return null

  return (
    <AppShell
      profile={profile}
      title="Entregas"
      subtitle={
        isAdmin
          ? 'Control de entregas y devoluciones de llaves, controles y equipos'
          : 'Estado de los elementos que tienes en préstamo'
      }
      actions={
        isAdmin ? (
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Plus size={15} /> Registrar entrega
          </button>
        ) : undefined
      }
    >
      {error && (
        <div className="form-error mb-16">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="tabs-line" role="tablist" aria-label="Filtrar entregas">
        <button
          className="tab-line-btn"
          role="tab"
          aria-selected={tab === 'porEntregar'}
          onClick={() => setTab('porEntregar')}
        >
          Por entregar ({buckets.porEntregar.length})
        </button>
        <button
          className="tab-line-btn"
          role="tab"
          aria-selected={tab === 'entregados'}
          onClick={() => setTab('entregados')}
        >
          Entregados ({buckets.entregados.length})
        </button>
        <button
          className="tab-line-btn"
          role="tab"
          aria-selected={tab === 'vencidas'}
          onClick={() => setTab('vencidas')}
        >
          Vencidas ({buckets.vencidas.length})
        </button>
      </div>

      {busy ? (
        <Spinner label="Cargando entregas…" />
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(260px,1fr)', alignItems: 'start' }}>
          <section>
            {list.length === 0 ? (
              <div className="card card-pad">
                <EmptyState
                  icon={<PackageCheck />}
                  title={
                    tab === 'porEntregar'
                      ? 'No hay entregas por realizar'
                      : tab === 'entregados'
                        ? 'No hay elementos entregados'
                        : 'No hay entregas vencidas'
                  }
                  hint={
                    isAdmin
                      ? 'Registra una entrega cuando entregues una llave, un control o un equipo.'
                      : 'Cuando el encargado registre una entrega a tu nombre aparecerá aquí.'
                  }
                />
              </div>
            ) : (
              <div className="grid" style={{ gap: 12 }}>
                {list.map((d) => (
                  <article
                    key={d.id}
                    className="delivery-card"
                    onClick={() => setSelectedId(d.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="delivery-card-head">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="delivery-card-name">{d.recipient_name}</div>
                        <div className="delivery-card-meta">
                          <span>{d.resource_label}</span>
                          <span>{d.delivered_at ? fmtTime(d.delivered_at.slice(11, 16)) : ''}</span>
                        </div>
                      </div>
                      <DeliveryChip status={d.status} />
                    </div>

                    <DeliveryTimeline delivery={d} />

                    {isAdmin && (
                      <div className="flex gap-8">
                        {d.status === 'pendiente' && (
                          <button className="btn btn-primary btn-sm btn-block" onClick={() => setCreating(true)}>
                            Registrar entrega
                          </button>
                        )}
                        {(d.status === 'entregado' || d.status === 'vencida') && (
                          <button
                            className="btn btn-primary btn-sm btn-block"
                            onClick={(e) => {
                              e.stopPropagation()
                              setReturning(d)
                              setReturnState(ITEM_STATES[0])
                              setReturnNotes('')
                              setReturnError(null)
                            }}
                          >
                            Registrar devolución
                          </button>
                        )}
                        {d.status === 'devuelto' && (
                          <span className="chip chip-green" style={{ width: '100%', justifyContent: 'center' }}>
                            <CheckCircle2 size={12} /> Devuelto el {fmtDateTimeShort(d.returned_at)}
                          </span>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className="card card-pad delivery-detail">
            <div className="flex justify-between items-center mb-8">
              <h2 className="card-title">Detalle de entrega</h2>
              <PackageOpen size={16} style={{ color: 'var(--ink-400)' }} />
            </div>

            {selected ? (
              <>
                <p className="text-xs text-muted mb-12">{fmtDate(selected.delivered_at?.slice(0, 10) ?? '')}</p>
                <div className="delivery-detail-list">
                  <div className="delivery-detail-row">
                    <span className="k">Recibe</span>
                    <span className="v">{selected.recipient_name}</span>
                  </div>
                  <div className="delivery-detail-row">
                    <span className="k">Entrega</span>
                    <span className="v">{selected.delivered_by_name ?? '—'}</span>
                  </div>
                  <div className="delivery-detail-row">
                    <span className="k">Elemento</span>
                    <span className="v">{selected.resource_label}</span>
                  </div>
                  <div className="delivery-detail-row">
                    <span className="k">Estado del elemento</span>
                    <span className="v">{selected.item_state ?? '—'}</span>
                  </div>
                  <div className="delivery-detail-row">
                    <span className="k">Entrega</span>
                    <span className="v">{fmtDateTimeShort(selected.delivered_at)}</span>
                  </div>
                  <div className="delivery-detail-row">
                    <span className="k">Devolución</span>
                    <span className="v">{fmtDateTimeShort(selected.returned_at)}</span>
                  </div>
                </div>

                <div className="delivery-timeline mb-12">
                  {STEPS.map((step, index) => {
                    const current = timelineState(selected)
                    return (
                      <div
                        key={step}
                        className={`delivery-step ${index < current ? 'done' : ''} ${
                          index === current ? 'current' : ''
                        }`}
                      >
                        <span className="delivery-dot" />
                        <span>{step}</span>
                      </div>
                    )
                  })}
                </div>

                {isAdmin && (selected.status === 'entregado' || selected.status === 'vencida') && (
                  <button
                    className="btn btn-primary btn-block btn-sm"
                    onClick={() => {
                      setReturning(selected)
                      setReturnState(ITEM_STATES[0])
                      setReturnNotes('')
                      setReturnError(null)
                    }}
                  >
                    <RotateCcw size={14} /> Registrar devolución
                  </button>
                )}

                {selected.status === 'devuelto' && (
                  <div className="form-success" style={{ marginBottom: 0 }}>
                    <CheckCircle2 size={16} />
                    <span>
                      Devuelto el {fmtDateTimeShort(selected.returned_at)} · Estado:{' '}
                      {selected.return_state ?? '—'}
                    </span>
                  </div>
                )}

                {selected.notes && (
                  <div className="mt-12">
                    <p className="eyebrow mb-8">Observaciones</p>
                    <p className="text-xs text-muted" style={{ lineHeight: 1.55 }}>
                      {selected.notes}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <EmptyState icon={<KeyRound />} title="Sin entrega seleccionada" hint="Elige una entrega de la lista." />
            )}
          </aside>
        </div>
      )}

      {/* Registrar entrega */}
      <Modal
        open={creating}
        title="Registrar entrega"
        subtitle="La entrega y la devolución tienen estados propios e independientes de la reserva."
        onClose={() => !saving && setCreating(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCreating(false)} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={saving}>
              {saving ? 'Guardando…' : 'Registrar entrega'}
            </button>
          </>
        }
      >
        <form onSubmit={submit}>
          <FormError message={formError} />

          <Field label="Elemento entregado" htmlFor="d-resource">
            <select
              id="d-resource"
              className="select"
              value={form.resource_id}
              onChange={(e) => setForm({ ...form, resource_id: e.target.value })}
              required
            >
              <option value="">Selecciona el elemento…</option>
              {deliveryResources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.location_label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Persona que recibe" htmlFor="d-recipient">
            <select
              id="d-recipient"
              className="select"
              value={form.recipient_id}
              onChange={(e) => setForm({ ...form, recipient_id: e.target.value })}
              required
            >
              <option value="">Selecciona el profesor…</option>
              {professors.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} · {p.email}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Reserva asociada (opcional)" htmlFor="d-reservation">
            <select
              id="d-reservation"
              className="select"
              value={form.reservation_id}
              onChange={(e) => setForm({ ...form, reservation_id: e.target.value })}
            >
              <option value="">Sin reserva asociada</option>
              {eligibleReservations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.resource_label} · {fmtDate(r.reservation_date)} · {fmtTime(r.start_time)}
                </option>
              ))}
            </select>
          </Field>

          <div className="form-row two">
            <Field label="Fecha y hora de entrega" htmlFor="d-delivered">
              <input
                id="d-delivered"
                className="input"
                type="datetime-local"
                value={form.delivered_at}
                onChange={(e) => setForm({ ...form, delivered_at: e.target.value })}
                required
              />
            </Field>
            <Field label="Devolución prevista" htmlFor="d-due">
              <input
                id="d-due"
                className="input"
                type="datetime-local"
                value={form.due_at}
                onChange={(e) => setForm({ ...form, due_at: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Estado del elemento" htmlFor="d-state">
            <select
              id="d-state"
              className="select"
              value={form.item_state}
              onChange={(e) => setForm({ ...form, item_state: e.target.value })}
            >
              {ITEM_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Observaciones" htmlFor="d-notes">
            <textarea
              id="d-notes"
              className="textarea"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Novedades, accesorios entregados, etc."
            />
          </Field>
        </form>
      </Modal>

      {/* Registrar devolución */}
      <Modal
        open={Boolean(returning)}
        title="Registrar devolución"
        subtitle={
          returning
            ? `${returning.resource_label} · ${returning.recipient_name}`
            : undefined
        }
        onClose={() => !returnSaving && setReturning(null)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setReturning(null)} disabled={returnSaving}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={submitReturn} disabled={returnSaving}>
              {returnSaving ? 'Guardando…' : 'Confirmar devolución'}
            </button>
          </>
        }
      >
        <FormError message={returnError} />
        <Field label="Estado al devolver" htmlFor="ret-state">
          <select
            id="ret-state"
            className="select"
            value={returnState}
            onChange={(e) => setReturnState(e.target.value)}
          >
            {ITEM_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <p className="field-hint mb-16">
          Si registras daños, el recurso pasa a mantenimiento y deja de estar disponible para reservas.
        </p>
        <Field label="Observaciones" htmlFor="ret-notes">
          <textarea
            id="ret-notes"
            className="textarea"
            value={returnNotes}
            onChange={(e) => setReturnNotes(e.target.value)}
            placeholder="Detalles de la devolución…"
          />
        </Field>
      </Modal>
    </AppShell>
  )
}

createRoot(document.getElementById('root')!).render(<EntregasPage />)
