'use client'

import { Fragment, useState } from 'react'
import clsx from 'clsx'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import { Chip, ChipGroup } from '@/components/Chip'
import { SectionHeader } from '@/components/SectionHeader'
import { TextButton } from '@/components/TextButton'
import { formatVnd } from '@/services/money.service'
import { SPLIT_METHODS, methodsFor } from '@/services/split-plan.service'
import {
  SPLIT_ADJUSTED,
  SPLIT_EQUAL,
  SPLIT_PERCENT,
  SPLIT_SHARES,
} from '@/services/split.service'
import Style from './style.module.scss'

// Above this, a share count stops being something you nudge and becomes
// something you type.
const STEPPER_MAX = 20

/**
 * The Split block, shared by New session and Edit session.
 *
 * The maths and the rules live in split-plan.service.js; this only draws
 * them. Both screens offer the same five methods, and two screens deciding
 * separately what a valid split looks like is two sets of rules within a
 * month.
 *
 * @param {object} props
 * @param {object} props.plan - from splitPlan()
 * @param {object[]} props.participants - member rows, in display order
 * @param {(member: object) => string} props.nameOf
 */
export function SplitPicker({
  plan,
  method,
  inputs,
  participants,
  nameOf,
  multiLine,
  disabled,
  onMethodChange,
  onInputChange,
  onSplitTheRest,
}) {
  const { total, shares, problem, readout } = plan

  // Whether the share counts are the kind of number you nudge.
  //
  // The stepper exists because shares are 1, 2, maybe 3 — typing is the wrong
  // tool for that. It is the wrong tool for 18:41:41, which is what a real
  // session reopened as: a + that moves 41 to 42 is not a nudge, it is a
  // guess. Reducing the weights by their common divisor (readBackSplit) gets
  // most splits back into nudging range; the ones it cannot are the ones that
  // genuinely have no small ratio, and those want a field.
  const nudgeable =
    method === SPLIT_SHARES &&
    participants.every((member) => (inputs[member.id] ?? 0) <= STEPPER_MAX)

  // Exact and Adjusted are typed in đồng, and computeSplit runs once per cost
  // line — so the same figure would be applied to every line whole, instead
  // of divided between them. Weights have no such problem.
  const allowed = new Set(methodsFor(multiLine).map((option) => option.value))

  const amounts = Object.values(shares)
  const baseShare = amounts.length > 0 ? Math.min(...amounts) : 0

  // A total that doesn't divide evenly leaves a few đồng over, and they have
  // to go to somebody. The spec is explicit that whoever gets them must be
  // visible rather than buried in a rounding.
  const extraNames = participants
    .filter((member) => shares[member.id] > baseShare)
    .map(nameOf)

  // Naming both halves when only one is missing reads as an instruction you
  // have already followed, so the sentence says the one thing that is left.
  const missing =
    total <= 0 && participants.length === 0
      ? 'Enter an amount and tick who played to see the split.'
      : total <= 0
        ? 'Enter an amount to see the split.'
        : participants.length === 0
          ? 'Tick who played to see the split.'
          : null

  return (
    <section className={Style.section}>
      <SectionHeader>Split</SectionHeader>

      {/* Buttons, not a dropdown. A dropdown showed one method and hid the
          other four, so the app could split by shares and nobody knew unless
          they opened it to find out.

          The row wraps rather than being forced onto one line. Five of these
          do fit on a desktop; on a 328px phone they cannot, and the two ways
          to make them are truncating the labels — unreadable — or scrolling
          sideways, which hides options again and undoes the reason for the
          change. Two lines on a phone is the honest answer. */}
      {/* All five, always — the two that cannot be used are shown greyed
          rather than removed. Taking them off the row meant somebody adding a
          second cost watched two options vanish with no account given, and
          the first person to see it asked why. An option you can see and
          cannot press explains itself; one that is not there does not. */}
      <ChipGroup>
        {SPLIT_METHODS.map((option) => {
          const blocked = !allowed.has(option.value)

          const chip = (
            <Chip
              selected={option.value === method}
              onClick={() => onMethodChange(option.value)}
              disabled={disabled || blocked}
            >
              {option.label}
            </Chip>
          )

          // The reason travels with the thing it is about, instead of a line
          // under the row that is on screen whether or not anyone wondered.
          //
          // The <span> is not decoration: a disabled button emits no mouse or
          // touch events at all, so a Tooltip wrapped straight around one
          // never opens. The span does the listening.
          return blocked ? (
            <Tooltip key={option.value} title="Needs a single cost" placement="top">
              <span className={Style.blockedChip}>{chip}</span>
            </Tooltip>
          ) : (
            <Fragment key={option.value}>{chip}</Fragment>
          )
        })}
      </ChipGroup>

      {missing ? (
        <p className={Style.hint}>{missing}</p>
      ) : method === SPLIT_EQUAL ? (
        <>
          {/* The amount, not the roster. Naming everyone cost three wrapped
              lines at ten people and said nothing the chips above had not
              already said — and the count is in the footer. */}
          <p className={Style.sentence}>
            {formatVnd(baseShare)} each for {participants.length}{' '}
            {participants.length === 1 ? 'person' : 'people'}
          </p>
          {extraNames.length > 0 && (
            <p className={Style.hint}>
              {extraNames.join(', ')} {extraNames.length === 1 ? 'pays' : 'pay'} 1đ more
              — {formatVnd(total)} doesn’t divide evenly.
            </p>
          )}
        </>
      ) : (
        <>
          <ul className={Style.rows}>
            {participants.map((member) => (
              <SplitRow
                key={member.id}
                name={nameOf(member)}
                method={method}
                value={inputs[member.id] ?? 0}
                onChange={(value) => onInputChange(member.id, value)}
                output={formatVnd(shares[member.id] ?? 0)}
                // Decided once for the column. Per row, one person on 3 and
                // another on 41 would get two different controls in one list.
                nudgeable={nudgeable}
                disabled={disabled}
              />
            ))}
          </ul>

          <div className={Style.foot}>
            <p className={clsx(Style.readout, problem && Style.readoutBad)}>
              {readout}
            </p>

            {/* Nothing to balance with shares: any positive weights divide the
                total exactly, so there is never a remainder. */}
            {method !== SPLIT_SHARES && (
              <TextButton onClick={onSplitTheRest} disabled={disabled}>
                Split the rest evenly
              </TextButton>
            )}
          </div>
        </>
      )}
    </section>
  )
}

/**
 * One person's line in a non-equal split.
 *
 * The control changes with the method, but the shape does not: name on the
 * left, what you set in the middle, what it comes to on the right. Shares get
 * a stepper rather than a text field because the numbers are 1, 2, maybe 3,
 * and typing is the wrong tool for a number you nudge.
 */
function SplitRow({ name, method, value, onChange, output, nudgeable, disabled }) {
  // What is in the box while it is being typed in, as a signed digit string.
  //
  // A number alone cannot hold the two states a half-typed entry passes
  // through. "-" on its own parsed to 0 and the box redrew as "0", so leading
  // with the minus — the natural way to type a negative — wiped the sign
  // every time; the only route to −20.000đ was to type the digits and then
  // go back to the front. And "" parsed to 0 too, so the box could never be
  // cleared: deleting the last digit put a 0 straight back.
  //
  // Dropped on blur, so anything that changes the numbers from outside — a
  // method change, ticking a player, Split the rest evenly — shows through.
  // All of those are clicks, and a click blurs the field first.
  const [typed, setTyped] = useState(null)

  // Digits only — except for `adjusted`, where a minus sign is the whole
  // point: it is the method for "everyone equally, but Nam owes 20.000đ less".
  function handleText(event) {
    const raw = event.target.value
    const signed = method === SPLIT_ADJUSTED && raw.trim().startsWith('-')
    const digits = raw.replace(/[^0-9]/g, '')
    const size = digits === '' ? 0 : Number(digits)

    setTyped(`${signed ? '-' : ''}${digits}`)
    onChange(signed ? -size : size)
  }

  return (
    <li className={Style.row}>
      <span className={Style.name}>{name}</span>

      {method === SPLIT_SHARES && nudgeable ? (
        <span className={Style.stepper}>
          <button
            type="button"
            className={Style.stepperButton}
            onClick={() => onChange(Math.max(0, value - 1))}
            disabled={disabled}
            aria-label={`One less share for ${name}`}
          >
            <RemoveIcon fontSize="small" />
          </button>
          <span className={Style.stepperValue}>{value}</span>
          <button
            type="button"
            className={Style.stepperButton}
            onClick={() => onChange(value + 1)}
            disabled={disabled}
            aria-label={`One more share for ${name}`}
          >
            <AddIcon fontSize="small" />
          </button>
        </span>
      ) : (
        <span className={Style.field}>
          {/* No visible label: the row already carries the person's name, and
              a floating label in each row would repeat it five times. The
              name is passed to the field so a screen reader gets it too. */}
          <TextField
            value={display(typed ?? String(value), method)}
            onChange={handleText}
            onBlur={() => setTyped(null)}
            slotProps={{
              htmlInput: {
                inputMode: 'numeric',
                'aria-label': `${name}'s share`,
                className: Style.input,
              },
            }}
            size="small"
            disabled={disabled}
          />
          {method === SPLIT_PERCENT && <span className={Style.suffix}>%</span>}
        </span>
      )}

      <span className={Style.output}>{output}</span>
    </li>
  )
}

/**
 * A signed digit string as it should appear in the box.
 *
 * Grouped, so a share reads 100.000 rather than 100000 — the Amount field a
 * few rows up has always formatted itself, and the two sitting side by side
 * in different notations made the smaller one look like a different kind of
 * number. Percent goes through the same path and is simply never long enough
 * for a separator to appear.
 *
 * Empty in, empty out: that is what lets the box be cleared.
 */
function display(text, method) {
  const negative = text.startsWith('-')
  const digits = text.replace(/[^0-9]/g, '')

  if (digits === '') return negative ? '-' : ''

  const grouped = new Intl.NumberFormat('vi-VN').format(Number(digits))

  if (negative) return `-${grouped}`

  // A plus in front, because `adjusted` is the one method whose numbers are
  // a change to something rather than the thing itself.
  return method === SPLIT_ADJUSTED && Number(digits) > 0 ? `+${grouped}` : grouped
}
