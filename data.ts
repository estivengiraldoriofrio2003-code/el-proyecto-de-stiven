/**
 * Fachada de datos: elige la implementación real (Supabase) o la de demostración.
 * La decisión depende únicamente de que existan credenciales en .env.
 */
import type { Api } from './api'
import { DemoApi } from './demo'
import { SupabaseApi } from './supabaseApi'
import { isSupabaseConfigured } from './supabase'

let instance: Api | null = null

export const getApi = (): Api => {
  if (!instance) {
    instance = isSupabaseConfigured ? new SupabaseApi() : new DemoApi()
  }
  return instance
}

export { isSupabaseConfigured }
export type { Api }
