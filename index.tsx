import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Eye, EyeOff, LockKeyhole } from 'lucide-react'
import '../css/base.css'
import '../css/pages.css'
import { getApi, isSupabaseConfigured } from '../services/data'
import { FormError, ToastStack, toast } from '../components/ui'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)

  // Si ya hay sesión activa, ir directo al panel (persistencia de sesión).
  useEffect(() => {
    getApi()
      .getSession()
      .then((profile) => {
        if (profile) window.location.replace('/panel.html')
      })
      .catch(() => undefined)
      .finally(() => setChecking(false))
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Ingresa tu correo institucional y tu contraseña.')
      return
    }
    setLoading(true)
    try {
      await getApi().signIn(email, password)
      toast.success('Sesión iniciada correctamente.')
      window.location.replace('/panel.html')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <section className="login-brand" aria-label="Información institucional">
        <div className="login-brand-inner">
          <img className="login-logo" src="/assets/logos/logo-iuc-light.svg" alt="" aria-hidden="true" />
          <h1>
            Instituto
            <br />
            Universitario
            <br />
            de Caldas
          </h1>
          <p>Gestión de espacios y recursos tecnológicos</p>
          <img
            className="login-building"
            src="/assets/backgrounds/edificio-iuc.svg"
            alt="Ilustración del edificio institucional"
          />
        </div>
      </section>

      <section className="login-form-side">
        <div className="login-card">
          <h2>Iniciar sesión</h2>
          <form onSubmit={handleSubmit} noValidate>
            <FormError message={error} />

            <div className="field">
              <label className="label" htmlFor="email">
                Correo institucional
              </label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="username"
                inputMode="email"
                placeholder="Correo institucional"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading || checking}
                required
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="password">
                Contraseña
              </label>
              <div className="password-wrap">
                <input
                  id="password"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading || checking}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <button className="btn btn-primary btn-block" type="submit" disabled={loading || checking}>
              {loading ? 'Ingresando…' : 'Iniciar sesión'}
            </button>
          </form>

          <p className="login-help">
            ¿Olvidaste tu contraseña? <a href="/recuperar.html">Contacta al encargado de sistemas</a>
          </p>

          {!isSupabaseConfigured && (
            <div className="login-demo-hint">
              <strong>Modo demostración.</strong> No hay credenciales de Supabase configuradas. Puedes
              recorrer la aplicación con:
              <br />
              Encargado: <code>encargado@iuc.edu.co</code> · Profesor: <code>ana.martinez@iuc.edu.co</code>
              <br />
              Contraseña: <code>Demo1234</code>
            </div>
          )}
        </div>
      </section>

      <div style={{ position: 'fixed', bottom: 12, left: 16, fontSize: 11, color: 'var(--ink-400)' }}>
        <LockKeyhole size={11} style={{ verticalAlign: '-1px' }} /> Acceso restringido a personal autorizado
      </div>
      <ToastStack />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<LoginPage />)
