/**
 * SessionsApi — writing a session.
 *
 * Same contract as the other api/ files: `{ data, error }`, never throws,
 * `error` is a string ready to show a human.
 *
 * The whole write is one .rpc() call because it touches four tables. See
 * migration 0003 for why that has to be a Postgres function and not four
 * requests from here.
 */

import {
  MISSING_CONFIG_MESSAGE,
  isSupabaseConfigured,
  supabase,
} from '@/lib/supabase/client'

export class SessionsApi {
  /**
   * Log one session: what it cost, who paid, who played, who owes what.
   *
   * `lines` comes in camelCase like the rest of the app; the JSON handed to
   * Postgres uses snake_case keys because that is what the function reads.
   * This translation is the whole job of this file.
   *
   * @param {object} params
   * @param {string} params.groupId
   * @param {string} params.date - 'YYYY-MM-DD'
   * @param {{ note: string|null, amount: number, payerMemberId: string,
   *          shares: Record<string, number> }[]} params.lines
   *        `shares` is memberId → đồng, straight from computeSplit().
   * @param {string[]} params.participantIds
   * @returns {Promise<{ data: object|null, error: string|null }>}
   */
  static async create({ groupId, date, lines, participantIds }) {
    if (!isSupabaseConfigured) return { data: null, error: MISSING_CONFIG_MESSAGE }

    const { data, error } = await supabase.rpc('create_session', {
      p_group_id: groupId,
      p_date: date,
      p_lines: lines.map((line) => ({
        note: line.note,
        amount: line.amount,
        payer_member_id: line.payerMemberId,
        // Object.entries turns { m1: 100, m2: 200 } into
        // [['m1', 100], ['m2', 200]] — a shape the SQL can loop over.
        shares: Object.entries(line.shares).map(([memberId, amount]) => ({
          member_id: memberId,
          amount,
        })),
      })),
      p_participant_ids: participantIds,
    })

    if (error) return { data: null, error: error.message }

    return {
      data: { id: data.id, groupId: data.group_id, date: data.date },
      error: null,
    }
  }

  /**
   * Edit a session. Nothing in the ledger is overwritten: the difference
   * between what is recorded and what should be true is appended as
   * `adjustment` rows (migration 0006).
   *
   * `lines[].shares` must cover EVERY participant including the payer, so the
   * function can check the split still adds up to the cost.
   *
   * @param {object} params
   * @param {string} params.sessionId
   * @param {string} params.date - 'YYYY-MM-DD'
   * @param {{ costLineId: string, note: string|null, amount: number,
   *          shares: Record<string, number> }[]} params.lines
   * @param {string[]} params.participantIds
   * @param {string} params.summary - the sentence shown in B3's Edits list
   * @returns {Promise<{ data: { adjustments: number }|null, error: string|null }>}
   */
  static async edit({ sessionId, date, lines, participantIds, summary }) {
    if (!isSupabaseConfigured) return { data: null, error: MISSING_CONFIG_MESSAGE }

    const { data, error } = await supabase.rpc('edit_session', {
      p_session_id: sessionId,
      p_date: date,
      p_lines: lines.map((line) => ({
        cost_line_id: line.costLineId,
        note: line.note,
        amount: line.amount,
        shares: Object.entries(line.shares).map(([memberId, amount]) => ({
          member_id: memberId,
          amount,
        })),
      })),
      p_participant_ids: participantIds,
      p_summary: summary,
    })

    if (error) return { data: null, error: error.message }

    // edit_session() returns how many adjustment rows it wrote.
    return { data: { adjustments: data }, error: null }
  }
}
