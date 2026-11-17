/**
 * Implementación REAL sobre Supabase (PostgreSQL + Auth + RLS).
 * Todo el control de acceso está en la base de datos: las políticas RLS son
 * la frontera de seguridad, no la interfaz.
 */
import type { Api } from './api'
import { friendlyDbError } from './rules'
import { supabase, functionsUrl } from './supabase'
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

type Row = Record<string, unknown>

const db = () => {
  if (!supabase) throw new Error('Supabase no está configurado. Revisa tu archivo .env.')
  return supabase
}

const unwrap = <T>(data: T | null, error: { message: string } | null): T => {
  if (error) throw new Error(friendlyDbError(error.message))
  return data as T
}

/** Los recursos llegan con su categoría y ubicación embebidas. */
const mapResource = (row: Row): Resource => {
  const cat = row.categories as Row | null
  const location = row.locations as Row | null
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    category_id: (row.category_id as string) ?? null,
    category_name: (cat?.name as string) ?? 'Sin categoría',
    kind: (cat?.kind as Resource['kind']) ?? 'espacio',
    location_id: (row.location_id as string) ?? null,
    location_label: location
      ? `${location.name} · Piso ${location.floor}`
      : 'Sin ubicación',
    status: row.status as Resource['status'],
    is_reservable: Boolean(row.is_reservable),
    requires_delivery_item: Boolean(row.requires_delivery_item),
    capacity: (row.capacity as number | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    created_at: (row.created_at as string) ?? undefined,
    updated_at: (row.updated_at as string) ?? undefined,
  }
}

const RESOURCE_SELECT = '*, categories(*), locations(*)'

export class SupabaseApi implements Api {
  readonly mode = 'supabase' as const

  /* ------------------------------ Autenticación ----------------------------- */

  async getSession(): Promise<Profile | null> {
    const { data } = await db().auth.getSession()
    const user = data.session?.user
    if (!user) return null
    return this.loadProfile(user.id, user.email ?? '')
  }

  private async loadProfile(userId: string, email: string): Promise<Profile | null> {
    const { data, error } = await db()
      .from('profiles')
      .select('id, email, full_name, role, is_active, created_at')
      .eq('id', userId)
      .maybeSingle()
    if (error) throw new Error(friendlyDbError(error.message))
    if (!data) return null
    const profile = data as unknown as Profile
    if (!profile.is_active) throw new Error('Esta cuenta está inactiva. Contacta al encargado de sistemas.')
    return { ...profile, email: profile.email || email }
  }

  async signIn(email: string, password: string): Promise<Profile> {
    const { data, error } = await db().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) {
      throw new Error(
        error.message.toLowerCase().includes('invalid')
          ? 'Correo o contraseña incorrectos.'
          : friendlyDbError(error.message),
      )
    }
    const profile = await this.loadProfile(data.user.id, data.user.email ?? '')
    if (!profile) throw new Error('Tu usuario no tiene perfil asignado. Contacta al encargado de sistemas.')
    return profile
  }

  async signOut(): Promise<void> {
    await db().auth.signOut()
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await db().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/recuperar.html?paso=actualizar`,
    })
    if (error) throw new Error(friendlyDbError(error.message))
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await db().auth.updateUser({ password })
    if (error) throw new Error(friendlyDbError(error.message))
  }

  /* -------------------------------- Catálogos ------------------------------- */

  async getSettings(): Promise<Settings> {
    const { data } = await db().from('settings').select('key, value')
    const map = Object.fromEntries(((data ?? []) as Row[]).map((r) => [r.key as string, r.value as string]))
    return {
      institution_name: map.institution_name ?? 'Instituto Universitario de Caldas',
      opening_time: map.opening_time ?? '06:00',
      closing_time: map.closing_time ?? '18:00',
      slot_minutes: Number(map.slot_minutes ?? 60),
      password_reset_note:
        map.password_reset_note ??
        'La recuperación de contraseña la gestiona el encargado de sistemas e innovación tecnológica.',
    }
  }

  async listLocations(): Promise<Location[]> {
    const { data, error } = await db().from('locations').select('*').order('floor')
    return unwrap(data as unknown as Location[], error)
  }

  async listCategories(): Promise<ResourceCategory[]> {
    const { data, error } = await db().from('resource_categories').select('*').order('name')
    return unwrap(data as unknown as ResourceCategory[], error)
  }

  async listResources(): Promise<Resource[]> {
    const { data, error } = await db().from('resources').select(RESOURCE_SELECT).order('code')
    return unwrap(data as unknown as Row[], error).map(mapResource)
  }

  async saveResource(input: ResourceInput): Promise<Resource> {
    const payload = {
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      category_id: input.category_id,
      location_id: input.location_id,
      status: input.status,
      is_reservable: input.is_reservable,
      requires_delivery_item: input.requires_delivery_item,
      capacity: input.capacity ?? null,
      notes: input.notes ?? null,
    }
    if (input.id) {
      const { data, error } = await db()
        .from('resources')
        .update(payload)
        .eq('id', input.id)
        .select(RESOURCE_SELECT)
        .single()
      return mapResource(unwrap(data as unknown as Row, error))
    }
    const { data, error } = await db().from('resources').insert(payload).select(RESOURCE_SELECT).single()
    return mapResource(unwrap(data as unknown as Row, error))
  }

  async removeResource(id: string): Promise<void> {
    const { error } = await db()
      .from('resources')
      .update({ status: 'fuera_servicio', is_reservable: false })
      .eq('id', id)
    if (error) throw new Error(friendlyDbError(error.message))
  }

  /* --------------------------- Solicitudes y reservas ----------------------- */

  async listRequests(options?: { status?: RequestStatus[]; onlyMine?: boolean }): Promise<ReservationRequest[]> {
    let query = db()
      .from('requests')
      .select('*, resources(name, code, locations(name)), profiles(full_name)')
      .order('request_date', { ascending: false })
      .order('start_time', { ascending: false })
    if (options?.status?.length) query = query.in('status', options.status)
    if (options?.onlyMine) {
      const me = await this.getSession()
      if (!me) throw new Error('Debes iniciar sesión.')
      query = query.eq('requester_id', me.id)
    }
    const { data, error } = await query
    const rows = unwrap(data as unknown as Row[], error)
    return rows.map((row) => {
      const resource = row.resources as Row | null
      const location = (resource?.locations as Row | null) ?? null
      const profile = row.profiles as Row | null
      return {
        id: String(row.id),
        requester_id: String(row.requester_id),
        requester_name: (profile?.full_name as string) ?? 'Usuario',
        resource_id: String(row.resource_id),
        resource_label: resource
          ? `${resource.name as string} · ${(location?.name as string) ?? ''}`.trim()
          : '—',
        request_date: String(row.request_date),
        start_time: String(row.start_time),
        end_time: String(row.end_time),
        purpose: String(row.purpose),
        status: row.status as RequestStatus,
        decision_note: (row.decision_note as string | null) ?? null,
        decided_by: (row.decided_by as string | null) ?? null,
        decided_at: (row.decided_at as string | null) ?? null,
        created_at: (row.created_at as string) ?? undefined,
      }
    })
  }

  async createRequest(input: NewRequestInput): Promise<ReservationRequest> {
    const me = await this.getSession()
    if (!me) throw new Error('Debes iniciar sesión.')
    const { data, error } = await db()
      .from('requests')
      .insert({
        requester_id: me.id,
        resource_id: input.resource_id,
        request_date: input.request_date,
        start_time: input.start_time,
        end_time: input.end_time,
        purpose: input.purpose.trim(),
        status: 'pendiente',
      })
      .select('id')
      .single()
    const row = unwrap(data as unknown as Row, error)
    return {
      id: String(row.id),
      requester_id: me.id,
      requester_name: me.full_name,
      resource_id: input.resource_id,
      request_date: input.request_date,
      start_time: input.start_time,
      end_time: input.end_time,
      purpose: input.purpose.trim(),
      status: 'pendiente',
    }
  }

  /**
   * Aprobar/rechazar delega en la función SQL `decide_request`, que valida rol,
   * estado, disponibilidad del recurso y conflictos de horario de forma atómica.
   * El historial lo escribe el trigger de auditoría.
   */
  async decideRequest(id: string, decision: 'aprobada' | 'rechazada', note?: string): Promise<void> {
    const { error } = await db().rpc('decide_request', {
      p_request_id: id,
      p_decision: decision,
      p_note: note?.trim() || null,
    })
    if (error) throw new Error(friendlyDbError(error.message))
  }

  async cancelRequest(id: string): Promise<void> {
    const { error } = await db().rpc('cancel_request', { p_request_id: id })
    if (error) throw new Error(friendlyDbError(error.message))
  }

  async listReservations(): Promise<Reservation[]> {
    const { data, error } = await db()
      .from('reservations')
      .select('*, resources(name, locations(name))')
      .order('reservation_date', { ascending: false })
    const rows = unwrap(data as unknown as Row[], error)
    return rows.map((row) => {
      const resource = row.resources as Row | null
      const location = (resource?.locations as Row | null) ?? null
      return {
        id: String(row.id),
        request_id: (row.request_id as string) ?? null,
        resource_id: String(row.resource_id),
        resource_label: resource
          ? `${resource.name as string} · ${(location?.name as string) ?? ''}`.trim()
          : '—',
        requester_id: String(row.requester_id),
        reservation_date: String(row.reservation_date),
        start_time: String(row.start_time),
        end_time: String(row.end_time),
        status: row.status as Reservation['status'],
        created_at: (row.created_at as string) ?? undefined,
      }
    })
  }

  /* -------------------------- Entregas y devoluciones ----------------------- */

  private mapDelivery(row: Row): Delivery {
    const resource = row.resources as Row | null
    const location = (resource?.locations as Row | null) ?? null
    const recipient = row.recipient as Row | null
    const deliverer = row.deliverer as Row | null
    return {
      id: String(row.id),
      reservation_id: (row.reservation_id as string) ?? null,
      resource_id: String(row.resource_id),
      resource_label: resource
        ? `${resource.name as string} · ${(location?.name as string) ?? ''}`.trim()
        : '—',
      recipient_id: String(row.recipient_id),
      recipient_name: (recipient?.full_name as string) ?? 'Usuario',
      delivered_by: (row.delivered_by as string) ?? null,
      delivered_by_name: (deliverer?.full_name as string) ?? '—',
      delivered_at: (row.delivered_at as string) ?? null,
      due_at: (row.due_at as string) ?? null,
      returned_at: (row.returned_at as string) ?? null,
      item_state: (row.item_state as string) ?? null,
      return_state: (row.return_state as string) ?? null,
      status: row.status as Delivery['status'],
      notes: (row.notes as string) ?? null,
      created_at: (row.created_at as string) ?? undefined,
    }
  }

  async listDeliveries(): Promise<Delivery[]> {
    const { data, error } = await db()
      .from('deliveries')
      .select(
        '*, resources(name, locations(name)), recipient:profiles!deliveries_recipient_id_fkey(full_name), deliverer:profiles!deliveries_delivered_by_fkey(full_name)',
      )
      .order('delivered_at', { ascending: false })
    return unwrap(data as unknown as Row[], error).map((r) => this.mapDelivery(r))
  }

  async createDelivery(input: NewDeliveryInput): Promise<Delivery> {
    const { data, error } = await db()
      .from('deliveries')
      .insert({
        reservation_id: input.reservation_id,
        resource_id: input.resource_id,
        recipient_id: input.recipient_id,
        delivered_at: input.delivered_at,
        due_at: input.due_at,
        item_state: input.item_state,
        notes: input.notes,
        status: 'entregado',
      })
      .select('id')
      .single()
    const row = unwrap(data as unknown as Row, error)
    const all = await this.listDeliveries()
    const created = all.find((d) => d.id === String(row.id))
    if (!created) throw new Error('La entrega se registró, pero no se pudo recuperar.')
    return created
  }

  async registerReturn(deliveryId: string, payload: { return_state: string; notes?: string | null }): Promise<void> {
    const { error } = await db().rpc('register_return', {
      p_delivery_id: deliveryId,
      p_return_state: payload.return_state,
      p_notes: payload.notes ?? null,
    })
    if (error) throw new Error(friendlyDbError(error.message))
  }

  /* --------------------------------- Historial ------------------------------ */

  async listAudit(filters?: AuditFilters): Promise<AuditEntry[]> {
    let query = db()
      .from('audit_log')
      .select('id, actor_id, actor_email, actor_role, action, entity, entity_id, resource_label, previous_state, new_state, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(300)
    if (filters?.action) query = query.eq('action', filters.action)
    if (filters?.entity) query = query.eq('entity', filters.entity)
    if (filters?.actor_id) query = query.eq('actor_id', filters.actor_id)
    if (filters?.from) query = query.gte('created_at', `${filters.from}T00:00:00`)
    if (filters?.to) query = query.lte('created_at', `${filters.to}T23:59:59`)
    const { data, error } = await query
    return unwrap(data as unknown as AuditEntry[], error)
  }

  /* ---------------------------------- Cuentas ------------------------------- */

  async listProfiles(): Promise<Profile[]> {
    const { data, error } = await db()
      .from('profiles')
      .select('id, email, full_name, role, is_active, created_at')
      .order('full_name')
    return unwrap(data as unknown as Profile[], error)
  }

  /**
   * Crear usuarios requiere la clave service_role, por lo que se invoca una
   * Edge Function que verifica el JWT del encargado antes de usar dicha clave.
   */
  async createProfessor(input: { email: string; full_name: string; password: string }): Promise<Profile> {
    const { data: session } = await db().auth.getSession()
    const token = session.session?.access_token
    if (!token) throw new Error('Debes iniciar sesión.')

    const response = await fetch(functionsUrl('admin-create-user'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
      },
      body: JSON.stringify({ ...input, role: 'profesor' }),
    })
    const payload = (await response.json().catch(() => ({}))) as { profile?: Profile; error?: string }
    if (!response.ok) throw new Error(friendlyDbError(payload.error ?? 'No se pudo crear la cuenta.'))
    if (!payload.profile) throw new Error('La cuenta se creó, pero no se recibió el perfil.')
    return payload.profile
  }

  async setProfileActive(id: string, active: boolean): Promise<void> {
    const { error } = await db().from('profiles').update({ is_active: active }).eq('id', id)
    if (error) throw new Error(friendlyDbError(error.message))
  }
}
