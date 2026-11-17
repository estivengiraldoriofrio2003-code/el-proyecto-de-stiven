import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AlertTriangle,
  Building2,
  DoorOpen,
  KeyRound,
  MonitorPlay,
  Pencil,
  Plus,
  Projector,
  Search,
  Trash2,
  Tv,
} from 'lucide-react'
import '../css/base.css'
import '../css/pages.css'
import { AppShell } from '../components/AppShell'
import { EmptyState, Field, FormError, Modal, Spinner, toast } from '../components/ui'
import { ResourceChip } from '../components/StatusChip'
import { useSession } from '../js/session'
import { getApi } from '../services/data'
import type {
  Location,
  Profile,
  Resource,
  ResourceCategory,
  ResourceInput,
  ResourceStatus,
} from '../services/types'
import { RESOURCE_STATUS_LABEL } from '../services/rules'

const PAGE_SIZE = 8

const iconFor = (kind?: string) => {
  if (kind === 'equipo') return <Tv />
  if (kind === 'elemento') return <KeyRound />
  return <MonitorPlay />
}

const emptyForm = (locations: Location[], categories: ResourceCategory[]): ResourceInput => ({
  code: '',
  name: '',
  category_id: categories[0]?.id ?? '',
  location_id: locations[0]?.id ?? '',
  status: 'disponible',
  is_reservable: true,
  requires_delivery_item: false,
  capacity: null,
  notes: '',
})

function RecursosPage() {
  const { profile, loading } = useSession()
  const [resources, setResources] = useState<Resource[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [categories, setCategories] = useState<ResourceCategory[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [query, setQuery] = useState('')
  const [floor, setFloor] = useState('todos')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [kindFilter, setKindFilter] = useState('todos')
  const [page, setPage] = useState(1)

  const [editing, setEditing] = useState<Resource | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<ResourceInput | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmRetire, setConfirmRetire] = useState<Resource | null>(null)

  const isAdmin = profile?.role === 'encargado'

  const load = useCallback(async () => {
    const api = getApi()
    try {
      const [res, locs, cats] = await Promise.all([
        api.listResources(),
        api.listLocations(),
        api.listCategories(),
      ])
      setResources(res)
      setLocations(locs)
      setCategories(cats)
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
    const q = query.trim().toLowerCase()
    return resources.filter((r) => {
      if (q && !`${r.name} ${r.code} ${r.category_name ?? ''}`.toLowerCase().includes(q)) return false
      if (floor !== 'todos' && String(locations.find((l) => l.id === r.location_id)?.floor ?? '') !== floor)
        return false
      if (statusFilter !== 'todos' && r.status !== statusFilter) return false
      if (kindFilter !== 'todos' && r.kind !== kindFilter) return false
      return true
    })
  }, [resources, query, floor, statusFilter, kindFilter, locations])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const pageRows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const floorOf = (r: Resource) => locations.find((l) => l.id === r.location_id)?.floor ?? '—'

  const openEdit = (resource: Resource) => {
    setEditing(resource)
    setCreating(false)
    setFormError(null)
    setForm({
      id: resource.id,
      code: resource.code,
      name: resource.name,
      category_id: resource.category_id ?? categories[0]?.id ?? '',
      location_id: resource.location_id ?? locations[0]?.id ?? '',
      status: resource.status,
      is_reservable: resource.is_reservable,
      requires_delivery_item: resource.requires_delivery_item,
      capacity: resource.capacity ?? null,
      notes: resource.notes ?? '',
    })
  }

  const openCreate = () => {
    setEditing(null)
    setCreating(true)
    setFormError(null)
    setForm(emptyForm(locations, categories))
  }

  const closeModal = () => {
    if (saving) return
    setEditing(null)
    setCreating(false)
    setForm(null)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form) return
    setSaving(true)
    setFormError(null)
    try {
      await getApi().saveResource({
        ...form,
        code: form.code.trim(),
        name: form.name.trim(),
        capacity: form.capacity ? Number(form.capacity) : null,
      })
      toast.success(form.id ? 'Recurso actualizado.' : 'Recurso registrado.')
      closeModal()
      setReloadKey((k) => k + 1)
    } catch (e) {
      setFormError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const retire = async () => {
    if (!confirmRetire) return
    try {
      await getApi().removeResource(confirmRetire.id)
      toast.success('Recurso retirado del uso (eliminación lógica).')
      setConfirmRetire(null)
      setReloadKey((k) => k + 1)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (loading) return <Spinner label="Verificando sesión…" />
  if (!profile) return null

  return (
    <AppShell
      profile={profile}
      title="Recursos"
      subtitle={
        isAdmin
          ? 'Espacios, equipos y elementos de acceso de la institución'
          : 'Consulta los espacios y recursos disponibles'
      }
      actions={
        isAdmin ? (
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <Plus size={15} /> Agregar recurso
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

      <div className="filter-row">
        <div className="search-wrap">
          <Search size={16} />
          <input
            className="input"
            placeholder="Buscar recursos…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
            aria-label="Buscar recursos"
          />
        </div>

        <select
          className="select filter-select"
          value={kindFilter}
          onChange={(e) => {
            setKindFilter(e.target.value)
            setPage(1)
          }}
          aria-label="Tipo de recurso"
        >
          <option value="todos">Todos los tipos</option>
          <option value="espacio">Espacios</option>
          <option value="equipo">Equipos</option>
          <option value="elemento">Llaves y controles</option>
        </select>

        <select
          className="select filter-select"
          value={floor}
          onChange={(e) => {
            setFloor(e.target.value)
            setPage(1)
          }}
          aria-label="Piso"
        >
          <option value="todos">Piso (1 a 6)</option>
          {[...new Set(locations.map((l) => l.floor))]
            .sort((a, b) => a - b)
            .map((f) => (
              <option key={f} value={String(f)}>
                Piso {f}
              </option>
            ))}
        </select>

        <select
          className="select filter-select"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          aria-label="Estado"
        >
          <option value="todos">Estado</option>
          {Object.entries(RESOURCE_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {busy ? (
        <Spinner label="Cargando recursos…" />
      ) : filtered.length === 0 ? (
        <div className="card card-pad">
          <EmptyState
            icon={<DoorOpen />}
            title="No hay recursos que coincidan"
            hint="Ajusta los filtros o registra un nuevo recurso."
          />
        </div>
      ) : (
        <>
          {/* Tabla de escritorio */}
          <div className="card" style={{ overflow: 'hidden' }} aria-label="Listado de recursos">
            <div className="table-wrap">
              <table className="table table-responsive">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                    <th>Tipo</th>
                    <th>Piso</th>
                    <th>Ubicación</th>
                    <th>Estado</th>
                    <th>Disponibilidad</th>
                    {isAdmin && <th style={{ textAlign: 'right' }}>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Código" className="nowrap font-medium">
                        {r.code}
                      </td>
                      <td data-label="Nombre">{r.name}</td>
                      <td data-label="Tipo" className="text-xs">
                        {r.kind === 'espacio' ? 'Espacio' : r.kind === 'equipo' ? 'Equipo' : 'Llave y control'}
                      </td>
                      <td data-label="Piso">{floorOf(r)}</td>
                      <td data-label="Ubicación" className="text-xs">
                        {r.location_label}
                      </td>
                      <td data-label="Estado">
                        <ResourceChip status={r.status} />
                      </td>
                      <td data-label="Disponibilidad" className="text-xs">
                        {!r.is_reservable
                          ? 'No reservable'
                          : r.status === 'disponible'
                            ? 'Disponible'
                            : r.status === 'prestado'
                              ? 'En préstamo'
                              : 'No disponible'}
                      </td>
                      {isAdmin && (
                        <td data-label="">
                          <div className="table-actions">
                            <button
                              className="icon-btn"
                              onClick={() => openEdit(r)}
                              aria-label={`Editar ${r.name}`}
                              title="Editar"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              className="icon-btn"
                              onClick={() => setConfirmRetire(r)}
                              aria-label={`Retirar ${r.name}`}
                              title="Retirar del uso"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tarjetas en móvil (mismos datos, sin perder información) */}
          <div className="resource-cards" aria-hidden="true" style={{ display: 'none' }}>
            {pageRows.map((r) => (
              <article className="resource-card" key={`m-${r.id}`}>
                <span className="resource-card-icon">{iconFor(r.kind)}</span>
                <div className="resource-card-body">
                  <div className="resource-card-title">{r.name}</div>
                  <div className="resource-card-meta">
                    {r.code} · Piso {floorOf(r)} · {r.location_label}
                  </div>
                </div>
                <ResourceChip status={r.status} withPrefix={false} />
              </article>
            ))}
          </div>

          <div className="pagination">
            <button onClick={() => setPage(current - 1)} disabled={current <= 1} aria-label="Página anterior">
              ‹
            </button>
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <button key={p} aria-current={p === current} onClick={() => setPage(p)}>
                {p}
              </button>
            ))}
            <button onClick={() => setPage(current + 1)} disabled={current >= pages} aria-label="Página siguiente">
              ›
            </button>
          </div>
          <p className="text-xs text-muted" style={{ textAlign: 'center', marginTop: 6 }}>
            Página {current} de {pages} · {filtered.length} recursos
          </p>
        </>
      )}

      <div className="info-note mt-20">
        <Building2 size={16} />
        <div>
          Las salas se reservan como espacios completos; no se reservan computadores individuales. Los
          televisores, llaves y controles usan el flujo de entregas y devoluciones.
        </div>
      </div>

      {/* Alta / edición */}
      <Modal
        open={Boolean(form) && (creating || Boolean(editing))}
        title={creating ? 'Agregar recurso' : 'Editar recurso'}
        subtitle="Los datos desconocidos deben quedar pendientes de validación institucional."
        onClose={closeModal}
        footer={
          <>
            <button className="btn btn-secondary" onClick={closeModal} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        {form && (
          <form onSubmit={save}>
            <FormError message={formError} />
            <div className="form-row two">
              <Field label="Código" htmlFor="r-code" hint="Identificador único (ej.: SC-001).">
                <input
                  id="r-code"
                  className="input"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="SC-001"
                  required
                />
              </Field>
              <Field label="Nombre" htmlFor="r-name">
                <input
                  id="r-name"
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Sala de Cómputo A"
                  required
                />
              </Field>
            </div>

            <div className="form-row two">
              <Field label="Categoría" htmlFor="r-category">
                <select
                  id="r-category"
                  className="select"
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  required
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ubicación (piso)" htmlFor="r-location">
                <select
                  id="r-location"
                  className="select"
                  value={form.location_id}
                  onChange={(e) => setForm({ ...form, location_id: e.target.value })}
                  required
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} · {l.building}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="form-row two">
              <Field label="Estado" htmlFor="r-status">
                <select
                  id="r-status"
                  className="select"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as ResourceStatus })}
                >
                  {Object.entries(RESOURCE_STATUS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Capacidad (opcional)" htmlFor="r-capacity">
                <input
                  id="r-capacity"
                  className="input"
                  type="number"
                  min={0}
                  value={form.capacity ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, capacity: e.target.value ? Number(e.target.value) : null })
                  }
                  placeholder="Solo si se conoce"
                />
              </Field>
            </div>

            <Field label="Observaciones" htmlFor="r-notes">
              <textarea
                id="r-notes"
                className="textarea"
                value={form.notes ?? ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Datos pendientes de validación, características, etc."
              />
            </Field>

            <label className="flex items-center gap-8 mb-12" style={{ fontSize: 13.5 }}>
              <input
                type="checkbox"
                checked={form.is_reservable}
                onChange={(e) => setForm({ ...form, is_reservable: e.target.checked })}
              />
              Admite reservas
            </label>
            <label className="flex items-center gap-8" style={{ fontSize: 13.5 }}>
              <input
                type="checkbox"
                checked={form.requires_delivery_item}
                onChange={(e) => setForm({ ...form, requires_delivery_item: e.target.checked })}
              />
              Requiere entrega y devolución (llaves, controles, equipos)
            </label>
          </form>
        )}
      </Modal>

      {/* Retiro lógico */}
      <Modal
        open={Boolean(confirmRetire)}
        title="Retirar recurso del uso"
        subtitle="La eliminación es lógica: se conserva el historial y las reservas asociadas."
        onClose={() => setConfirmRetire(null)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmRetire(null)}>
              Cancelar
            </button>
            <button className="btn btn-danger" onClick={retire}>
              Retirar
            </button>
          </>
        }
      >
        <p className="text-sm">
          ¿Confirmas retirar <strong>{confirmRetire?.name}</strong> ({confirmRetire?.code})? El recurso
          pasará a <strong>Fuera de servicio</strong> y dejará de admitir reservas.
        </p>
      </Modal>
    </AppShell>
  )
}

createRoot(document.getElementById('root')!).render(<RecursosPage />)
