/**
 * Money and name formatting.
 *
 * Everything in here is a PURE FUNCTION: it takes arguments, returns a value,
 * and touches nothing else. No React, no useState, no reading from outside.
 * Give it the same input twice and you get the same answer twice.
 *
 * (Naming note: ARCHITECTURE.MD says services are `<name>.service.js` with
 * static methods on a class. Following the filename, skipping the class —
 * wrapping four standalone functions in a class buys nothing here. Say the
 * word if you'd rather keep it uniform with the rest of the codebase.)
 */

// ---------------------------------------------------------------------------
// TODO 1 — formatVnd
// ---------------------------------------------------------------------------
/**
 * Turn an integer number of đồng into something a human reads.
 *
 *   formatVnd(90000)   →  "90.000đ"
 *   formatVnd(7500)    →  "7.500đ"
 *   formatVnd(105000)  →  "105.000đ"
 *   formatVnd(0)       →  "0đ"
 *
 * Hint: JavaScript can do the dots for you —
 *
 *   new Intl.NumberFormat('vi-VN').format(90000)   // "90.000"
 *
 * `Intl` is built into the browser. 'vi-VN' means "format this the Vietnamese
 * way", which is why the separator is "." and not ",". Then add the đ.
 *
 * @param {number} amount - whole đồng, e.g. 90000
 * @returns {string}
 */
export function formatVnd(amount) {
  // your code here
  const formatted = new Intl.NumberFormat('vi-VN').format(amount)
  return `${formatted}đ`
}

// ---------------------------------------------------------------------------
// TODO 2 — displayName
// ---------------------------------------------------------------------------
/**
 * A member's name as shown on screen.
 *
 * Remember the rule from the database design: a roster member's `name` is
 * always null, because their name lives on their Account — that way there is
 * only ever one place a name can be, so two places can't disagree. A guest has
 * no Account, so their name sits directly on the member row.
 *
 *   displayName(m1, accounts)  →  "Trân"    // roster: name is null → look in accounts
 *   displayName(m5, accounts)  →  "Nam"     // guest:  name is on the member itself
 *
 * Two pieces of JavaScript you need:
 *
 *   accounts.find(a => a.id === 'a1')
 *     Walks the array and hands back the FIRST item where your test is true.
 *     Returns undefined if nothing matches — so `?.name` rather than `.name`,
 *     or it crashes on a missing account.
 *
 *   member.name ?? somethingElse
 *     "?? " means "use the left side unless it is null or undefined".
 *     Use ?? and not || here: || also rejects "" and 0, which would be wrong
 *     the day someone's name or amount is legitimately empty.
 *
 * @param {object} member - a row from members[]
 * @param {object[]} accounts - the accounts[] array
 * @returns {string}
 */
export function displayName(member, accounts) {
  // your code here
  const account = accounts.find((a) => a.id === member.accoundId) 
  return member.name
}
