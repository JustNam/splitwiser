'use client'

import clsx from 'clsx'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import { SectionHeader } from '@/components/SectionHeader'
import { TextButton } from '@/components/TextButton'
import { formatVnd } from '@/services/money.service'
import { methodsFor } from '@/services/split-plan.service'
import {
  SPLIT_ADJUSTED,
  SPLIT_EQUAL,
  SPLIT_PERCENT,
  SPLIT_SHARES,
} from '@/services/split.service'
import Style from './style.module.scss'

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

      <FormControl fullWidth disabled={disabled}>
        <InputLabel id="split-label">How</InputLabel>
        <Select
          labelId="split-label"
          label="How"
          value={method}
          onChange={(event) => onMethodChange(event.target.value)}
        >
          {methodsFor(multiLine).map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {multiLine && (
        <p className={Style.hint}>
          With more than one cost, the split is set in shares or percentages — typing
          exact đồng would mean typing them for each cost separately.
        </p>
      )}

      {missing ? (
        <p className={Style.hint}>{missing}</p>
      ) : method === SPLIT_EQUAL ? (
        <>
          <p className={Style.sentence}>
            {formatVnd(baseShare)} each for {participants.map(nameOf).join(', ')}.
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
function SplitRow({ name, method, value, onChange, output, disabled }) {
  // Digits only — except for `adjusted`, where a minus sign is the whole
  // point: it is the method for "everyone equally, but Nam owes 20.000đ less".
  function handleText(event) {
    const raw = event.target.value
    const signed = method === SPLIT_ADJUSTED && raw.trim().startsWith('-')
    const digits = raw.replace(/[^0-9]/g, '')
    const size = digits === '' ? 0 : Number(digits)
    onChange(signed ? -size : size)
  }

  return (
    <li className={Style.row}>
      <span className={Style.name}>{name}</span>

      {method === SPLIT_SHARES ? (
        <span className={Style.stepper}>
          <button
            type="button"
            className={Style.stepperButton}
            onClick={() => onChange(Math.max(0, value - 1))}
            disabled={disabled}
            aria-label={`One less share for ${name}`}
          >
            −
          </button>
          <span className={Style.stepperValue}>{value}</span>
          <button
            type="button"
            className={Style.stepperButton}
            onClick={() => onChange(value + 1)}
            disabled={disabled}
            aria-label={`One more share for ${name}`}
          >
            +
          </button>
        </span>
      ) : (
        <span className={Style.field}>
          {/* No visible label: the row already carries the person's name, and
              a floating label in each row would repeat it five times. The
              name is passed to the field so a screen reader gets it too. */}
          <TextField
            value={method === SPLIT_ADJUSTED && value > 0 ? `+${value}` : String(value)}
            onChange={handleText}
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
