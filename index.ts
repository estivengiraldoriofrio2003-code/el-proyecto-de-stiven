// Edge Function de Supabase: admin-create-user
// Crea cuentas de profesor de forma segura.
//
// Despliegue:
//   supabase functions deploy admin-create-user
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...   (nunca en el frontend)
//
// La clave service_role SOLO existe aquí, en el servidor.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: 'La función no está configurada en el servidor.' }, 500)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Debes iniciar sesión.' }, 401)
  }

  // 1. Verificar la identidad del solicitante con su propio JWT.
  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  const { data: userData, error: userError } = await asCaller.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Sesión inválida.' }, 401)

  // 2. Verificar que su perfil sea 'encargado' (no basta con ocultar botones).
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: caller, error: callerError } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', userData.user.id)
    .single()

  if (callerError || !caller) return json({ error: 'Perfil no encontrado.' }, 403)
  if (caller.role !== 'encargado' || !caller.is_active) {
    return json({ error: 'Solo el encargado de sistemas puede crear cuentas.' }, 403)
  }

  // 3. Validar la entrada.
  let payload: { email?: string; full_name?: string; password?: string; role?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Cuerpo de la petición inválido.' }, 400)
  }

  const email = (payload.email ?? '').trim().toLowerCase()
  const fullName = (payload.full_name ?? '').trim()
  const password = payload.password ?? ''

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Correo inválido.' }, 400)
  if (password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400)

  // 4. El rol asignado es SIEMPRE 'profesor': la interfaz no puede crear encargados.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName || email, role: 'profesor' },
  })

  if (createError || !created.user) {
    return json({ error: createError?.message ?? 'No se pudo crear la cuenta.' }, 400)
  }

  // El trigger handle_new_user() ya insertó el perfil; se refuerza el nombre.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .update({ full_name: fullName || email, role: 'profesor' })
    .eq('id', created.user.id)
    .select('id, email, full_name, role, is_active, created_at')
    .single()

  if (profileError) return json({ error: profileError.message }, 500)

  return json({ profile })
})
