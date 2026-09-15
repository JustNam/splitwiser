/**
 * GroupsApi — everything that reads or writes groups.
 *
 * Same contract as AuthApi: every method returns `{ data, error }`, never
 * throws, and `error` is either null or a string ready to show a human.
 *
 * Postgres returns snake_case; the rest of the app speaks camelCase (see
 * constants/mock.js). Translating here means services and screens never have
 * to know which naming a value came from — which is why swapping Home from
 * mock data to real data will not touch a single service.
 */

import {
  MISSING_CONFIG_MESSAGE,
  isSupabaseConfigured,
  supabase,
} from '@/lib/supabase/client'

/**
 * The one place snake_case becomes camelCase. Every method funnels its rows
 * through here so the mapping exists once instead of at each call site.
 */
const toGroup = (row) => ({
  id: row.id,
  name: row.name,
  inviteCode: row.invite_code,
})

// The one select string for member rows, so listMembers() and getSnapshot()
// can never drift apart on which columns they ask for.
const MEMBER_SELECT =
  'id, group_id, name, type, email, account_id, accounts (id, name, email)'

const toMembers = (rows) =>
  rows.map((row) => ({
    id: row.id,
    groupId: row.group_id,
    type: row.type,
    accountId: row.account_id,
    name: row.name,
    // Only ever set on a guest, and only so they can claim the row later.
    email: row.email,
  }))

// Accounts ride along on the member rows; pull them into their own list
// because that's the shape displayName() and groupBalances() expect.
const toAccounts = (rows) =>
  rows
    .filter((row) => row.accounts)
    .map((row) => ({
      id: row.accounts.id,
      name: row.accounts.name,
      email: row.accounts.email,
    }))

export class GroupsApi {
  /**
   * Create a group and put the creator in it.
   *
   * Both inserts happen inside the create_group() Postgres function, so a
   * failure can't leave a group with nobody in it (migration 0002).
   *
   * @param {string} name
   * @returns {Promise<{ data: object|null, error: string|null }>}
   */
  static async create(name) {
    if (!isSupabaseConfigured) return { data: null, error: MISSING_CONFIG_MESSAGE }

    // .rpc() calls a Postgres function by name. The keys of the second
    // argument must match the function's parameter names EXACTLY — the SQL
    // declares `create_group(group_name text)`, so this is `group_name`, not
    // `name`. Get it wrong and Postgres reports the function as not existing,
    // because it looks functions up by name AND argument list.
    const { data, error } = await supabase.rpc('create_group', {
      group_name: name,
    })

    if (error) return { data: null, error: error.message }
    return { data: toGroup(data), error: null }
  }

  /**
   * Join an existing group by its invite code. The right code gets you in
   * with no approval step (spec A3).
   *
   * @param {string} code
   * `field` is 'code' when the refusal is about what was typed, so the form
   * can mark the input rather than leaving a sentence floating under it.
   *
   * @returns {Promise<{ data: object|null, error: string|null, field: string|null }>}
   */
  static async join(code) {
    if (!isSupabaseConfigured) {
      return { data: null, error: MISSING_CONFIG_MESSAGE, field: null }
    }

    const { data, error } = await supabase.rpc('join_group', { code })

    if (error) {
      // P0001 is `raise exception` — join_group itself refusing, which from a
      // signed-in caller can only be "no group has this code". Anything else
      // (a network failure, a 500) is not the user's typing, and saying it is
      // sends them back to re-read a code that was fine.
      //
      // join_group does raise P0001 for a signed-out caller too, but this form
      // never gets that far: it renders Sign in instead of the field.
      const field = error.code === 'P0001' ? 'code' : null
      return { data: null, error: error.message, field }
    }

    return { data: toGroup(data), error: null, field: null }
  }

  /**
   * Every group this account belongs to.
   *
   * @param {string} accountId
   * @returns {Promise<{ data: object[]|null, error: string|null }>}
   */
  static async listMine(accountId) {
    // An empty list rather than an error: with no config nobody is signed in,
    // so "you belong to no groups" is the honest answer.
    if (!isSupabaseConfigured) return { data: [], error: null }

    // Queried from `members`, not `groups`, because membership is what we
    // filter on. `groups (...)` inside the select string is Supabase's join
    // syntax: it follows the foreign key from members.group_id and nests the
    // whole group row under a `groups` key on each result. One request, no
    // second round trip to look the groups up by id.
    const { data, error } = await supabase
      .from('members')
      .select('id, group_id, groups (id, name, invite_code)')
      .eq('account_id', accountId)

    if (error) return { data: null, error: error.message }

    return {
      data: data.map((row) => ({
        // Spread the mapped group, then add one field the group row itself
        // doesn't carry.
        ...toGroup(row.groups),
        // The caller's own member id in this group. Every later write
        // (sessions, cost lines, ledger) is attributed to a member, not to an
        // account — the same person is a different member in each group.
        myMemberId: row.id,
      })),
      error: null,
    }
  }

  /**
   * Add someone who played to the group.
   *
   * The email is optional and is what lets them take the row over later: when
   * they sign up and confirm that address, claim_guest_rows() turns this very
   * row into their membership, history and all.
   *
   * If the email already belongs to an account, no guest is created at all —
   * they are added to the roster directly, so there is nothing to migrate.
   * The returned row says which happened, in its `type`.
   *
   * @param {string} groupId
   * @param {string} name
   * @param {string} [email]
   * @returns {Promise<{ data: object|null, error: string|null }>}
   */
  static async addGuest(groupId, name, email) {
    if (!isSupabaseConfigured) return { data: null, error: MISSING_CONFIG_MESSAGE }

    const { data, error } = await supabase.rpc('add_guest', {
      p_group_id: groupId,
      p_name: name,
      p_email: email?.trim() === '' ? null : (email ?? null),
    })

    if (error) return { data: null, error: error.message }

    // The function returns one members row, but toMembers() takes a list.
    return { data: toMembers([data])[0], error: null }
  }

  /**
   * Take over any guest rows that carry my confirmed email.
   *
   * Opportunistic: the app fires this after signing in and does not wait on
   * it. Almost every call has nothing to do.
   *
   * @returns {Promise<{ data: { claimed: number }|null, error: string|null }>}
   */
  static async claimGuestRows() {
    if (!isSupabaseConfigured) return { data: null, error: MISSING_CONFIG_MESSAGE }

    const { data, error } = await supabase.rpc('claim_guest_rows')

    if (error) return { data: null, error: error.message }

    // The groups just taken over, so the app can name them rather than
    // leaving somebody to discover a group they never joined.
    return { data: data ?? [], error: null }
  }

  /**
   * Replace the group's invite code. The old one stops working immediately,
   * for everyone — the screen warns before calling this.
   *
   * @param {string} groupId
   * @returns {Promise<{ data: object|null, error: string|null }>}
   */
  static async regenerateCode(groupId) {
    if (!isSupabaseConfigured) return { data: null, error: MISSING_CONFIG_MESSAGE }

    const { data, error } = await supabase.rpc('regenerate_invite_code', {
      p_group_id: groupId,
    })

    if (error) return { data: null, error: error.message }
    return { data: toGroup(data), error: null }
  }

  /**
   * Just the people in a group. What B2 needs — the chips to tick, and the
   * "Paid by" options.
   *
   * @param {string} groupId
   * @returns {Promise<{ data: { members: object[], accounts: object[] }|null, error: string|null }>}
   */
  static async listMembers(groupId) {
    if (!isSupabaseConfigured) return { data: null, error: MISSING_CONFIG_MESSAGE }

    const { data, error } = await supabase
      .from('members')
      .select(MEMBER_SELECT)
      .eq('group_id', groupId)

    if (error) return { data: null, error: error.message }

    return {
      data: { members: toMembers(data), accounts: toAccounts(data) },
      error: null,
    }
  }

  /**
   * Everything Home needs about one group, in the shapes constants/mock.js
   * uses.
   *
   * Matching those shapes is the point: balance.service and session.service
   * were written against the mock and don't change at all when the data
   * starts arriving from Postgres instead. The translation happens here, once.
   *
   * Five queries in parallel rather than one join — Home needs all five lists
   * whole, and Promise.all costs one round trip's worth of waiting.
   *
   * @param {string} groupId
   * @returns {Promise<{ data: object|null, error: string|null }>}
   */
  static async getSnapshot(groupId) {
    if (!isSupabaseConfigured) return { data: null, error: MISSING_CONFIG_MESSAGE }

    // One request, not five. The five ran in parallel and still took about
    // 850ms against this project, because each round trip costs ~350ms
    // whether it carries 574 bytes or 3.7KB — the whole snapshot is under
    // 7KB. get_group_snapshot() (migration 0012) returns the same shape the
    // five queries did, snake_case and all, so the mapping below is
    // unchanged.
    const { data, error } = await supabase.rpc('get_group_snapshot', {
      p_group_id: groupId,
    })

    if (error) return { data: null, error: error.message }

    return {
      data: {
        members: toMembers(data.members),
        accounts: toAccounts(data.members),
        sessions: data.sessions.map((row) => ({
          id: row.id,
          groupId: row.group_id,
          date: row.date,
          createdAt: row.created_at,
          createdByMemberId: row.created_by_member_id,
          updatedByMemberId: row.updated_by_member_id,
          updatedAt: row.updated_at,
        })),
        costLines: data.cost_lines.map((row) => ({
          id: row.id,
          sessionId: row.session_id,
          note: row.note,
          amount: row.amount,
          payerMemberId: row.payer_member_id,
        })),
        participants: data.participants.map((row) => ({
          id: row.id,
          sessionId: row.session_id,
          memberId: row.member_id,
        })),
        ledger: data.ledger.map((row) => ({
          id: row.id,
          debtorId: row.debtor_id,
          creditorId: row.creditor_id,
          amount: row.amount,
          type: row.type,
          sessionId: row.session_id,
          costLineId: row.cost_line_id,
          createdByMemberId: row.created_by_member_id,
          createdAt: row.created_at,
        })),
      },
      error: null,
    }
  }
}
