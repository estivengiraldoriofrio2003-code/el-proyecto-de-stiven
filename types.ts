/**
 * Modelo de dominio.
 * Refleja 1:1 el esquema PostgreSQL de src/sql.
 */

export type Role = 'profesor' | 'encargado'

export type ResourceKind = 'espacio' | 'equipo' | 'elemento'

export type ResourceStatus =
  | 'disponible'
  | 'en_uso'
  | 'mantenimiento'
  | 'fuera_servicio'
  | 'prestado'

export type RequestStatus =
  | 'pendiente'
  | 'aprobada'
  | 'rechazada'
  | 'cancelada'
  | 'finalizada'

export type ReservationStatus = 'aprobada' | 'cancelada' | 'finalizada'

export type DeliveryStatus = 'pendiente' | 'entregado' | 'devuelto' | 'vencida'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  is_active: boolean
  created_at?: string
}

export interface Location {
  id: string
  name: string
  floor: number
  building: string
  notes?: string | null
}

export interface ResourceCategory {
  id: string
  name: string
  kind: ResourceKind
  description?: string | null
}

export interface Resource {
  id: string
  code: string
  name: string
  category_id: string | null
  category_name?: string
  kind?: ResourceKind
  location_id: string | null
  location_label?: string
  status: ResourceStatus
  is_reservable: boolean
  requires_delivery_item: boolean
  capacity?: number | null
  notes?: string | null
  created_at?: string
  updated_at?: string
}

export interface ReservationRequest {
  id: string
  requester_id: string
  requester_name?: string
  resource_id: string
  resource_label?: string
  request_date: string // YYYY-MM-DD
  start_time: string // HH:MM
  end_time: string // HH:MM
  purpose: string
  status: RequestStatus
  decision_note?: string | null
  decided_by?: string | null
  decided_at?: string | null
  created_at?: string
}

export interface Reservation {
  id: string
  request_id: string | null
  resource_id: string
  resource_label?: string
  requester_id: string
  requester_name?: string
  reservation_date: string
  start_time: string
  end_time: string
  status: ReservationStatus
  created_at?: string
}

export interface Delivery {
  id: string
  reservation_id: string | null
  resource_id: string
  resource_label?: string
  recipient_id: string
  recipient_name?: string
  delivered_by: string | null
  delivered_by_name?: string
  delivered_at: string | null
  due_at: string | null
  returned_at: string | null
  item_state: string | null
  return_state: string | null
  status: DeliveryStatus
  notes: string | null
  created_at?: string
}

export interface AuditEntry {
  id: string
  actor_id: string | null
  actor_email: string
  actor_role: Role | null
  action: string
  entity: string
  entity_id: string | null
  resource_label: string | null
  previous_state: string | null
  new_state: string | null
  notes: string | null
  created_at: string
}

export interface Settings {
  institution_name: string
  opening_time: string
  closing_time: string
  slot_minutes: number
  password_reset_note: string
}

export type DataMode = 'supabase' | 'demo'

export interface ResourceInput {
  id?: string
  code: string
  name: string
  category_id: string
  location_id: string
  status: ResourceStatus
  is_reservable: boolean
  requires_delivery_item: boolean
  capacity?: number | null
  notes?: string | null
}

export interface NewRequestInput {
  resource_id: string
  request_date: string
  start_time: string
  end_time: string
  purpose: string
}

export interface NewDeliveryInput {
  reservation_id: string | null
  resource_id: string
  recipient_id: string
  delivered_at: string
  due_at: string | null
  item_state: string
  notes: string | null
}

export interface AuditFilters {
  action?: string
  entity?: string
  from?: string
  to?: string
  actor_id?: string
}
