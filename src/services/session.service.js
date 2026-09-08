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
        dateLabel: formatSessionDate(session.date),
        total,
        subtitle: notes ? `${notes} · ${who}` : who,
        isEdited: Boolean(session.updatedAt),
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}
