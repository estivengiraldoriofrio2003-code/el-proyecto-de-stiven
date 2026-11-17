/**
 * Implementación de DEMOSTRACIÓN.
 *
 * Se activa SOLO cuando no hay credenciales de Supabase (.env).
 * Guarda en localStorage para permitir recorrer la interfaz, y aplica las
 * mismas reglas de negocio que PostgreSQL (solapes, permisos, trazabilidad).
 *
 * NO es el entregable funcional: la aplicación real usa Supabase (src/services/supabaseApi.ts).
 * Toda la interfaz muestra un aviso visible cuando está en este modo.
 */
import type { Api } from './api'
import {
  findConflict,
  friendlyDbError,
  INITIAL_REQUEST_STATUS,
  isBookable,
  validateSchedule,
} from './rules'
import { dateTimeLocalToISO, todayISO } from '../js/dates'
import type {
  AuditEntry,
  AuditFilters,
  Delivery,
  Location,
  NewDeliveryInput,
  NewRequestInput,
  Profile,
  Reservation,
  ReservationRequest,
  RequestStatus,
  Resource,
  ResourceCategory,
  ResourceInput,
  Settings,
} from './types'

const STORAGE_KEY = 'iuc-reservas-demo-v1'
const SESSION_KEY = 'iuc-demo-session'
const DEMO_PASSWORD = 'Demo1234'

interface DemoDb {
  profiles: Profile[]
  passwords: Record<string, string>
  locations: Location[]
  categories: ResourceCategory[]
  resources: Resource[]
  requests: ReservationRequest[]
  reservations: Reservation[]
  deliveries: Delivery[]
  audit: AuditEntry[]
}

const nowISO = () => new Date().toISOString()
const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}-${Date.now()}`

const loc = (id: string, name: string, floor: number): Location => ({
  id,
  name,
  floor,
  building: 'Edificio principal',
})

const SETTINGS: Settings = {
  institution_name: 'Instituto Universitario de Caldas',
  opening_time: '06:00',
  closing_time: '18:00',
  slot_minutes: 60,
  password_reset_note:
    'La recuperación de contraseña la gestiona el encargado de sistemas e innovación tecnológica.',
}

/** Datos de ejemplo: ilustran los mockups y NO constituyen inventario institucional. */
function seed(): DemoDb {
  const profiles: Profile[] = [
    {
      id: 'u-encargado',
      email: 'encargado@iuc.edu.co',
      full_name: 'Carlos Gómez',
      role: 'encargado',
      is_active: true,
      created_at: nowISO(),
    },
    {
      id: 'u-ana',
      email: 'ana.martinez@iuc.edu.co',
      full_name: 'Ana Martínez',
      role: 'profesor',
      is_active: true,
      created_at: nowISO(),
    },
    {
      id: 'u-juan',
      email: 'juan.perez@iuc.edu.co',
      full_name: 'Juan Pérez',
      role: 'profesor',
      is_active: true,
      created_at: nowISO(),
    },
    {
      id: 'u-maria',
      email: 'maria.gomez@iuc.edu.co',
      full_name: 'María Gómez',
      role: 'profesor',
      is_active: true,
      created_at: nowISO(),
    },
  ]

  const locations = [
    loc('l-1', 'Piso 1', 1),
    loc('l-2', 'Piso 2', 2),
    loc('l-3', 'Piso 3', 3),
    loc('l-4', 'Piso 4', 4),
    loc('l-5', 'Piso 5', 5),
    loc('l-6', 'Piso 6', 6),
  ]

  const categories: ResourceCategory[] = [
    { id: 'c-comp', name: 'Salas de cómputo', kind: 'espacio' },
    { id: 'c-audi', name: 'Salas audiovisuales', kind: 'espacio' },
    { id: 'c-recr', name: 'Salas de recreación', kind: 'espacio' },
    { id: 'c-tv', name: 'Televisores', kind: 'equipo' },
    { id: 'c-llave', name: 'Llaves', kind: 'elemento' },
    { id: 'c-control', name: 'Controles remotos', kind: 'elemento' },
  ]

  const mk = (
    id: string,
    code: string,
    name: string,
    category_id: string,
    location_id: string,
    extra: Partial<Resource> = {},
  ): Resource => ({
    id,
    code,
    name,
    category_id,
    location_id,
    status: 'disponible',
    is_reservable: true,
    requires_delivery_item: false,
    capacity: null,
    notes: null,
    created_at: nowISO(),
    updated_at: nowISO(),
    ...extra,
  })

  const resources: Resource[] = [
    mk('r-1', 'SC-001', 'Sala de Cómputo A', 'c-comp', 'l-2', { capacity: 30, requires_delivery_item: true }),
    mk('r-2', 'SC-002', 'Sala de Cómputo B', 'c-comp', 'l-2', { capacity: 25, requires_delivery_item: true }),
    mk('r-3', 'SAV-010', 'Sala Audiovisual', 'c-audi', 'l-3', { capacity: 40, requires_delivery_item: true }),
    mk('r-4', 'SR-020', 'Sala de Recreación', 'c-recr', 'l-1', { capacity: 35, requires_delivery_item: true }),
    mk('r-5', 'TV-101', 'Televisor móvil 1', 'c-tv', 'l-1', {
      status: 'mantenimiento',
      requires_delivery_item: true,
    }),
    mk('r-6', 'TV-102', 'Televisor móvil 2', 'c-tv', 'l-4', { requires_delivery_item: true }),
    mk('r-7', 'KEY-010', 'Llave Sala de Cómputo A', 'c-llave', 'l-2', { requires_delivery_item: true }),
    mk('r-8', 'CTR-303', 'Control remoto Sala Audiovisual', 'c-control', 'l-3', {
      status: 'fuera_servicio',
      requires_delivery_item: true,
    }),
  ]

  const db: DemoDb = {
    profiles,
    passwords: Object.fromEntries(profiles.map((p) => [p.email, DEMO_PASSWORD])),
    locations,
    categories,
    resources,
    requests: [],
    reservations: [],
    deliveries: [],
    audit: [],
  }

  // Solicitudes de ejemplo (una aprobada, una pendiente, una rechazada)
  const t = todayISO()
  const req1: ReservationRequest = {
    id: 'q-1',
    requester_id: 'u-ana',
    resource_id: 'r-1',
    request_date: t,
    start_time: '09:00',
    end_time: '11:00',
    purpose: 'Clase de Programación I - Sección A',
    status: 'aprobada',
    decided_by: 'u-encargado',
    decided_at: nowISO(),
    decision_note: null,
    created_at: nowISO(),
  }
  const req2: ReservationRequest = {
    id: 'q-2',
    requester_id: 'u-juan',
    resource_id: 'r-3',
    request_date: t,
    start_time: '14:00',
    end_time: '16:00',
    purpose: 'Sustentación de proyectos de aula',
    status: 'pendiente',
    created_at: nowISO(),
  }
  const req3: ReservationRequest = {
    id: 'q-3',
    requester_id: 'u-maria',
    resource_id: 'r-2',
    request_date: t,
    start_time: '07:00',
    end_time: '09:00',
    purpose: 'Taller de bases de datos',
    status: 'rechazada',
    decision_note: 'El espacio se encuentra en mantenimiento preventivo programado.',
    decided_by: 'u-encargado',
    decided_at: nowISO(),
    created_at: nowISO(),
  }

  db.requests = [req1, req2, req3]
  db.reservations = [toReservation(req1)]
  db.deliveries = []
  db.audit = [
    entry(db, 'u-maria', 'Creó solicitud', 'solicitud', 'q-3', 'Sala de Cómputo B', null, 'pendiente'),
    entry(db, 'u-encargado', 'Rechazó solicitud', 'solicitud', 'q-3', 'Sala de Cómputo B', 'pendiente', 'rechazada'),
    entry(db, 'u-juan', 'Creó solicitud', 'solicitud', 'q-2', 'Sala Audiovisual', null, 'pendiente'),
    entry(db, 'u-ana', 'Creó solicitud', 'solicitud', 'q-1', 'Sala de Cómputo A', null, 'pendiente'),
    entry(db, 'u-encargado', 'Aprobó solicitud', 'solicitud', 'q-1', 'Sala de Cómputo A', 'pendiente', 'aprobada'),
  ]
  return db
}

function toReservation(req: ReservationRequest): Reservation {
  return {
    id: uid(),
    request_id: req.id,
    resource_id: req.resource_id,
    requester_id: req.requester_id,
    reservation_date: req.request_date,
    start_time: req.start_time,
    end_time: req.end_time,
    status: 'aprobada',
    created_at: nowISO(),
  }
}

function entry(
  db: DemoDb,
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  resourceLabel: string | null,
  prev: string | null,
  next: string | null,
  notes: string | null = null,
): AuditEntry {
  const actor = db.profiles.find((p) => p.id === actorId)
  return {
    id: uid(),
    actor_id: actorId,
    actor_email: actor?.email ?? 'sistema',
    actor_role: actor?.role ?? null,
    action,
    entity,
    entity_id: entityId,
    resource_label: resourceLabel,
    previous_state: prev,
    new_state: next,
    notes,
    created_at: nowISO(),
  }
}

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as DemoDb
  } catch {
    /* almacenamiento no disponible */
  }
  const fresh = seed()
  save(fresh)
  return fresh
}

function save(db: DemoDb): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    /* modo privado: la sesión funciona solo en memoria */
  }
}

export class DemoApi implements Api {
  readonly mode = 'demo' as const
  private db: DemoDb

  constructor() {
    this.db = load()
  }

  private persist() {
    save(this.db)
  }

  private label(resourceId: string): string {
    const r = this.db.resources.find((x) => x.id === resourceId)
    if (!r) return '—'
    const l = this.db.locations.find((x) => x.id === r.location_id)
    return l ? `${r.name} · ${l.name}` : r.name
  }

  private hydrateResource(r: Resource): Resource {
    const cat = this.db.categories.find((c) => c.id === r.category_id)
    const l = this.db.locations.find((x) => x.id === r.location_id)
    return {
      ...r,
      category_name: cat?.name ?? 'Sin categoría',
      kind: cat?.kind ?? 'espacio',
      location_label: l ? `${l.name} · ${l.building}` : 'Sin ubicación',
    }
  }

  private hydrateRequest(q: ReservationRequest): ReservationRequest {
    const p = this.db.profiles.find((x) => x.id === q.requester_id)
    return { ...q, requester_name: p?.full_name ?? 'Usuario', resource_label: this.label(q.resource_id) }
  }

  /* ------------------------------ Autenticación ----------------------------- */

  async getSession(): Promise<Profile | null> {
    const id = localStorage.getItem(SESSION_KEY)
    if (!id) return null
    const p = this.db.profiles.find((x) => x.id === id && x.is_active)
    return p ?? null
  }

  async signIn(email: string, password: string): Promise<Profile> {
    const mail = email.trim().toLowerCase()
    const p = this.db.profiles.find((x) => x.email.toLowerCase() === mail)
    if (!p) throw new Error('Correo o contraseña incorrectos.')
    if (this.db.passwords[p.email] !== password) throw new Error('Correo o contraseña incorrectos.')
    if (!p.is_active) throw new Error('Esta cuenta está inactiva. Contacta al encargado de sistemas.')
    localStorage.setItem(SESSION_KEY, p.id)
    return p
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(SESSION_KEY)
  }

  async requestPasswordReset(email: string): Promise<void> {
    const exists = this.db.profiles.some((p) => p.email.toLowerCase() === email.trim().toLowerCase())
    if (!exists) throw new Error('No existe una cuenta con ese correo institucional.')
    this.db.audit.push(
      entry(this.db, null, 'Solicitó recuperación de contraseña', 'cuenta', null, email, null, null),
    )
    this.persist()
  }

  /* -------------------------------- Catálogos ------------------------------- */

  async getSettings(): Promise<Settings> {
    return SETTINGS
  }

  async listLocations(): Promise<Location[]> {
    return [...this.db.locations].sort((a, b) => a.floor - b.floor)
  }

  async listCategories(): Promise<ResourceCategory[]> {
    return [...this.db.categories]
  }

  async listResources(): Promise<Resource[]> {
    return this.db.resources.map((r) => this.hydrateResource(r))
  }

  async saveResource(input: ResourceInput): Promise<Resource> {
    const actor = await this.getSession()
    if (!actor || actor.role !== 'encargado') throw new Error(friendlyDbError('row-level security'))
    const code = input.code.trim().toUpperCase()
    if (!code || !input.name.trim()) throw new Error('El código y el nombre son obligatorios.')

    const duplicated = this.db.resources.find((r) => r.code === code && r.id !== input.id)
    if (duplicated) throw new Error(friendlyDbError('duplicate key'))

    let resource: Resource
    if (input.id) {
      const current = this.db.resources.find((r) => r.id === input.id)
      if (!current) throw new Error('El recurso ya no existe.')
      const prev = current.status
      Object.assign(current, {
        code,
        name: input.name.trim(),
        category_id: input.category_id,
        location_id: input.location_id,
        status: input.status,
        is_reservable: input.is_reservable,
        requires_delivery_item: input.requires_delivery_item,
        capacity: input.capacity ?? null,
        notes: input.notes ?? null,
        updated_at: nowISO(),
      })
      resource = current
      this.db.audit.push(
        entry(
          this.db,
          actor.id,
          'Actualizó recurso',
          'recurso',
          current.id,
          `${current.name} · ${current.code}`,
          prev,
          current.status,
        ),
      )
    } else {
      resource = {
        id: uid(),
        code,
        name: input.name.trim(),
        category_id: input.category_id,
        location_id: input.location_id,
        status: input.status,
        is_reservable: input.is_reservable,
        requires_delivery_item: input.requires_delivery_item,
        capacity: input.capacity ?? null,
        notes: input.notes ?? null,
        created_at: nowISO(),
        updated_at: nowISO(),
      }
      this.db.resources.push(resource)
      this.db.audit.push(
        entry(this.db, actor.id, 'Registró recurso', 'recurso', resource.id, `${resource.name} · ${code}`, null, resource.status),
      )
    }
    this.persist()
    return this.hydrateResource(resource)
  }

  async removeResource(id: string): Promise<void> {
    const actor = await this.getSession()
    if (!actor || actor.role !== 'encargado') throw new Error(friendlyDbError('row-level security'))
    const resource = this.db.resources.find((r) => r.id === id)
    if (!resource) return
    resource.status = 'fuera_servicio'
    resource.is_reservable = false
    resource.updated_at = nowISO()
    this.db.audit.push(
      entry(this.db, actor.id, 'Retiró recurso del uso', 'recurso', id, `${resource.name} · ${resource.code}`, 'disponible', 'fuera_servicio'),
    )
    this.persist()
  }

  /* --------------------------- Solicitudes y reservas ----------------------- */

  async listRequests(options?: { status?: RequestStatus[]; onlyMine?: boolean }): Promise<ReservationRequest[]> {
    const actor = await this.getSession()
    if (!actor) throw new Error('Debes iniciar sesión.')
    let rows = this.db.requests
    if (actor.role === 'profesor' || options?.onlyMine) {
      rows = rows.filter((q) => q.requester_id === actor.id)
    }
    if (options?.status?.length) rows = rows.filter((q) => options.status!.includes(q.status))
    return rows
      .map((q) => this.hydrateRequest(q))
      .sort((a, b) => `${b.request_date}${b.start_time}`.localeCompare(`${a.request_date}${a.start_time}`))
  }

  async createRequest(input: NewRequestInput): Promise<ReservationRequest> {
    const actor = await this.getSession()
    if (!actor) throw new Error('Debes iniciar sesión.')
    const resource = this.db.resources.find((r) => r.id === input.resource_id)
    if (!resource) throw new Error('El recurso seleccionado no existe.')
    if (!resource.is_reservable) throw new Error('Ese recurso no admite reservas.')
    if (!isBookable(resource))
      throw new Error('El recurso no está disponible para reservas (mantenimiento o fuera de servicio).')

    const scheduleError = validateSchedule(input.start_time, input.end_time)
    if (scheduleError) throw new Error(scheduleError)
    if (!input.purpose.trim()) throw new Error('Debes indicar el propósito de la solicitud.')

    const conflict = findConflict(
      {
        resource_id: input.resource_id,
        request_date: input.request_date,
        start_time: input.start_time,
        end_time: input.end_time,
      },
      this.db.reservations,
    )
    if (conflict) throw new Error(friendlyDbError('no_overlap conflict'))

    const request: ReservationRequest = {
      id: uid(),
      requester_id: actor.id,
      resource_id: input.resource_id,
      request_date: input.request_date,
      start_time: input.start_time,
      end_time: input.end_time,
      purpose: input.purpose.trim(),
      status: INITIAL_REQUEST_STATUS,
      created_at: nowISO(),
    }
    this.db.requests.push(request)
    this.db.audit.push(
      entry(this.db, actor.id, 'Creó solicitud', 'solicitud', request.id, this.label(resource.id), null, 'pendiente'),
    )
    this.persist()
    return this.hydrateRequest(request)
  }

  async decideRequest(id: string, decision: 'aprobada' | 'rechazada', note?: string): Promise<void> {
    const actor = await this.getSession()
    if (!actor || actor.role !== 'encargado') throw new Error(friendlyDbError('row-level security'))
    const request = this.db.requests.find((q) => q.id === id)
    if (!request) throw new Error('La solicitud no existe.')
    if (request.status !== 'pendiente') throw new Error('Solo se pueden decidir solicitudes pendientes.')

    if (decision === 'aprobada') {
      const resource = this.db.resources.find((r) => r.id === request.resource_id)
      if (resource && !isBookable(resource))
        throw new Error('El recurso no está disponible (mantenimiento o fuera de servicio).')
      const conflict = findConflict(
        {
          resource_id: request.resource_id,
          request_date: request.request_date,
          start_time: request.start_time,
          end_time: request.end_time,
        },
        this.db.reservations,
      )
      if (conflict) throw new Error(friendlyDbError('no_overlap conflict'))
    }

    const prev = request.status
    request.status = decision
    request.decision_note = note?.trim() || null
    request.decided_by = actor.id
    request.decided_at = nowISO()

    if (decision === 'aprobada') {
      this.db.reservations.push(toReservation(request))
      const resource = this.db.resources.find((r) => r.id === request.resource_id)
      if (resource) resource.status = 'disponible'
    }
    this.db.audit.push(
      entry(
        this.db,
        actor.id,
        decision === 'aprobada' ? 'Aprobó solicitud' : 'Rechazó solicitud',
        'solicitud',
        request.id,
        this.label(request.resource_id),
        prev,
        decision,
        note ?? null,
      ),
    )
    this.persist()
  }

  async cancelRequest(id: string): Promise<void> {
    const actor = await this.getSession()
    if (!actor) throw new Error('Debes iniciar sesión.')
    const request = this.db.requests.find((q) => q.id === id)
    if (!request) throw new Error('La solicitud no existe.')
    const isOwner = request.requester_id === actor.id
    if (actor.role !== 'encargado' && !isOwner) throw new Error(friendlyDbError('row-level security'))
    if (!['pendiente', 'aprobada'].includes(request.status))
      throw new Error('Esta solicitud ya no se puede cancelar.')

    const prev = request.status
    request.status = 'cancelada'
    this.db.reservations = this.db.reservations.map((r) =>
      r.request_id === request.id ? { ...r, status: 'cancelada' } : r,
    )
    this.db.audit.push(
      entry(this.db, actor.id, 'Canceló solicitud', 'solicitud', request.id, this.label(request.resource_id), prev, 'cancelada'),
    )
    this.persist()
  }

  async listReservations(): Promise<Reservation[]> {
    const actor = await this.getSession()
    if (!actor) throw new Error('Debes iniciar sesión.')
    return this.db.reservations
      .filter((r) => actor.role === 'encargado' || r.requester_id === actor.id)
      .map((r) => ({
        ...r,
        resource_label: this.label(r.resource_id),
        requester_name: this.db.profiles.find((p) => p.id === r.requester_id)?.full_name,
      }))
  }

  /* -------------------------- Entregas y devoluciones ----------------------- */

  async listDeliveries(): Promise<Delivery[]> {
    const actor = await this.getSession()
    if (!actor) throw new Error('Debes iniciar sesión.')
    const rows = this.db.deliveries.filter(
      (d) => actor.role === 'encargado' || d.recipient_id === actor.id,
    )
    return rows
      .map((d) => ({
        ...d,
        resource_label: this.label(d.resource_id),
        recipient_name: this.db.profiles.find((p) => p.id === d.recipient_id)?.full_name,
        delivered_by_name: this.db.profiles.find((p) => p.id === d.delivered_by)?.full_name,
      }))
      .sort((a, b) => (b.delivered_at ?? '').localeCompare(a.delivered_at ?? ''))
  }

  async createDelivery(input: NewDeliveryInput): Promise<Delivery> {
    const actor = await this.getSession()
    if (!actor || actor.role !== 'encargado') throw new Error(friendlyDbError('row-level security'))
    const resource = this.db.resources.find((r) => r.id === input.resource_id)
    if (!resource) throw new Error('El recurso no existe.')
    if (!input.recipient_id) throw new Error('Debes indicar quién recibe el elemento.')

    const delivery: Delivery = {
      id: uid(),
      reservation_id: input.reservation_id,
      resource_id: input.resource_id,
      recipient_id: input.recipient_id,
      delivered_by: actor.id,
      delivered_at: dateTimeLocalToISO(input.delivered_at),
      due_at: input.due_at ? dateTimeLocalToISO(input.due_at) : null,
      returned_at: null,
      item_state: input.item_state || 'Buen estado',
      return_state: null,
      status: 'entregado',
      notes: input.notes ?? null,
      created_at: nowISO(),
    }
    this.db.deliveries.push(delivery)
    resource.status = 'prestado'
    this.db.audit.push(
      entry(this.db, actor.id, 'Registró entrega', 'entrega', delivery.id, this.label(resource.id), 'disponible', 'prestado'),
    )
    this.persist()
    return delivery
  }

  async registerReturn(deliveryId: string, payload: { return_state: string; notes?: string | null }): Promise<void> {
    const actor = await this.getSession()
    if (!actor || actor.role !== 'encargado') throw new Error(friendlyDbError('row-level security'))
    const delivery = this.db.deliveries.find((d) => d.id === deliveryId)
    if (!delivery) throw new Error('La entrega no existe.')
    if (delivery.returned_at) throw new Error('Esta entrega ya fue devuelta.')

    const resource = this.db.resources.find((r) => r.id === delivery.resource_id)
    const prev = delivery.status
    delivery.returned_at = nowISO()
    delivery.return_state = payload.return_state || 'Buen estado'
    delivery.status = 'devuelto'
    if (payload.notes) delivery.notes = payload.notes
    if (resource) {
      resource.status = payload.return_state === 'Con daños' ? 'mantenimiento' : 'disponible'
    }
    this.db.audit.push(
      entry(
        this.db,
        actor.id,
        'Registró devolución',
        'entrega',
        delivery.id,
        this.label(delivery.resource_id),
        prev,
        'devuelto',
        payload.notes ?? null,
      ),
    )
    this.persist()
  }

  /* --------------------------------- Historial ------------------------------ */

  async listAudit(filters?: AuditFilters): Promise<AuditEntry[]> {
    const actor = await this.getSession()
    if (!actor) throw new Error('Debes iniciar sesión.')
    let rows = [...this.db.audit]
    if (actor.role !== 'encargado') {
      rows = rows.filter((a) => a.actor_id === actor.id)
    }
    if (filters?.action) rows = rows.filter((a) => a.action === filters.action)
    if (filters?.entity) rows = rows.filter((a) => a.entity === filters.entity)
    if (filters?.actor_id) rows = rows.filter((a) => a.actor_id === filters.actor_id)
    if (filters?.from) rows = rows.filter((a) => a.created_at.slice(0, 10) >= filters.from!)
    if (filters?.to) rows = rows.filter((a) => a.created_at.slice(0, 10) <= filters.to!)
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  /* ---------------------------------- Cuentas ------------------------------- */

  async listProfiles(): Promise<Profile[]> {
    const actor = await this.getSession()
    if (!actor || actor.role !== 'encargado') throw new Error(friendlyDbError('row-level security'))
    return [...this.db.profiles].sort((a, b) => a.full_name.localeCompare(b.full_name))
  }

  async createProfessor(input: { email: string; full_name: string; password: string }): Promise<Profile> {
    const actor = await this.getSession()
    if (!actor || actor.role !== 'encargado') throw new Error(friendlyDbError('row-level security'))
    const email = input.email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('El correo no es válido.')
    if (input.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.')
    if (this.db.profiles.some((p) => p.email.toLowerCase() === email))
      throw new Error(friendlyDbError('duplicate key'))

    const profile: Profile = {
      id: uid(),
      email,
      full_name: input.full_name.trim() || email,
      role: 'profesor',
      is_active: true,
      created_at: nowISO(),
    }
    this.db.profiles.push(profile)
    this.db.passwords[email] = input.password
    this.db.audit.push(
      entry(this.db, actor.id, 'Creó cuenta de profesor', 'cuenta', profile.id, profile.full_name, null, 'activa'),
    )
    this.persist()
    return profile
  }

  async setProfileActive(id: string, active: boolean): Promise<void> {
    const actor = await this.getSession()
    if (!actor || actor.role !== 'encargado') throw new Error(friendlyDbError('row-level security'))
    const profile = this.db.profiles.find((p) => p.id === id)
    if (!profile) throw new Error('La cuenta no existe.')
    if (profile.role === 'encargado') throw new Error('No puedes desactivar la cuenta administradora.')
    const prev = profile.is_active ? 'activa' : 'inactiva'
    profile.is_active = active
    this.db.audit.push(
      entry(this.db, actor.id, active ? 'Activó cuenta' : 'Desactivó cuenta', 'cuenta', id, profile.full_name, prev, active ? 'activa' : 'inactiva'),
    )
    this.persist()
  }
}
