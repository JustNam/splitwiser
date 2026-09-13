import { createClient } from '@supabase/supabase-js'

/**
 * The Supabase client that can do admin things — sending an invite email is
 * the only one this app needs.
 *
 * ############################################################################
 * THIS FILE MUST NEVER BE IMPORTED BY A COMPONENT.
 *
 * The key it reads bypasses every rule in the database. Anything under
 * src/app that is rendered in the browser — anything with 'use client', and
 * anything a client component imports — gets bundled and shipped to the
 * browser, key and all. Route handlers (route.js) never are.
 *
 * Note the variable name: SUPABASE_SECRET_KEY, with no NEXT_PUBLIC_ prefix.
 * That prefix is what Next uses to decide a value may go to the browser, so
 * the absence of it is doing real work here, not just documentation.
 * ############################################################################
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY

export const isAdminConfigured = Boolean(url && secretKey)

/**
 * Built per request rather than once at module load: at build time the env
 * var may be absent, and createClient() with an empty key throws.
 */
export function adminClient() {
  if (typeof window !== 'undefined') {
    throw new Error(
      'adminClient() was called in the browser. This module is server-only — ' +
        'see the warning at the top of src/lib/supabase/admin.js.'
    )
  }

  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
