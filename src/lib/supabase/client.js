/**
 * The Supabase browser client — created once, imported everywhere.
 *
 * Why a single shared instance: the client holds the logged-in session in
 * localStorage and keeps a listener open for auth changes. Call createClient()
 * twice and you get two of those, which drift apart — one knows you signed
 * out, the other doesn't.
 *
 * Why `NEXT_PUBLIC_`: Next.js only sends an env var to the browser if its name
 * starts with NEXT_PUBLIC_. Without the prefix the value is server-only and
 * would arrive here as `undefined`.
 *
 * Is it safe to ship the anon key to the browser? Yes — that is what it's for.
 * It identifies the project; it doesn't grant permission. Permission comes from
 * Row Level Security policies on the tables. The key that DOES grant
 * everything is the `service_role` key: never put that in a NEXT_PUBLIC_ var.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Whether the two env vars are present. Every AuthApi method checks this and
 * returns MISSING_CONFIG_MESSAGE if not.
 *
 * Better than throwing here: the signin/signup pages import this module, so a
 * throw meant those screens couldn't render at all and `next build` failed.
 * This way the pages render and the problem announces itself on button press.
 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export const MISSING_CONFIG_MESSAGE =
  'Supabase is not configured. Copy .env.example to .env.local, fill in ' +
  'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from your ' +
  'Supabase dashboard (Project Settings → API), then restart `npm run dev`.'

if (!isSupabaseConfigured) {
  console.warn(`[supabase] ${MISSING_CONFIG_MESSAGE}`)
}

/**
 * createClient() throws on an empty URL, so a missing env var gets a valid
 * placeholder just to get past construction — nothing ever reaches it, the
 * guard in AuthApi returns first. (localhost:54321 is where the Supabase CLI
 * serves a local stack, if you ever run one.)
 */
export const supabase = createClient(
  SUPABASE_URL || 'http://localhost:54321',
  SUPABASE_ANON_KEY || 'missing-anon-key',
  {
    auth: {
      // Keep the session in localStorage and refresh the token before it
      // expires, so a reload doesn't sign you out. These are the defaults;
      // they're written out because they're the two behaviours you'd notice
      // if they were off.
      persistSession: true,
      autoRefreshToken: true,
    },
  }
)
