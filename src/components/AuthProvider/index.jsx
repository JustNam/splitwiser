'use client'

/**
 * AuthProvider — "who is logged in", answered once for the whole app.
 *
 * Composed into AppProviders, which the root layout renders. Read it from a
 * component with the `useAuth()` hook, not by importing AuthContext directly.
 */

import { createContext, useCallback, useEffect, useRef, useState } from 'react'
import { AuthApi } from '@/api/auth'
import { GroupsApi } from '@/api/groups'
import { supabase } from '@/lib/supabase/client'

/**
 * Exported only so useAuth.js can read it — components should not touch this.
 *
 * The default is `null` rather than a fake session, so calling useAuth()
 * outside the provider fails loudly instead of reporting "logged out" forever.
 */
export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)

  /**
   * True until storage has been checked once. Without it, a protected page
   * sees `session === null` for one frame and bounces a logged-in user to
   * /signin.
   */
  const [loading, setLoading] = useState(true)

  // Once per page load, not once per auth event: onAuthStateChange also fires
  // on every silent token refresh, and there is nothing new to claim then.
  const claimed = useRef(false)

  useEffect(() => {
    /**
     * Subscribed BEFORE the first read, so a token refresh that lands while
     * getSession() is still in flight isn't missed. Fires on sign-in,
     * sign-out and every silent refresh — which is why the forms never
     * setSession themselves.
     */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setLoading(false)

      // Guest rows carrying this account's confirmed email become theirs,
      // in every group at once (migration 0008). Deliberately not awaited and
      // deliberately silent: it changes nothing on this screen, and almost
      // every call has nothing to do. Here rather than in the sign-in form
      // because this also catches the arrival from a confirmation link.
      if (newSession && !claimed.current) {
        claimed.current = true
        GroupsApi.claimGuestRows()
      }
    })

    // useEffect can't be async itself, hence the inner function.
    async function hydrate() {
      const { data } = await AuthApi.getSession()
      setSession(data)
      setLoading(false)
    }
    hydrate()

    // Without this you leak a listener on every hot reload.
    return () => subscription.unsubscribe()
  }, [])

  /**
   * Wrapped so screens don't import AuthApi themselves. `useCallback` keeps it
   * the same function object between renders.
   *
   * Note what it does NOT do: it never calls setSession(null) — the listener
   * above does. One writer per piece of state.
   */
  const signOut = useCallback(async () => {
    return AuthApi.signOut()
  }, [])

  const value = {
    session,
    user: session?.user ?? null,
    isAuthenticated: Boolean(session),
    loading,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
