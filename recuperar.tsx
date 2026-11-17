import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, MailCheck, ShieldQuestion } from 'lucide-react'
import '../css/base.css'
import '../css/pages.css'
import { getApi } from '../services/data'
import { FormError, FormSuccess, ToastStack, toast } from '../components/ui'

type Step = 'solicitar' | 'enviado' | 'actualizar'

function RecuperarPage() {
  const [step, setStep] = useState<Step>('solicitar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // El enlace de recuperación de Supabase vuelve con tokens en la URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('paso') === 'actualizar' || window.location.hash.includes('access_token')) {
      setStep('actualizar')
    }
  }, [])

  const requestReset = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    if (!email.trim()) {
      setError('Ingresa tu correo institucional.')
      return
    }
    setLoading(true)
    try {
      await getApi().requestPasswordReset(email)
      setStep('enviado')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const updatePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== repeat) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setLoading(true)
    try {
      const api = getApi()
      if (!api.updatePassword) {
        throw new Error(
          'La actualización de contraseña requiere Supabase configurado. En modo demostración, el encargado gestiona el acceso.',
        )
      }
      await api.updatePassword(password)
      toast.success('Contraseña actualizada.')
      setSuccess('Contraseña actualizada. Ya puedes iniciar sesión.')
      setTimeout(() => window.location.replace('/index.html'), 1600)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <section className="login-brand">
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
          <h2>{step === 'actualizar' ? 'Nueva contraseña' : 'Recuperar contraseña'}</h2>

          {step === 'solicitar' && (
            <form onSubmit={requestReset} noValidate>
              <p className="text-sm text-muted mb-16">
                Escribe tu correo institucional. Si la cuenta existe, recibirás un enlace para
                restablecer tu contraseña.
              </p>
              <FormError message={error} />
              <div className="field">
                <label className="label" htmlFor="email">
                  Correo institucional
                </label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  inputMode="email"
                  placeholder="nombre.apellido@iuc.edu.co"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
                {loading ? 'Enviando…' : 'Enviar enlace de recuperación'}
              </button>
            </form>
          )}

          {step === 'enviado' && (
            <div>
              <div className="form-success">
                <MailCheck size={16} style={{ flex: '0 0 16px' }} />
                <span>
                  Registramos la solicitud de recuperación para <strong>{email}</strong>. Revisa tu correo
                  institucional y sigue las instrucciones.
                </span>
              </div>
              <div className="info-note mt-12">
                <ShieldQuestion size={16} />
                <div>
                  Si no recibes el mensaje, el encargado de sistemas e innovación tecnológica puede
                  restablecer el acceso desde el módulo de cuentas. La política institucional de
                  recuperación queda pendiente de validación.
                </div>
              </div>
            </div>
          )}

          {step === 'actualizar' && (
            <form onSubmit={updatePassword} noValidate>
              <FormError message={error} />
              <FormSuccess message={success} />
              <div className="field">
                <label className="label" htmlFor="new-password">
                  Nueva contraseña
                </label>
                <input
                  id="new-password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="repeat-password">
                  Repite la contraseña
                </label>
                <input
                  id="repeat-password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repite la contraseña"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
                {loading ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </form>
          )}

          <p className="login-help">
            <a href="/index.html">
              <ArrowLeft size={13} style={{ verticalAlign: '-2px' }} /> Volver al inicio de sesión
            </a>
          </p>
        </div>
      </section>
      <ToastStack />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<RecuperarPage />)
