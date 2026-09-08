/**
 * Splitting one cost line among participants. Pure functions.
 *
 * Every method returns whole-đồng amounts per participant that sum to the
 * total EXACTLY. The method itself is never stored — only the amounts, as
 * ledger rows (see CourtTab_Split_Methods.md).
 */

export const SPLIT_EQUAL = 'equal'
export const SPLIT_EXACT = 'exact'
export const SPLIT_PERCENT = 'percent'
export const SPLIT_SHARES = 'shares'
export const SPLIT_ADJUSTED = 'adjusted'

// ---------------------------------------------------------------------------
// distribute
// ---------------------------------------------------------------------------
/**
 * Split an integer total in proportion to weights, keeping the sum exact.
 *
 *   distribute(300000, [1, 1, 1])        → [100000, 100000, 100000]
 *   distribute(100000, [1, 1, 1])        → [33334, 33333, 33333]
 *   distribute(390000, [40, 30, 15, 15]) → [156000, 117000, 58500, 58500]
 *
 * Money is whole đồng, so most divisions leave a few đồng over. Rounding each
 * share on its own lets the parts miss the total — and a cost line whose parts
 * don't add up leaves an orphan đồng of debt nobody can ever settle.
 *
 * @param {number} total - whole đồng
 * @param {number[]} weights
 * @returns {number[]} whole đồng, summing to exactly `total`
 */
export function distribute(total, weights) {
  const totalWeight = sum(weights)
  if (totalWeight <= 0) return weights.map(() => 0)

  // Step 1 — everyone's exact share, rounded DOWN. `lost` records how much
  // each person lost to that rounding.
  const amounts = []
  const lost = []

  for (const weight of weights) {
    const exactShare = (total * weight) / totalWeight
    const rounded = Math.floor(exactShare)

    amounts.push(rounded)
    lost.push(exactShare - rounded)
  }

  // Step 2 — rounding down always under-assigns. Count the đồng left over.
  const leftover = total - sum(amounts)

  // Step 3 — hand them out one at a time, biggest loser first. There is
  // always at least one đồng-less person to give to: each person lost under
  // 1đ, so the leftover is smaller than the number of people.
  for (let i = 0; i < leftover; i += 1) {
    const unluckiest = indexOfMax(lost)
    amounts[unluckiest] += 1
    lost[unluckiest] = -1 // paid back — don't pick them again
  }

  return amounts
}

// ---------------------------------------------------------------------------
// computeSplit
// ---------------------------------------------------------------------------
/**
 * Amounts per participant for one cost line.
 *
 * @param {object} params
 * @param {number} params.total - whole đồng
 * @param {string[]} params.participantIds
 * @param {string} params.method - one of the SPLIT_* constants
 * @param {Record<string, number>} [params.inputs] - per participant, meaning
 *   set by `method`: exact → đồng, percent → percent, shares → share count,
 *   adjusted → đồng to add or subtract on top of an equal baseline. Ignored
 *   by `equal`. Missing entries read as 0.
 * @returns {Record<string, number>} memberId → đồng
 */
export function computeSplit({ total, participantIds, method, inputs = {} }) {
  const amounts = splitAmounts(total, participantIds, method, inputs)

  const byMember = {}
  for (let i = 0; i < participantIds.length; i += 1) {
    byMember[participantIds[i]] = amounts[i]
  }

  return byMember
}

/**
 * The amounts as a plain array, in participant order. Split out from
 * computeSplit so that one keeps its shape and this one keeps the rules.
 */
function splitAmounts(total, participantIds, method, inputs) {
  const inputFor = (id) => inputs[id] ?? 0
  const equalWeights = () => participantIds.map(() => 1)

  if (method === SPLIT_EQUAL) {
    return distribute(total, equalWeights())
  }

  // Identical maths: a percent and a share count are both just weights.
  if (method === SPLIT_PERCENT || method === SPLIT_SHARES) {
    return distribute(total, participantIds.map(inputFor))
  }

  // Typed by hand, so nothing is computed. What stands between this and a
  // saved session is leftToAssign(), not arithmetic.
  if (method === SPLIT_EXACT) {
    return participantIds.map(inputFor)
  }

  if (method === SPLIT_ADJUSTED) {
    const base = distribute(total, equalWeights())
    return participantIds.map((id, i) => base[i] + inputFor(id))
  }

  throw new Error(`Unknown split method: ${method}`)
}

// ---------------------------------------------------------------------------
// leftToAssign
// ---------------------------------------------------------------------------
/**
 * Đồng of the total still unaccounted for. 0 means the split can be saved.
 *
 * Positive is under-assigned, negative is over — shown differently, because
 * "you are 30.000đ short" and "you have given away 30.000đ too much" need
 * different fixes.
 *
 * @param {number} total
 * @param {Record<string, number>} amounts - from computeSplit
 * @returns {number}
 */
export function leftToAssign(total, amounts) {
  return total - sum(Object.values(amounts))
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function sum(numbers) {
  let total = 0
  for (const n of numbers) total += n
  return total
}

function indexOfMax(numbers) {
  let best = 0
  for (let i = 1; i < numbers.length; i += 1) {
    if (numbers[i] > numbers[best]) best = i
  }
  return best
}
