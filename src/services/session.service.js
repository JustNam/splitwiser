/**
 * Session summaries — the rows in the Sessions list on Home. Pure functions.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// ---------------------------------------------------------------------------
// formatSessionDate
// ---------------------------------------------------------------------------
/**
 * '2026-08-30' → '30 Aug'
 *
 * Parsed by splitting the string, not with `new Date(...)`. Date treats a
 * bare 'YYYY-MM-DD' as UTC midnight, so formatting it in a timezone behind
 * UTC prints the day before.
 *
 * @param {string} isoDate - 'YYYY-MM-DD'
 * @returns {string}
 */
export function formatSessionDate(isoDate) {
  const [, month, day] = isoDate.split('-')
  return `${Number(day)} ${MONTHS[Number(month) - 1]}`
}

// ---------------------------------------------------------------------------
// sessionSummaries
// ---------------------------------------------------------------------------
/**
 * One row per session in a group, newest first.
 *
 * `subtitle` names the payer when there is exactly one, and falls back to a
 * head count when there are several — with two payers there is no single
 * name to show, and the count is what tells you whether the session looks
 * right at a glance.
 *
 * @param {object} params
 * @param {object[]} params.sessions
 * @param {object[]} params.costLines
 * @param {object[]} params.participants
 * @param {object[]} params.members
 * @param {object[]} params.accounts
 * @param {string} params.groupId
 * @returns {Array<{
 *   id: string, date: string, dateLabel: string, total: number,
 *   subtitle: string, isEdited: boolean,
 * }>}
 */
export function sessionSummaries({
  sessions,
  costLines,
  participants,
  members,
  accounts,
  groupId,
}) {
  const nameOf = (memberId) => {
    const member = members.find((m) => m.id === memberId)
    if (!member) return 'Unknown'
    const name = member.name ?? accounts.find((a) => a.id === member.accountId)?.name
    return member.type === 'guest' ? `${name} (guest)` : name
  }

  return sessions
    .filter((s) => s.groupId === groupId)
    .map((session) => {
      const lines = costLines.filter((c) => c.sessionId === session.id)
      const total = lines.reduce((sum, c) => sum + c.amount, 0)
      const notes = lines.map((c) => c.note).filter(Boolean).join(' + ')

      const payerIds = [...new Set(lines.map((c) => c.payerMemberId))]
      const headCount = participants.filter((p) => p.sessionId === session.id).length

      const who =
        payerIds.length === 1
          ? `paid by ${nameOf(payerIds[0])}`
          : `${headCount} people`

      return {
        id: session.id,
        date: session.date,
        createdAt: session.createdAt,
        dateLabel: formatSessionDate(session.date),
        total,
        subtitle: notes ? `${notes} · ${who}` : who,
        isEdited: Boolean(session.updatedAt),
      }
    })
    // Newest first. `date` is the day the game was played and is what people
    // think in, so it decides; createdAt only breaks a tie between two games
    // on the same day, which date alone leaves in an order that can change
    // from one page load to the next.
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        // ?? '' because constants/mock.js has no createdAt, and a service
        // should not throw on data that is merely older than it is.
        (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    )
}

// ---------------------------------------------------------------------------
// lastPlayedByMember
// ---------------------------------------------------------------------------
/**
 * memberId → the date of the last session they played, as 'YYYY-MM-DD'.
 *
 * Used to order the "Who played" chips. A group of thirty has a core of six
 * who play every week and a long tail who came once in March; putting the
 * regulars first is what stops the list being a hunt.
 *
 * @param {object[]} sessions
 * @param {object[]} participants
 * @returns {Map<string, string>}
 */
export function lastPlayedByMember(sessions, participants) {
  const dateOf = new Map(sessions.map((session) => [session.id, session.date]))
  const last = new Map()

  for (const row of participants) {
    const date = dateOf.get(row.sessionId)
    if (!date) continue

    const seen = last.get(row.memberId)
    if (!seen || date > seen) last.set(row.memberId, date)
  }

  return last
}

// ---------------------------------------------------------------------------
// latestLineUp
// ---------------------------------------------------------------------------
/**
 * Who played the most recent session — the default tick list for the next one.
 *
 * Turnout changes week to week, but not by much: the same people mostly turn
 * up. Starting from last week's line-up makes the common case no taps at all,
 * where starting from everyone ticked makes a group of thirty twenty-four
 * taps of work.
 *
 * Empty when the group has never played, and the caller falls back to
 * everyone — which is right for a brand-new group of two or three.
 *
 * @param {object[]} sessions - already newest-first
 * @param {object[]} participants
 * @returns {string[]} member ids
 */
export function latestLineUp(sessions, participants) {
  if (sessions.length === 0) return []

  const newest = sessions[0]
  return participants
    .filter((row) => row.sessionId === newest.id)
    .map((row) => row.memberId)
}
