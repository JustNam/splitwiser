/**
 * AccountApi — the row behind the person who is signed in.
 *
 * `accounts` holds the name every group sees and the email you sign in with.
 * Everything else about a person lives in their `members` rows, one per
 * group; this is the one record that is theirs rather than a group's.
 */

import {
  MISSING_CONFIG_MESSAGE,
  isSupabaseConfigured,
  supabase,
} from '@/lib/supabase/client'

function toAccount(row) {
  return { id: row.id, name: row.name, email: row.email }
}

export class AccountApi {
  /**
   * The signed-in account.
   *
   * @param {string} accountId
   * @returns {Promise<{ data: object|null, error: string|null }>}
   */
  static async getMine(accountId) {
    if (!isSupabaseConfigured) return { data: null, error: MISSING_CONFIG_MESSAGE }

    const { data, error } = await supabase
      .from('accounts')
      .select('id, name, email')
      .eq('id', accountId)
      .single()

    if (error) return { data: null, error: error.message }
    return { data: toAccount(data), error: null }
  }

  /**
   * Change the name every group sees.
   *
   * The id is not a parameter — rename_account() reads it from the JWT, so
   * this can only ever rename the caller.
   *
   * @param {string} name
   * @returns {Promise<{ data: object|null, error: string|null }>}
   */
  static async rename(name) {
    if (!isSupabaseConfigured) return { data: null, error: MISSING_CONFIG_MESSAGE }

    const { data, error } = await supabase.rpc('rename_account', { p_name: name })

    if (error) return { data: null, error: error.message }
    return { data: toAccount(data), error: null }
  }
}
