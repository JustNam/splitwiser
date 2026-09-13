/**
 * InvitesApi — asking the server to email someone.
 *
 * The only call in the app that does not go straight to Postgres. Sending
 * mail needs the secret key, which can only live on a server, so it goes
 * through /api/invite instead (see that file for why it re-checks who is
 * asking).
 */

import { supabase } from '@/lib/supabase/client'

export class InvitesApi {
  /**
   * Email a guest an invitation to set up their account.
   *
   * Never throws and never blocks anything: a session that saved correctly
   * must not be reported as failed because an email could not go out.
   *
   * @param {object} params
   * @param {string} params.email
   * @param {string} params.groupId
   * @returns {Promise<{ data: { ok: true }|null, error: string|null }>}
   */
  static async send({ email, groupId }) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) return { data: null, error: 'Not signed in.' }

      const response = await fetch('/api/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // The route uses this to find out who is really asking, rather
          // than trusting anything in the body.
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email, groupId }),
      })

      const payload = await response.json()

      if (!response.ok) return { data: null, error: payload.error ?? 'Invite failed.' }
      return { data: { ok: true }, error: null }
    } catch (cause) {
      return { data: null, error: cause.message }
    }
  }
}
