import type {
  AuditEntry,
  AuditFilters,
  Delivery,
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
  Location,
} from './types'

/** Contrato único que consumen las páginas. Dos implementaciones: Supabase y demostración. */
export interface Api {
  readonly mode: 'supabase' | 'demo'

  // Autenticación
  getSession(): Promise<Profile | null>
  signIn(email: string, password: string): Promise<Profile>
  signOut(): Promise<void>
  requestPasswordReset(email: string): Promise<void>
  /** Solo disponible con Supabase (flujo de recuperación con token). */
  updatePassword?(password: string): Promise<void>

  // Catálogos
  getSettings(): Promise<Settings>
  listLocations(): Promise<Location[]>
  listCategories(): Promise<ResourceCategory[]>
  listResources(): Promise<Resource[]>
  saveResource(input: ResourceInput): Promise<Resource>
  removeResource(id: string): Promise<void>

  // Solicitudes y reservas
  listRequests(options?: { status?: RequestStatus[]; onlyMine?: boolean }): Promise<ReservationRequest[]>
  createRequest(input: NewRequestInput): Promise<ReservationRequest>
  decideRequest(id: string, decision: 'aprobada' | 'rechazada', note?: string): Promise<void>
  cancelRequest(id: string): Promise<void>
  listReservations(): Promise<Reservation[]>

  // Entregas y devoluciones
  listDeliveries(): Promise<Delivery[]>
  createDelivery(input: NewDeliveryInput): Promise<Delivery>
  registerReturn(
    deliveryId: string,
    payload: { return_state: string; notes?: string | null },
  ): Promise<void>

  // Historial
  listAudit(filters?: AuditFilters): Promise<AuditEntry[]>

  // Cuentas (solo encargado)
  listProfiles(): Promise<Profile[]>
  createProfessor(input: { email: string; full_name: string; password: string }): Promise<Profile>
  setProfileActive(id: string, active: boolean): Promise<void>
}
