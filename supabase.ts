import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase.
 *
 * Solo se usa la clave pública `anon`. La clave `service_role` NUNCA debe
 * llegar al navegador: las operaciones privilegiadas viven en la Edge Function
 * `supabase/functions/admin-create-user` y en funciones SQL `SECURITY DEFINER`.
 */
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

export const isSupabaseConfigured = Boolean(
  url && anonKey && /^https?:\/\//.test(url) && !url.includes('tu-proyecto'),
)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'iuc-reservas-auth',
      },
    })
  : null

/** URL del proyecto + endpoint de funciones (para la Edge Function administrativa). */
export const functionsUrl = (fn: string): string => `${url.replace(/\/$/, '')}/functions/v1/${fn}`
