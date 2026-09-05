'use client'

/**
 * useAuth — read the logged-in user from anywhere in the tree.
 *
 *     const { user, loading, signOut } = useAuth()
 *
 * Why this file exists rather than importing AuthContext everywhere: the guard
 * below turns "Cannot destructure property 'user' of null" ten frames deep into
 * a sentence that names the mistake — and it's the seam, so components depend on
 * `useAuth()` rather than on how auth happens to be stored.
 *
 * @returns {{
 *   session: object|null,
 *   user: object|null,
 *   isAuthenticated: boolean,
 *   loading: boolean,
 *   signOut: () => Promise<{ data: null, error: string|null }>,
 * }}
 */

import { useContext } from 'react'
import { AuthContext } from '@/components/AuthProvider'

export function useAuth() {
  const context = useContext(AuthContext)

  if (context === null) {
    throw new Error(
      'useAuth() was called outside <AuthProvider>. Every screen renders ' +
        'inside AppProviders (see src/app/layout.jsx), so this usually means ' +
        'the component is being rendered somewhere unexpected.'
    )
  }

  return context
}
