'use client'

/**
 * Account — who you are, across every group.
 *
 * Two facts and one of them is editable. The name is the one everybody sees
 * next to every number, and until now it was whatever you typed at signup,
 * for good: a typo was permanent.
 *
 * The email is shown and not editable. It is what you sign in with, and what
 * decides a guest row is really you when you claim one — changing it belongs
 * to Supabase Auth's confirmed-email flow, not to a field on this screen.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import CircularProgress from '@mui/material/CircularProgress'
import LogoutIcon from '@mui/icons-material/Logout'
import TextField from '@mui/material/TextField'
import { AccountApi } from '@/api/account'
import { Button } from '@/components/Button'
import { LoadingForm } from '@/components/Loading'
import { PageHeader } from '@/components/PageHeader'
import { RetryMessage } from '@/components/RetryMessage'
import { TextLink } from '@/components/TextLink'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/hooks/useAuth'
import Style from './style.module.scss'

export function AccountDetail() {
  const { user, loading: authLoading, signOut } = useAuth()
  const router = useRouter()
  const toast = useToast()

  const [state, setState] = useState({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState(null)

  function reload() {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  useEffect(() => {
    if (authLoading || !user) return

    let cancelled = false

    async function load() {
      const { data, error } = await AccountApi.getMine(user.id)
      if (cancelled) return

      if (error) return setState({ status: 'error', error })

      setName(data.name)
      setState({ status: 'ready', account: data })
    }

    load()

    return () => {
      cancelled = true
    }
  }, [authLoading, user, attempt])

  if (authLoading || !user || state.status !== 'ready') {
    return (
      <>
        <PageHeader title="Account" />

        {(authLoading || state.status === 'loading') && <LoadingForm fields={2} />}

        {!authLoading && !user && (
          <p className={Style.error} role="alert">
            You need to <TextLink href="/signin">sign in</TextLink> first.
          </p>
        )}

        {user && state.status === 'error' && (
          <RetryMessage message={state.error} onRetry={reload} />
        )}
      </>
    )
  }

  const { account } = state
  const trimmed = name.trim()
  const changed = trimmed !== account.name

  async function handleSave(event) {
    event.preventDefault()
    setNameError(null)

    // Enter still submits the form when the button is not on screen, so the
    // "nothing changed" case has to be caught here rather than by hiding it.
    if (!changed) return

    if (trimmed === '') {
      setNameError('Your name cannot be empty.')
      return
    }

    setSaving(true)

    const { data, error } = await AccountApi.rename(trimmed)

    if (error) {
      setNameError(error)
      toast.error(error)
      setSaving(false)
      return
    }

    // Everything that shows a name reads it from this row, so there is
    // nothing else to update — the groups catch up on their next fetch.
    setState({ status: 'ready', account: data })
    setName(data.name)
    toast.success('Name updated')
    setSaving(false)
  }

  async function handleSignOut() {
    await signOut()
    toast.success('Signed out')
    router.push('/signin')
  }

  return (
    <>
      <PageHeader title="Account" />

      <form className={Style.form} onSubmit={handleSave} noValidate>
        <TextField
          label="Your name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setNameError(null)
          }}
          autoComplete="name"
          error={Boolean(nameError)}
          helperText={nameError}
          fullWidth
          disabled={saving}
        />

        {/* Not a TextField. A box with a border and a floating label is the
            app's way of saying "type here", and putting the one thing nobody
            can change inside one is a promise the screen cannot keep. This is
            a label and a value, which is what it is. */}
        <div className={Style.readOnly}>
          <span className={Style.readOnlyLabel}>Email</span>
          <span className={Style.readOnlyValue}>{account.email}</span>
        </div>

        {/* Shown only once there is something to save. A button that is
            always there and almost always disabled teaches you to stop
            looking at it. */}
        {changed && (
          <Button type="submit" fullWidth disabled={saving}>
            {saving && <CircularProgress size={16} color="inherit" />}
            {saving ? 'Saving…' : 'Save name'}
          </Button>
        )}
      </form>

      <section className={Style.section}>
        <Button variant="secondary" onClick={handleSignOut}>
          <LogoutIcon fontSize="small" />
          Sign out
        </Button>
      </section>
    </>
  )
}
