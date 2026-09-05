'use client'

/**
 * The signin form.
 *
 * Lives next to its route (`app/signin/components/`) because nothing else will
 * ever render it. Shared goes in src/components; one-route goes next to the route.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TextField from '@mui/material/TextField'
import { AuthApi } from '@/api/auth'
import { Button } from '@/components/Button'
import Style from './style.module.scss'

export function SigninForm() {
  // From 'next/navigation' — NOT 'next/router', which is the Pages Router one.
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // `error` holds Supabase's message, not a boolean. `submitting` blocks the
  // double-tap that would fire a second request mid-flight.
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    // Without this, the form reloads the page with the password in the URL.
    event.preventDefault()

    setError(null)
    setSubmitting(true)

    const { error } = await AuthApi.signIn({ email: email.trim(), password })

    if (error) {
      setError(error)
      setSubmitting(false)
      return
    }

    // No setSubmitting(false) on success on purpose: let the navigation take
    // the screen away instead of flickering the button back to life.
    router.push('/')
  }

  const canSubmit = email.trim() !== '' && password !== '' && !submitting

  return (
    <form className={Style.form} onSubmit={handleSubmit} noValidate>
      {/* MUI's TextField for the floating label and the label/input wiring
          screen readers need — behaviour from MUI, look from our SCSS. */}
      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        // Lets the phone's password manager fill both fields.
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
        autoComplete="current-password"
        fullWidth
        required
        disabled={submitting}
      />

      {/* role="alert" makes a screen reader announce this on appearance. */}
      {error && (
        <p className={Style.error} role="alert">
          {error}
        </p>
      )}

      {/* type="submit" is explicit — our Button defaults to type="button". */}
      <Button type="submit" fullWidth disabled={!canSubmit}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}
