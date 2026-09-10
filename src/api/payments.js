/**
 * PaymentsApi — recording money that has changed hands.
 *
 * Same contract as the other api/ files: `{ data, error }`, never throws.
 */

import {
  MISSING_CONFIG_MESSAGE,
  isSupabaseConfigured,
  supabase,
} from '@/lib/supabase/client'

export class PaymentsApi {
  /**
   * Mark one or more debts as paid.
   *
   * Note what is NOT sent: the amount. Every debt on B5 is paid in full, so
   * settle_up() reads the outstanding amount from the ledger itself. That is
   * also the only way the write can be safe — the number on screen may be
   * minutes old.
   *
   * @param {object} params
   * @param {string} params.groupId
   * @param {{ costLineId: string, memberId: string }[]} params.items
   * @returns {Promise<{ data: { paid: number }|null, error: string|null }>}
   */
  static async settle({ groupId, items }) {
    if (!isSupabaseConfigured) return { data: null, error: MISSING_CONFIG_MESSAGE }

    const { data, error } = await supabase.rpc('settle_up', {
      p_group_id: groupId,
      p_items: items.map((item) => ({
        cost_line_id: item.costLineId,
        member_id: item.memberId,
      })),
    })

    if (error) return { data: null, error: error.message }

    // settle_up() returns how many payments it wrote.
    return { data: { paid: data }, error: null }
  }
}
