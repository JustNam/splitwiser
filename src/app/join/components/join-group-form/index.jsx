'use client'

/**
 * A3 · Join with a code.
 *
 * The code arrives two ways: pasted by hand, or carried in the invite link as
 * ?code=XXXX-XXXX. Reading it off the URL means someone who taps the link only
 * has to press one button.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import TextField from '@mui/material/TextField'
import { GroupsApi } from '@/api/groups'
import { Button } from '@/components/Button'
import { useAuth } from '@/hooks/useAuth'
import { writeCurrentGroupId } from '@/lib/current-group'
import { withNextPath } from '@/lib/next-path'
import Style from './style.module.scss'

export function JoinGroupForm() {
  const { isAuthenticated, loading } = useAuth()
  const searchParams = useSearchParams()

  // Read once, as the starting value. A useState initialiser runs on the first
  // render only, which is what we want — the user can edit the field
  // afterwards without the URL overwriting them.
  const [code, setCode] = useState(searchParams.get('code') ?? '')

  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [joined, setJoined] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)

    if (code.trim() === '') {
      setError('Please enter an invite code.')
      return
    }

    setSubmitting(true)

    const { data, error: apiError } = await GroupsApi.join(code.trim())

    if (apiError) {
      setError(apiError)
      setSubmitting(false)
      return
    }

    // The group you just joined is the one you meant to open. Home reads
    // this, so without it “Go to group” quietly shows the previous one.
    writeCurrentGroupId(data.id)

    setJoined(data)
    setSubmitting(false)
  }

  if (loading) return null

  if (!isAuthenticated) {
    // Both doors, because someone opening an invite link for the first time
    // usually has no account yet. Each link carries this page — code and all
    // — so they come straight back to a prefilled form.
    const returnTo = code.trim() === '' ? '/join' : `/join?code=${code.trim()}`

    return (
      <div className={Style.form}>
        <p className={Style.hint}>
          Sign in to join this group — you’ll come right back here.
        </p>

        <Link href={withNextPath('/signin', returnTo)} className={Style.cta}>
          Sign in
        </Link>

        <Link href={withNextPath('/signup', returnTo)} className={Style.secondary}>
          Create an account
        </Link>
      </div>
    )
  }

  // Same screen whether this was a first join or a second tap on the link:
  // join_group() returns the group either way and doesn't report which. The
  // wireframe has "You're already in ..." as its own state; showing it needs
  // the function to tell us, which is worth doing once the flow is in place.
  if (joined) {
    return (
      <div className={Style.done}>
        <p className={Style.doneTag}>You’re in</p>
        <p className={Style.doneName}>{joined.name}</p>

        <Link href="/" className={Style.cta}>
          Go to group
        </Link>
      </div>
    )
  }

  return (
    <form className={Style.form} onSubmit={handleSubmit} noValidate>
      <TextField
        label="Invite code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        placeholder="ABCD-2345"
        // Codes are stored and compared in upper case; the SQL uppercases what
        // it receives, so this is only about matching what the user sees.
        inputProps={{ style: { textTransform: 'uppercase' } }}
        fullWidth
        required
        disabled={submitting}
      />

      <p className={Style.hint}>
        Enter the code and you’re in right away — nobody has to approve you.
      </p>

      {error && (
        <p className={Style.error} role="alert">
          {error}
        </p>
      )}

      <Button type="submit" fullWidth disabled={code.trim() === '' || submitting}>
        {submitting ? 'Joining…' : 'Join'}
      </Button>
    </form>
  )
}
