/**
 * Fake data — the FE-only stand-in for the database.
 *
 * Shapes follow the 7 tables in CourtTab_Database_Design.md exactly, but in
 * camelCase (snake_case ↔ camelCase is the adapter layer's job later, and
 * there is no adapter layer yet because there is no backend yet).
 *
 * MONEY IS ALWAYS AN INTEGER OF VND. 90000, never 90.000 and never 90000.5.
 * Floats and money don't mix — 0.1 + 0.2 !== 0.3 in JavaScript.
 *
 * The scenario below is lifted from "Ví dụ 1" in the database design doc, so
 * every number here can be checked against the doc.
 */

// ---------------------------------------------------------------------------
// Who is logged in. FE-only, so we just pick someone: Trân.
// ---------------------------------------------------------------------------
export const CURRENT_ACCOUNT_ID = 'a1'
export const CURRENT_MEMBER_ID = 'm1' // Trân's Member row inside group g1
export const CURRENT_GROUP_ID = 'g1'

// ---------------------------------------------------------------------------
// 1. Account — global identity (login). Not tied to any group.
//    The single source of truth for a roster member's name.
// ---------------------------------------------------------------------------
export const accounts = [
  { id: 'a1', name: 'Trân', email: 'tran@example.com' },
  { id: 'a2', name: 'Triết', email: 'triet@example.com' },
  { id: 'a3', name: 'Thắng', email: 'thang@example.com' },
  { id: 'a4', name: 'Lý', email: 'ly@example.com' },
]

// ---------------------------------------------------------------------------
// 2. Group
// ---------------------------------------------------------------------------
export const groups = [
  { id: 'g1', name: 'Badminton Sundays', inviteCode: 'CT-4K9P2M' },
  { id: 'g2', name: 'Company court', inviteCode: 'CT-7RB1XQ' },
]

// ---------------------------------------------------------------------------
// 3. Member — one person's slice inside exactly one group.
//    roster → name is null (read it from the Account)
//    guest  → name is set, accountId is null
//    Display name is always: member.name ?? account.name
// ---------------------------------------------------------------------------
export const members = [
  { id: 'm1', groupId: 'g1', type: 'roster', accountId: 'a1', name: null },
  { id: 'm2', groupId: 'g1', type: 'roster', accountId: 'a2', name: null },
  { id: 'm3', groupId: 'g1', type: 'roster', accountId: 'a3', name: null },
  { id: 'm4', groupId: 'g1', type: 'roster', accountId: 'a4', name: null },
  { id: 'm5', groupId: 'g1', type: 'guest', accountId: null, name: 'Nam' },

  // Second group, so the group-switcher dropdown on Home has something to show.
  { id: 'm6', groupId: 'g2', type: 'roster', accountId: 'a1', name: null },
]

// ---------------------------------------------------------------------------
// 4. Session
// ---------------------------------------------------------------------------
export const sessions = [
  {
    id: 's1',
    groupId: 'g1',
    date: '2026-08-30',
    createdByMemberId: 'm2', // Triết logged this one
    updatedByMemberId: null,
    updatedAt: null,
  },
  {
    id: 's2',
    groupId: 'g1',
    date: '2026-09-06',
    createdByMemberId: 'm1', // Trân logged this one
    updatedByMemberId: null,
    updatedAt: null,
  },
]

// ---------------------------------------------------------------------------
// 5. CostLine — one spend line, each with its OWN payer.
//    (The person who books the court needn't be the one who buys shuttlecocks.)
// ---------------------------------------------------------------------------
export const costLines = [
  { id: 'cl1', sessionId: 's1', note: 'Sân', amount: 360000, payerMemberId: 'm1' },
  { id: 'cl2', sessionId: 's1', note: 'Cầu', amount: 30000, payerMemberId: 'm2' },
  // Payer is a guest — allowed on purpose (see Concept v1).
  { id: 'cl3', sessionId: 's2', note: 'Sân', amount: 270000, payerMemberId: 'm5' },
]

// ---------------------------------------------------------------------------
// 6. Participant — attendance, kept separate from money, so someone who
//    owes 0đ is still recorded as having turned up.
// ---------------------------------------------------------------------------
export const participants = [
  { id: 'p1', sessionId: 's1', memberId: 'm1' },
  { id: 'p2', sessionId: 's1', memberId: 'm2' },
  { id: 'p3', sessionId: 's1', memberId: 'm3' },
  { id: 'p4', sessionId: 's1', memberId: 'm4' },

  { id: 'p5', sessionId: 's2', memberId: 'm1' },
  { id: 'p6', sessionId: 's2', memberId: 'm2' },
  { id: 'p7', sessionId: 's2', memberId: 'm3' },
  { id: 'p8', sessionId: 's2', memberId: 'm5' },
]

// ---------------------------------------------------------------------------
// 7. Ledger — the ONLY source for any balance. Append-only: never update,
//    never delete. `amount` is always positive; direction lives in the
//    debtor/creditor pair, never in a minus sign.
//
//    Payment rows point RECEIVER → PAYER (receiver is the debtor). Reads
//    backwards, is correct: it's what cancels out the original debt, and it
//    lets the balance formula ignore `type` entirely.
// ---------------------------------------------------------------------------
export const ledger = [
  // --- s1 / cl1: Sân 360.000 paid by Trân, split 4 ways = 90.000 each.
  //     Only 3 rows: a payer never owes themselves.
  { id: 'l1', debtorId: 'm2', creditorId: 'm1', amount: 90000, type: 'share', sessionId: 's1', costLineId: 'cl1', note: null, createdByMemberId: 'm2', createdAt: '2026-08-30T20:10:00Z' },
  { id: 'l2', debtorId: 'm3', creditorId: 'm1', amount: 90000, type: 'share', sessionId: 's1', costLineId: 'cl1', note: null, createdByMemberId: 'm2', createdAt: '2026-08-30T20:10:00Z' },
  { id: 'l3', debtorId: 'm4', creditorId: 'm1', amount: 90000, type: 'share', sessionId: 's1', costLineId: 'cl1', note: null, createdByMemberId: 'm2', createdAt: '2026-08-30T20:10:00Z' },

  // --- s1 / cl2: Cầu 30.000 paid by Triết, split 4 ways = 7.500 each.
  { id: 'l4', debtorId: 'm1', creditorId: 'm2', amount: 7500, type: 'share', sessionId: 's1', costLineId: 'cl2', note: null, createdByMemberId: 'm2', createdAt: '2026-08-30T20:10:00Z' },
  { id: 'l5', debtorId: 'm3', creditorId: 'm2', amount: 7500, type: 'share', sessionId: 's1', costLineId: 'cl2', note: null, createdByMemberId: 'm2', createdAt: '2026-08-30T20:10:00Z' },
  { id: 'l6', debtorId: 'm4', creditorId: 'm2', amount: 7500, type: 'share', sessionId: 's1', costLineId: 'cl2', note: null, createdByMemberId: 'm2', createdAt: '2026-08-30T20:10:00Z' },

  // --- Thắng settled his Cầu debt with Triết: 7.500, in full.
  //     Real life: Thắng handed Triết the money. Ledger: Triết is the debtor.
  { id: 'l7', debtorId: 'm2', creditorId: 'm3', amount: 7500, type: 'payment', sessionId: 's1', costLineId: 'cl2', note: null, createdByMemberId: 'm3', createdAt: '2026-09-01T09:24:00Z' },

  // --- s2 / cl3: Sân 270.000 paid by Nam (a guest), split 4 ways = 67.500.
  { id: 'l8', debtorId: 'm1', creditorId: 'm5', amount: 67500, type: 'share', sessionId: 's2', costLineId: 'cl3', note: null, createdByMemberId: 'm1', createdAt: '2026-09-06T19:40:00Z' },
  { id: 'l9', debtorId: 'm2', creditorId: 'm5', amount: 67500, type: 'share', sessionId: 's2', costLineId: 'cl3', note: null, createdByMemberId: 'm1', createdAt: '2026-09-06T19:40:00Z' },
  { id: 'l10', debtorId: 'm3', creditorId: 'm5', amount: 67500, type: 'share', sessionId: 's2', costLineId: 'cl3', note: null, createdByMemberId: 'm1', createdAt: '2026-09-06T19:40:00Z' },
]

/**
 * What the above adds up to, from Trân's (m1) point of view in group g1.
 * Use this to check your Home screen in Step 4 — if your numbers differ,
 * the bug is in your code, not in this file:
 *
 *   Triết (m2)  → you owe 7.500đ          (cl2 share)
 *   Thắng (m3)  → owes you 90.000đ        (cl1 share)
 *   Lý    (m4)  → owes you 90.000đ        (cl1 share)
 *   Nam   (m5)  → you owe 67.500đ         (cl3 share)  ← GUEST
 *
 *   Owed to you  180.000đ
 *   You owe       75.000đ
 *   Net         +105.000đ
 */
