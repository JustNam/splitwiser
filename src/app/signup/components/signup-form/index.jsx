'use client'

/**
 * The signup form.
 *
 * Three fields, and the extra one carries the weight: `name` is what everyone
 * in every group sees next to a number. Hence the hint under the input.
 */

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import TextField from '@mui/material/TextField'
import { AuthApi } from '@/api/auth'
import { Button } from '@/components/Button'
import { useToast } from '@/components/Toast'
import { readNextPath } from '@/lib/next-path'
import Style from './style.module.scss'

// Supabase rejects anything shorter, and does it with a server round-trip.
// Checking here means the user finds out while their thumb is still on the key.
const MIN_PASSWORD_LENGTH = 6

export function SignupForm() {
  const router = useRouter()
  const toast = useToast()

  // Where to land afterwards. Usually Home; the invite link sends people
  // back to /join with their code still in the URL.
  const nextPath = readNextPath(useSearchParams())

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Two kinds of wrong, kept apart on purpose. `error` is the server saying
  // no — that email is taken, the network is down — and belongs under the
  // form. `fieldError` is one field being wrong, and belongs ON that field:
  // passing it to MUI as `error` + `helperText` is what sets aria-invalid and
  // wires aria-describedby, so a screen reader says WHICH box to go back to
  // instead of reading a sentence that floats free of all three.
  const [fieldError, setFieldError] = useState(null)

  const problemWith = (field) =>
    fieldError?.field === field ? fieldError.message : null

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
    if (name.trim() === '') {
      return { field: 'name', message: 'Please enter your name.' }
    }

    // Deliberately crude — regex email validation is a rabbit hole, and the
    // real test is whether the confirmation email arrives.
    if (!email.includes('@')) {
      return { field: 'email', message: "That email doesn't look right." }
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return {
        field: 'password',
        message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
      }
    }

    return null
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)

    // Caught here, so a fixable typo never costs a network round-trip.
    const problem = validate()
    if (problem) {
      setFieldError(problem)
      return
    }

    setFieldError(null)

    setSubmitting(true)

    // Trim name and email; never the password.
    const { data, error } = await AuthApi.signUp({
      name: name.trim(),
      email: email.trim(),
      password,
    })

    if (error) {
      setError(error)
      toast.error(error)
      setSubmitting(false)
      return
    }

    // With "Confirm email" ON (the Supabase default) signUp succeeds but
    // returns no session — the account exists and isn't usable yet. Both
    // branches handled, so it works either way.
    if (data?.session) {
      toast.success('Account created')
      router.push(nextPath)
      return
    }

    toast.success('Account created')

    setNotice('Check your email for a confirmation link, then sign in.')
    setSubmitting(false)
  }

  // Once the notice is up the form has nothing left to do — showing the fields
  // again just invites a second signup with the same email.
  if (notice) {
    return (
      <Alert severity="success" role="status">
        <AlertTitle>Almost there</AlertTitle>
        {notice}
      </Alert>
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
          onChange={(event) => {
            setName(event.target.value)
            // Cleared on the first keystroke: a message that stays red while
            // you fix it teaches people to stop reading it.
            if (fieldError?.field === 'name') setFieldError(null)
          }}
          autoComplete="name"
          error={Boolean(problemWith('name'))}
          helperText={problemWith('name')}
          fullWidth
          required
          disabled={submitting}
        />
        <p className={Style.hint}>
          This is the name everyone sees, in every group. There are no per-group
          nicknames.
        </p>
      </div>

      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value)
          if (fieldError?.field === 'email') setFieldError(null)
        }}
        autoComplete="email"
        inputMode="email"
        error={Boolean(problemWith('email'))}
        helperText={problemWith('email')}
        fullWidth
        required
        disabled={submitting}
      />

      <TextField
        label="Password"
        type="password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value)
          if (fieldError?.field === 'password') setFieldError(null)
        }}
        // "new-password" is the hint that makes a password manager offer to
        // GENERATE one instead of autofilling.
        autoComplete="new-password"
        error={Boolean(problemWith('password'))}
        // The rule is already written under this field. When it is broken the
        // same line says so instead of a second line appearing beside it.
        helperText={
          problemWith('password') ?? `At least ${MIN_PASSWORD_LENGTH} characters.`
        }
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
        {submitting && <CircularProgress size={16} color="inherit" />}
          {submitting ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  )
}
