'use client'

import { useState } from 'react'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'

/**
 * A password field with an eye on it.
 *
 * Typing a password you cannot see, on a phone keyboard, is how people end up
 * locked out of an account they have the password for. Showing it is the
 * fix — and it is safe in a way that saying it out loud is not, because the
 * person choosing to reveal it is the person looking at the screen.
 *
 * Shared rather than written twice: sign in and sign up had the same field
 * with different `autoComplete`, and two copies of a control is how they stop
 * matching.
 *
 * `type` flips between 'password' and 'text', which is what actually reveals
 * it. The eye is only the switch.
 */
export function PasswordField({ show: _ignored, ...props }) {
  const [visible, setVisible] = useState(false)

  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                // The label says what the tap will DO, not what the state is.
                // "Password is hidden" leaves a screen-reader user working
                // out what pressing it achieves.
                aria-label={visible ? 'Hide password' : 'Show password'}
                onClick={() => setVisible((current) => !current)}
                // Never a tab stop: it sits between the password field and
                // the submit button, and nobody filling in a form wants a
                // stop there. Still reachable — a screen reader lists it.
                tabIndex={-1}
                edge="end"
              >
                {visible ? (
                  <VisibilityOff fontSize="small" />
                ) : (
                  <Visibility fontSize="small" />
                )}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  )
}
