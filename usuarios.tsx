import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AlertTriangle, Plus, ShieldCheck, UserCheck, UserX, Users } from 'lucide-react'
import '../css/base.css'
import '../css/pages.css'
import { AppShell } from '../components/AppShell'
import { EmptyState, Field, FormError, InfoNote, Modal, Spinner, toast } from '../components/ui'
import { initials, useSession } from '../js/session'
import { fmtDate } from '../js/dates'
import { getApi } from '../services/data'
import type { Profile } from '../services/types'

function UsuariosPage() {
  const { profile, loading } = useSession()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', password: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isAdmin = profile?.role === 'encargado'

  const load = useCallback(async () => {
    try {
      const data = await getApi().listProfiles()
      setProfiles(data)
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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)
    if (!form.full_name.trim() || !form.email.trim()) {
      setFormError('El nombre y el correo institucional son obligatorios.')
      return
    }
    if (form.password.length < 8) {
      setFormError('La contraseña temporal debe tener al menos 8 caracteres.')
      return
    }
    setSaving(true)
    try {
      await getApi().createProfessor({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
      })
      toast.success('Cuenta de profesor creada.')
      setCreating(false)
      setForm({ full_name: '', email: '', password: '' })
      setReloadKey((k) => k + 1)
    } catch (e) {
      setFormError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (target: Profile) => {
    const next = !target.is_active
    if (
      !window.confirm(
        next
          ? `¿Reactivar la cuenta de ${target.full_name}?`
          : `¿Desactivar la cuenta de ${target.full_name}? No podrá iniciar sesión.`,
      )
    )
      return
    try {
      await getApi().setProfileActive(target.id, next)
      toast.success(next ? 'Cuenta reactivada.' : 'Cuenta desactivada.')
      setReloadKey((k) => k + 1)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (loading) return <Spinner label="Verificando sesión…" />
  if (!profile) return null

  if (!isAdmin) {
    return (
      <AppShell profile={profile} title="Cuentas">
        <div className="card card-pad">
          <EmptyState
            icon={<ShieldCheck />}
            title="Módulo exclusivo del encargado de sistemas"
            hint="La administración de cuentas está protegida por las políticas de seguridad de la base de datos."
          />
        </div>
      </AppShell>
    )
  }

  const teachers = profiles.filter((p) => p.role === 'profesor')
  const admins = profiles.filter((p) => p.role === 'encargado')

  return (
    <AppShell
      profile={profile}
      title="Cuentas"
      subtitle="Administración de cuentas de profesor (dos perfiles: profesor y encargado)"
      actions={
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          <Plus size={15} /> Nueva cuenta
        </button>
      }
    >
      {error && (
        <div className="form-error mb-16">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      <InfoNote>
        Los profesores no pueden otorgarse permisos administrativos: el rol se asigna solo desde el
        servidor. Las cuentas se crean mediante una función segura (<code>admin-create-user</code>) que
        verifica el perfil del solicitante antes de usar la clave privada; esa clave nunca llega al
        navegador.
      </InfoNote>

      <div className="grid grid-3 mt-16 mb-20">
        <div className="stat-card">
          <div>
            <div className="stat-value">{teachers.length}</div>
            <div className="stat-label">Cuentas de profesor</div>
          </div>
          <Users />
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-value">{teachers.filter((p) => p.is_active).length}</div>
            <div className="stat-label">Cuentas activas</div>
          </div>
          <UserCheck />
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-value">{admins.length}</div>
            <div className="stat-label">Encargado de sistemas</div>
          </div>
          <ShieldCheck />
        </div>
      </div>

      {busy ? (
        <Spinner label="Cargando cuentas…" />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="table table-responsive">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo institucional</th>
                  <th>Perfil</th>
                  <th>Estado</th>
                  <th>Creada</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Nombre">
                      <span className="flex items-center gap-8">
                        <span className="avatar" style={{ width: 28, height: 28, flex: '0 0 28px', fontSize: 11 }}>
                          {initials(p.full_name)}
                        </span>
                        {p.full_name}
                      </span>
                    </td>
                    <td data-label="Correo" className="text-xs">
                      {p.email}
                    </td>
                    <td data-label="Perfil" className="text-xs">
                      <span className={`chip ${p.role === 'encargado' ? 'chip-mauve' : 'chip-neutral'}`}>
                        {p.role === 'encargado' ? 'Encargado' : 'Profesor'}
                      </span>
                    </td>
                    <td data-label="Estado">
                      <span className={`chip ${p.is_active ? 'chip-green' : 'chip-sand'}`}>
                        {p.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td data-label="Creada" className="text-xs nowrap">
                      {p.created_at ? fmtDate(p.created_at.slice(0, 10)) : '—'}
                    </td>
                    <td data-label="Acciones">
                      <div className="table-actions">
                        {p.role === 'encargado' ? (
                          <span className="text-xs text-muted">Cuenta administradora</span>
                        ) : (
                          <button className="btn btn-ghost btn-sm" onClick={() => toggle(p)}>
                            {p.is_active ? (
                              <>
                                <UserX size={14} /> Desactivar
                              </>
                            ) : (
                              <>
                                <UserCheck size={14} /> Activar
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={creating}
        title="Nueva cuenta de profesor"
        subtitle="Se crea con perfil de profesor; no es posible asignar el perfil de encargado desde la interfaz."
        onClose={() => !saving && setCreating(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCreating(false)} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={saving}>
              {saving ? 'Creando…' : 'Crear cuenta'}
            </button>
          </>
        }
      >
        <form onSubmit={submit}>
          <FormError message={formError} />
          <Field label="Nombre completo" htmlFor="u-name">
            <input
              id="u-name"
              className="input"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="Nombre del profesor"
              required
            />
          </Field>
          <Field label="Correo institucional" htmlFor="u-email">
            <input
              id="u-email"
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="nombre.apellido@iuc.edu.co"
              required
            />
          </Field>
          <Field
            label="Contraseña temporal"
            htmlFor="u-password"
            hint="Mínimo 8 caracteres. El profesor podrá cambiarla con el flujo de recuperación."
          >
            <input
              id="u-password"
              className="input"
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Contraseña temporal"
              required
            />
          </Field>
          <p className="text-xs text-muted">
            Este formulario requiere Supabase configurado y la Edge Function desplegada. En modo
            demostración la cuenta se crea localmente para probar la interfaz.
          </p>
        </form>
      </Modal>
    </AppShell>
  )
}

createRoot(document.getElementById('root')!).render(<UsuariosPage />)
