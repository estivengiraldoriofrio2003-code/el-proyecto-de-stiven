import { useEffect, useState } from 'react'
import { getApi } from '../services/data'
import type { Profile } from '../services/types'

/** Sesión del usuario autenticado, con redirección a /index.html si no hay sesión válida. */
export function useSession() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getApi()
      .getSession()
      .then((p) => {
        if (!alive) return
        if (!p) {
          window.location.replace('/index.html')
          return
        }
        setProfile(p)
      })
      .catch((e: Error) => {
        if (!alive) return
        setError(e.message)
        window.location.replace('/index.html?motivo=sesion')
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  return { profile, loading, error }
}

export const signOut = async () => {
  await getApi().signOut()
  window.location.replace('/index.html')
}

export const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
