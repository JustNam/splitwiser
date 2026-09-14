/**
 * When this person last opened the activity feed.
 *
 * Keyed by account id, because one browser is regularly two accounts here —
 * and a badge that clears for the wrong person is worse than no badge.
 *
 * Per-browser rather than stored with the account: a read receipt is not
 * something the group needs to agree on, and keeping it out of the database
 * means no migration and nothing to keep in sync. The cost is that opening
 * the feed on a phone does not clear the badge on a laptop.
 */

const KEY = 'splitwiser.activitySeen'

function read() {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '{}')
  } catch {
    // Absent, unparseable, or a browser that refuses storage outright. All
    // three mean the same thing here: nothing has been seen.
    return {}
  }
}

/**
 * @param {string} accountId
 * @returns {string|null} ISO timestamp, or null for never
 */
export function readLastSeen(accountId) {
  return read()[accountId] ?? null
}

/**
 * @param {string} accountId
 * @param {string} iso
 */
export function writeLastSeen(accountId, iso) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...read(), [accountId]: iso }))
  } catch {
    // The feed still works; only the badge forgets.
  }
}
