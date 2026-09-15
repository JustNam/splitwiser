/**
 * Everything the Split section of a form needs to know, worked out in one
 * place. Pure functions.
 *
 * New session and Edit session both offer the five methods, and the rules for
 * what counts as a valid split are subtle enough that a second copy would be
 * a second set of rules within a month. split.service.js does the maths; this
 * decides what to show and whether it can be saved.
 */

import { formatVnd } from './money.service'
import {
  SPLIT_ADJUSTED,
  SPLIT_EQUAL,
  SPLIT_EXACT,
  SPLIT_PERCENT,
  SPLIT_SHARES,
  computeSplit,
  distribute,
  leftToAssign,
} from './split.service'

// Short, because these are now five buttons on a row rather than five lines
// in a dropdown, and "By exact amounts" on a button is a button nothing else
// fits beside. Under a heading that already says Split, none of them is
// ambiguous on its own.
export const SPLIT_METHODS = [
  { value: SPLIT_EQUAL, label: 'Equally' },
  { value: SPLIT_EXACT, label: 'Exact' },
  { value: SPLIT_PERCENT, label: 'Percent' },
  { value: SPLIT_SHARES, label: 'Shares' },
  { value: SPLIT_ADJUSTED, label: 'Adjusted' },
]

/**
 * Which methods can be offered.
 *
 * Exact and Adjusted are typed in đồng, and đồng only mean something against
 * ONE total. With several costs there is no single total for them to name —
 * the design splits "a cost line's total" — so they would need a full set of
 * inputs per line. Weights have no such problem.
 *
 * @param {boolean} multiLine
 */
export function methodsFor(multiLine) {
  if (!multiLine) return SPLIT_METHODS

  return SPLIT_METHODS.filter(
    (option) => option.value !== SPLIT_EXACT && option.value !== SPLIT_ADJUSTED
  )
}

/**
 * What a method starts from when you switch to it: the equal split, said in
 * that method's own units. Switching never breaks a split that was already
 * correct — it just hands you the controls to change it.
 *
 * @param {string} method
 * @param {string[]} participantIds
 * @param {number} total
 * @returns {Record<string, number>}
 */
export function seedInputs(method, participantIds, total) {
  const ones = participantIds.map(() => 1)
  const seed = {}

  if (method === SPLIT_EXACT) {
    const amounts = distribute(total, ones)
    participantIds.forEach((id, index) => {
      seed[id] = amounts[index]
    })
  }

  if (method === SPLIT_PERCENT) {
    // distribute(100, ...) rather than Math.floor(100 / n): three people get
    // 34/33/33, which is 100. Flooring gives 33/33/33, and the screen would
    // open already refusing to save.
    const percents = distribute(100, ones)
    participantIds.forEach((id, index) => {
      seed[id] = percents[index]
    })
  }

  if (method === SPLIT_SHARES) {
    for (const id of participantIds) seed[id] = 1
  }

  if (method === SPLIT_ADJUSTED) {
    for (const id of participantIds) seed[id] = 0
  }

  return seed
}

/**
 * The amounts, and whether they can be saved.
 *
 * Split per cost line, because that is the unit the design divides: each line
 * has its own payer, and a share names the payer it is owed to. The weights
 * are the same on every line; only the amount they divide changes.
 *
 * @param {object} params
 * @param {number[]} params.lineTotals
 * @param {string[]} params.participantIds
 * @param {string} params.method
 * @param {Record<string, number>} params.inputs
 * @returns {{
 *   lineShares: Record<string, number>[],
 *   shares: Record<string, number>,
 *   total: number,
 *   inputTotal: number,
 *   remaining: number,
 *   problem: string|null,
 *   readout: string,
 * }}
 */
export function splitPlan({ lineTotals, participantIds, method, inputs }) {
  const total = lineTotals.reduce((running, amount) => running + amount, 0)

  const lineShares = lineTotals.map((amount) =>
    amount > 0 && participantIds.length > 0
      ? computeSplit({ total: amount, participantIds, method, inputs })
      : {}
  )

  // What each person owes for the whole session. Display only — a save sends
  // the per-line amounts, because that is where the debts attach.
  const shares = {}
  for (const perLine of lineShares) {
    for (const [memberId, amount] of Object.entries(perLine)) {
      shares[memberId] = (shares[memberId] ?? 0) + amount
    }
  }

  const inputTotal = participantIds.reduce(
    (running, id) => running + (inputs[id] ?? 0),
    0
  )
  const remaining = leftToAssign(total, shares)

  return {
    lineShares,
    shares,
    total,
    inputTotal,
    remaining,
    problem: problemWith({ method, inputTotal, remaining }),
    readout: readoutFor({ method, inputTotal, remaining, total }),
  }
}

/**
 * Each method is wrong in its own way, so each is checked on its own terms.
 *
 * Percent is the one that catches people out: distribute() shares the total in
 * PROPORTION to the weights, so 30/30/30 still hands out every đồng and
 * leftToAssign() reports nothing left. The error is in the percentages, not in
 * the money, so that is where it has to be caught.
 *
 * Shares never fail to add up either — any positive weights work — so the only
 * bad case is everyone on zero.
 */
function problemWith({ method, inputTotal, remaining }) {
  if (method === SPLIT_EQUAL) return null

  if (method === SPLIT_PERCENT) {
    return inputTotal === 100
      ? null
      : `Percentages add up to ${inputTotal}%, not 100%.`
  }

  if (method === SPLIT_SHARES) {
    return inputTotal > 0 ? null : 'Give at least one person a share.'
  }

  if (remaining === 0) return null

  return remaining > 0
    ? `${formatVnd(remaining)} is not assigned to anyone yet.`
    : `The split is ${formatVnd(-remaining)} over the total.`
}

/**
 * The line under the rows. Not always a remainder: with shares there is
 * nothing to run out of, so it reports the rate instead.
 */
function readoutFor({ method, inputTotal, remaining, total }) {
  if (method === SPLIT_PERCENT) return `Assigned ${inputTotal}%`

  if (method === SPLIT_SHARES) {
    const perShare = inputTotal > 0 ? Math.floor(total / inputTotal) : 0
    return `Per share ${formatVnd(perShare)}`
  }

  if (remaining === 0) return 'All assigned'

  return remaining > 0
    ? `Left to assign ${formatVnd(remaining)}`
    : `Over by ${formatVnd(-remaining)}`
}

/**
 * Spread whatever is missing across everyone, in this method's own units:
 * đồng for exact and adjusted, percentage points for percent.
 *
 * Always lands exactly on target, because distribute() hands out the
 * remainder rather than rounding it away — and it copes with a negative gap,
 * which is what "over by" needs.
 *
 * @returns {Record<string, number>} the inputs, corrected
 */
export function spreadTheRest({ participantIds, method, inputs, inputTotal, remaining }) {
  const gap = method === SPLIT_PERCENT ? 100 - inputTotal : remaining
  const spread = distribute(
    gap,
    participantIds.map(() => 1)
  )

  const next = { ...inputs }
  participantIds.forEach((id, index) => {
    next[id] = (next[id] ?? 0) + spread[index]
  })

  return next
}
