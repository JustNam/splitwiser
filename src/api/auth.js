/**
 * AuthApi — every call that talks to Supabase Auth, in one place.
 *
 * Components never import `supabase` directly; they call AuthApi. Every method
 * returns `{ data, error }` and never throws — `error` is either null or a
 * plain string ready to show a human.
 */

import {
  MISSING_CONFIG_MESSAGE,
  isSupabaseConfigured,
  supabase,
} from '@/lib/supabase/client'

export class AuthApi {
  /**
   * Create a new account. `name` is the name everyone in every group will see.
   *
   * @param {{ name: string, email: string, password: string }} params
   * @returns {Promise<{ data: object|null, error: string|null }>} data is
   *   `{ user, session }`; `session` is null when the project has "Confirm
   *   email" on, meaning the account exists but isn't usable yet.
   */
  static async signUp({ name, email, password }) {
    if (!isSupabaseConfigured) return { data: null, error: MISSING_CONFIG_MESSAGE }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // Supabase Auth owns its `users` table, so metadata is the only place a
      // name can ride along at signup. Lands on `user.user_metadata.name`,
      // where the on_auth_user_created trigger (supabase/schema.sql) picks it
      // up and writes the real `accounts` row.
      options: { data: { name } },
    })

    if (error) return { data: null, error: error.message }
    return { data, error: null }
  }

  /**
   * Sign an existing account in.
   *
   * @param {{ email: string, password: string }} params
   * @returns {Promise<{ data: object|null, error: string|null }>}
   */
  static async signIn({ email, password }) {
    if (!isSupabaseConfigured) return { data: null, error: MISSING_CONFIG_MESSAGE }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    // Passed through as-is: Supabase says "Invalid login credentials" for both
    // a wrong password and an unknown email on purpose. Being more specific
    // here would tell an attacker which emails are registered.
    if (error) return { data: null, error: error.message }
    return { data: data.session, error: null }
  }

  /**
   * Sign out, clearing the stored session.
   *
   * @returns {Promise<{ data: null, error: string|null }>}
   */
  static async signOut() {
    if (!isSupabaseConfigured) return { data: null, error: MISSING_CONFIG_MESSAGE }

    const { error } = await supabase.auth.signOut()
    return { data: null, error: error ? error.message : null }
  }

  /**
   * The session as it stands right now, read from storage.
   *
   * Reads localStorage without hitting the network — fast, but only as
   * trustworthy as the browser. Fine for deciding what to render; not how you
   * protect data (that's Row Level Security on the tables).
   *
   * @returns {Promise<{ data: object|null, error: string|null }>}
   */
  static async getSession() {
    // With no config there is simply nobody logged in, so `null` is the honest
    // answer and the app boots as signed out — not worth an error message.
    if (!isSupabaseConfigured) return { data: null, error: null }

    const { data, error } = await supabase.auth.getSession()
    if (error) return { data: null, error: error.message }
    return { data: data.session, error: null }
  }
}
