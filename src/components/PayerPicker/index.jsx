'use client'

import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'

/**
 * Who paid — typed at, not scrolled through.
 *
 * This was a Select, which is fine at four people and unusable at thirty:
 * finding a name meant scrolling a list that shows six at a time, with no way
 * to say the one you already know. Autocomplete keeps the dropdown for anyone
 * who wants to browse and adds typing for everyone else.
 *
 * Clearing it is allowed. The forms already treat "no payer" as a state —
 * blockedText says "Choose who paid" and the save button stays off — so
 * disabling the clear button would only stop somebody undoing a wrong pick
 * without replacing it.
 *
 * Four copies of this existed, two per form. A control repeated is a control
 * that drifts.
 */
export function PayerPicker({
  members,
  nameOf,
  value,
  onChange,
  label = 'Paid by',
  size,
  disabled,
}) {
  const selected = members.find((member) => member.id === value) ?? null

  return (
    <Autocomplete
      options={members}
      value={selected}
      onChange={(_event, member) => onChange(member?.id ?? '')}
      getOptionLabel={(member) =>
        `${nameOf(member)}${member.type === 'guest' ? ' (guest)' : ''}`
      }
      // Without this, MUI compares the objects by reference and cannot tell
      // that the selected member and the one in the list are the same person
      // — the field looks empty next to a list containing the answer.
      isOptionEqualToValue={(option, current) => option.id === current.id}
      renderInput={(params) => <TextField {...params} label={label} />}
      size={size}
      disabled={disabled}
      fullWidth
    />
  )
}
