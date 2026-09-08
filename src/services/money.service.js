/**
 * Money and name formatting.
 *
 * Pure functions only: same input → same output, no React, no I/O. Anything
 * that can fail belongs in `api/` instead.
 *
 * Deviates from ARCHITECTURE.MD on one point: services there are a class with
 * static methods. Two standalone functions gain nothing from the wrapper.
 */

// ---------------------------------------------------------------------------
// formatVnd
// ---------------------------------------------------------------------------
/**
 * Integer đồng → the string a human reads.
 *
 *   90000 → "90.000đ"    7500 → "7.500đ"    0 → "0đ"
 *
 * 'vi-VN' is what makes the thousands separator "." rather than ",".
 *
 * @param {number} amount - whole đồng, e.g. 90000
 * @returns {string}
 */
export function formatVnd(amount) {
  const formatted = new Intl.NumberFormat('vi-VN').format(amount)
  return `${formatted}đ`
}

// ---------------------------------------------------------------------------
// displayName
// ---------------------------------------------------------------------------
/**
 * A member's name as shown on screen.
 *
 * The rule from the database design — a name lives in exactly one place, so
 * two places can never disagree:
 *
 *   roster → `member.name` is ALWAYS null; the name lives on their account
 *   guest  → no account, so the name sits on the member row itself
 *
 *   displayName(m1, accounts) → "Trân"   // roster: name comes from accounts
 *   displayName(m5, accounts) → "Nam"    // guest:  name is on the member
 *
 * That null is what makes the two branches sort themselves out, with no check
 * on `member.type`.
 *
 * `??` and not `||`: `||` also rejects "" and 0 — harmless for a name, fatal
 * the day the same habit reaches money, where 0đ is a legitimate amount.
 * `?.` because `.find()` returns undefined when nothing matches.
 *
 * @param {object} member - a row from members[]
 * @param {object[]} accounts - the accounts[] array
 * @returns {string}
 */
export function displayName(member, accounts) {
  const account = accounts.find((a) => a.id === member.accountId)
  return member.name ?? account?.name
}
