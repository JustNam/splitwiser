'use client'

/**
 * The signup form.
 *
 * Three fields, and the extra one carries the weight: `name` is what everyone
 * in every group sees next to a number. Hence the hint under the input.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TextField from '@mui/material/TextField'
import { AuthApi } from '@/api/auth'
import { Button } from '@/components/Button'
import Style from './style.module.scss'

// Supabase rejects anything shorter, and does it with a server round-trip.
// Checking here means the user finds out while their thumb is still on the key.
const MIN_PASSWORD_LENGTH = 6

export function SignupForm() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Not an error: the "we sent you an email" state. Separate variable because
  // it replaces the form rather than sitting under it.
  const [notice, setNotice] = useState(null)

  /**
   * An error string if the form isn't ready to send, `null` if it is. Checks
   * run in the order the fields sit on screen, so the message always points at
   * the topmost problem.
   *
   * @returns {string|null}
   */
  function validate() {
    // `.trim()` matters: a single space would pass a length check and give you
    // a group member who appears to have no name at all.
    if (name.trim() === '') return 'Please enter your name.'

    // Deliberately crude — regex email validation is a rabbit hole, and the
    // real test is whether the confirmation email arrives.
    if (!email.includes('@')) return "That email doesn't look right."

    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    }

    return null
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)

    // Caught here, so a fixable typo never costs a network round-trip.
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }

    setSubmitting(true)

    // Trim name and email; never the password.
    const { data, error } = await AuthApi.signUp({
      name: name.trim(),
      email: email.trim(),
      password,
    })

    if (error) {
      setError(error)
      setSubmitting(false)
      return
    }

    // With "Confirm email" ON (the Supabase default) signUp succeeds but
    // returns no session — the account exists and isn't usable yet. Both
    // branches handled, so it works either way.
    if (data?.session) {
      router.push('/')
      return
    }

    setNotice('Check your email for a confirmation link, then sign in.')
    setSubmitting(false)
  }

  // Once the notice is up the form has nothing left to do — showing the fields
  // again just invites a second signup with the same email.
  if (notice) {
    return (
      <div className={Style.notice} role="status">
        <p className={Style.noticeTitle}>Almost there</p>
        <p>{notice}</p>
      </div>
    )
  }

  const canSubmit =
    name.trim() !== '' && email.trim() !== '' && password !== '' && !submitting

  return (
    <form className={Style.form} onSubmit={handleSubmit} noValidate>
      <div className={Style.field}>
        <TextField
          label="Your name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          fullWidth
          required
          disabled={submitting}
        />
        <p className={Style.hint}>
          This is the name everyone sees, in every group. There are no
          per-group nicknames.
        </p>
      </div>

      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        autoComplete="email"
        inputMode="email"
        fullWidth
        required
        disabled={submitting}
      />

      <TextField
        label="Password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        // "new-password" is the hint that makes a password manager offer to
        // GENERATE one instead of autofilling.
        autoComplete="new-password"
        helperText={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        fullWidth
        required
        disabled={submitting}
      />

      {error && (
        <p className={Style.error} role="alert">
          {error}
        </p>
      )}

      <Button type="submit" fullWidth disabled={!canSubmit}>
        {submitting ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  )
}
