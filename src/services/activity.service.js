/**
 * The group's activity feed. Pure functions.
 *
 * Splitwise lets anybody in a group edit anybody's expense, on the grounds
 * that whoever spots a mistake should be able to fix it — and pairs that with
 * notifications and a Recent Activity log, so nothing changes in silence.
 * SplitWiser had taken the permissive half without the accountable half: one
 * member could change what another owes and the other would never know unless
 * they happened to reopen that session.
 *
 * Nothing new is stored to build this. The ledger already records who wrote
 * every row and when, and sessions record who logged and last edited them.
 * The feed is that, read across the whole group instead of one session at a
 * time.
 */

import { displayName } from './money.service'
import { formatSessionDate } from './session.service'

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

// ---------------------------------------------------------------------------
// formatMoment
// ---------------------------------------------------------------------------
/**
 * '2026-09-14T02:13:29Z' → '14 Sep, 09:13'
 *
 * `new Date()` is right here, unlike with a session's date. A created_at is a
 * real instant, so converting it to the reader's own clock is the correct
 * thing to do; a bare 'YYYY-MM-DD' is a calendar day and converting it is how
 * you print the wrong one.
 *
 * @param {string} iso
 * @returns {string}
 */
export function formatMoment(iso) {
  const at = new Date(iso)
  const pad = (value) => String(value).padStart(2, '0')

  return `${at.getDate()} ${MONTHS[at.getMonth()]}, ${pad(at.getHours())}:${pad(
    at.getMinutes()
  )}`
}

// ---------------------------------------------------------------------------
// activityFeed
// ---------------------------------------------------------------------------
/**
 * Everything that has happened in the group, newest first.
 *
 * @param {object} params - a group snapshot, plus myMemberId
 * @returns {Array<{
 *   id: string, at: string, actor: string, kind: 'logged'|'edited'|'settled',
 *   text: string, sessionId: string, concernsMe: boolean,
 * }>}
 */
export function activityFeed({
  sessions,
  costLines,
  ledger,
  members,
  accounts,
  myMemberId,
}) {
  const nameOf = (memberId) => {
    const member = members.find((row) => row.id === memberId)
    return member ? displayName(member, accounts) : 'Someone'
  }

  const sessionById = new Map(sessions.map((session) => [session.id, session]))
  const events = []

  // --- a session being logged ---------------------------------------------
  for (const session of sessions) {
    const total = costLines
      .filter((line) => line.sessionId === session.id)
      .reduce((running, line) => running + line.amount, 0)

    const rows = ledger.filter((row) => row.sessionId === session.id)

    events.push({
      id: `logged:${session.id}`,
      at: session.createdAt,
      actor: nameOf(session.createdByMemberId),
      kind: 'logged',
      text: `logged ${formatSessionDate(session.date)}`,
      amount: total,
      sessionId: session.id,
      concernsMe:
        touchesMe(rows, myMemberId) || session.createdByMemberId === myMemberId,
    })
  }

  // --- edits and settlements ----------------------------------------------
  //
  // One action writes several rows in one transaction, so they share a
  // created_at and an author. Grouping on those turns them back into the
  // single thing a person did — the same trick B3's Edits list uses.
  const groups = new Map()

  for (const row of ledger) {
    if (row.type === 'share') continue

    const key = `${row.type}|${row.createdAt}|${row.createdByMemberId}|${row.sessionId}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  for (const [key, rows] of groups) {
    const [type] = key.split('|')
    const first = rows[0]
    const session = sessionById.get(first.sessionId)

    events.push({
      id: key,
      at: first.createdAt,
      actor: nameOf(first.createdByMemberId),
      kind: type === 'payment' ? 'settled' : 'edited',
      text:
        type === 'payment'
          ? `settled up with ${settledWith(rows, first.createdByMemberId, nameOf)}`
          : // The sentence the editor wrote. Never the ledger rows it produced:
            // the spec forbids showing "adjustment −24.000đ each".
            (first.note ?? 'edited a session'),
      amount: type === 'payment' ? sumOf(rows) : null,
      sessionId: first.sessionId,
      dateLabel: session ? formatSessionDate(session.date) : '',
      concernsMe: touchesMe(rows, myMemberId),
    })
  }

  // Newest first. String comparison is enough: these are ISO timestamps, and
  // ISO is designed to sort the same way as the instants it names.
  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

function touchesMe(rows, myMemberId) {
  return rows.some(
    (row) => row.debtorId === myMemberId || row.creditorId === myMemberId
  )
}

function sumOf(rows) {
  return rows.reduce((running, row) => running + row.amount, 0)
}

/**
 * Who the money moved between. A payment is stored receiver → payer, so the
 * other party is whichever end is not the person who recorded it.
 */
function settledWith(rows, actorId, nameOf) {
  const others = new Set(
    rows.map((row) => (row.debtorId === actorId ? row.creditorId : row.debtorId))
  )

  return [...others].map(nameOf).join(', ')
}

// ---------------------------------------------------------------------------
// unreadCount
// ---------------------------------------------------------------------------
/**
 * How many events that touch my money have happened since I last looked.
 *
 * Things I did myself don't count: I already know about those, and a badge
 * that lights up because of your own tap teaches you to ignore the badge.
 *
 * @param {object[]} events - from activityFeed()
 * @param {string|null} lastSeen - ISO, or null for never
 * @param {string} myName - to exclude my own actions
 * @returns {number}
 */
export function unreadCount(events, lastSeen, myName) {
  return events.filter(
    (event) =>
      event.concernsMe &&
      event.actor !== myName &&
      (lastSeen === null || event.at > lastSeen)
  ).length
}
