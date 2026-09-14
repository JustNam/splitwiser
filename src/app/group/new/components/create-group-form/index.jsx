'use client'

/**
 * A4 · Create group — form, then the invite code.
 *
 * The code screen isn't a nicety: it's the only way a second person ever gets
 * into the group. Skip past it and the group stays a party of one.
 *
 * 'use client' at the top because this component holds state and reads the
 * signed-in user. Server Components can do neither.
 */

import { useState } from 'react'
import Link from 'next/link'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import { GroupsApi } from '@/api/groups'
import { Button } from '@/components/Button'
import { LinkButton } from '@/components/LinkButton'
import CheckIcon from '@mui/icons-material/Check'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { LoadingForm } from '@/components/Loading'
import { useToast } from '@/components/Toast'
import { TextLink } from '@/components/TextLink'
import { useAuth } from '@/hooks/useAuth'
import { writeCurrentGroupId } from '@/lib/current-group'
import Style from './style.module.scss'

export function CreateGroupForm() {
  const { isAuthenticated, loading } = useAuth()
  const toast = useToast()

  // useState gives back a pair: the current value, and the only function
  // allowed to change it. Assigning to `name` directly would not re-render.
  const [name, setName] = useState('') //           what the user is typing
  const [error, setError] = useState(null) //        a message, not a boolean
  const [submitting, setSubmitting] = useState(false) // blocks the double-tap

  // The created group. Held in state because its arrival replaces the whole
  // screen rather than adding to it.
  const [group, setGroup] = useState(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(event) {
    // Without this the browser does its 1995 thing: reload the page and put
    // the field values in the URL.
    event.preventDefault()
    setError(null)

    if (name.trim() === '') {
      setError('Please enter a group name.')
      return
    }

    setSubmitting(true)

    // `error: apiError` renames it on the way out. `error` is already the
    // state variable above, and reusing the name here would shadow it — then
    // setError(error) would be feeding the variable to itself.
    const { data, error: apiError } = await GroupsApi.create(name.trim())

    if (apiError) {
      setError(apiError)
      toast.error(apiError)
      setSubmitting(false)
      return
    }

    // The group you just created is the one you meant to open. Home reads
    // this, so without it “Go to group” quietly shows the previous one.
    writeCurrentGroupId(data.id)

    toast.success(`${data.name} created`)
    setGroup(data)
    setSubmitting(false)
  }

  // `window` only exists in a browser, and this component is rendered on the
  // server first. Reading it unguarded there throws.
  const inviteLink =
    group && typeof window !== 'undefined'
      ? `${window.location.origin}/join?code=${group.inviteCode}`
      : ''

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      toast.success('Invite link copied')
      // "Copied" is a moment, not a state: left latched, the button spends
      // the rest of the visit claiming a copy that already happened.
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access needs a secure context and can be refused outright.
      // The code is on screen either way, so this is a downgrade, not a
      // failure.
      setCopied(false)
      setError('Couldn’t copy — use the code above instead.')
      toast.error('Couldn’t copy — use the code above')
    }
  }

  /**
   * Four screens live in this one component. The returns below are ordered
   * from least to most certain — don't know yet → not allowed → finished →
   * the form. Each `return` rules out everything under it, which is why the
   * JSX at the bottom needs no guards of its own.
   */

  // Nothing rendered while the session is still being read, or a signed-in
  // user sees "you need to sign in" for one frame.
  if (loading) return <LoadingForm fields={2} />

  if (!isAuthenticated) {
    return (
      <p className={Style.error} role="alert">
        You need to <TextLink href="/signin">sign in</TextLink> before you can create a
        group.
      </p>
    )
  }

  if (group) {
    return (
      <div className={Style.created}>
        <p className={Style.createdTag}>Created</p>
        <p className={Style.createdName}>{group.name}</p>

        <div className={Style.codeBox}>
          <p className={Style.codeLabel}>Invite code</p>
          <p className={Style.code}>{group.inviteCode}</p>
          <p className={Style.linkText}>{inviteLink}</p>
        </div>

        <p className={Style.hint}>
          Send this link to your group chat — it’s how the others get in.
        </p>

        {/* One button, two labels. The ternary swaps the copy in place rather
            than adding a second button to keep in sync. */}
        <Button fullWidth onClick={handleCopy}>
          {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
          {copied ? 'Copied' : 'Copy invite link'}
        </Button>

        <LinkButton variant="quiet" href="/">
          Go to group
        </LinkButton>
      </div>
    )
  }

  return (
    <form className={Style.form} onSubmit={handleSubmit} noValidate>
      {/* A controlled input: `value` comes from state and `onChange` writes
          back to it. Drop either half and the field stops accepting typing. */}
      <TextField
        label="Group name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Sunday Badminton"
        fullWidth
        required
        disabled={submitting}
      />

      <p className={Style.hint}>
        You’ll get an invite link right after — that’s how the others get in.
      </p>

      {/* `error &&` renders the paragraph only when error is truthy. role="alert"
          makes a screen reader announce it the moment it appears. */}
      {error && (
        <p className={Style.error} role="alert">
          {error}
        </p>
      )}

      {/* Disabled on an empty name so the request is never sent without one,
          and on `submitting` so a second tap can't create a second group. */}
      <Button type="submit" fullWidth disabled={name.trim() === '' || submitting}>
        {submitting && <CircularProgress size={16} color="inherit" />}
          {submitting ? 'Creating…' : 'Create group'}
      </Button>
    </form>
  )
}
