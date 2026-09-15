'use client'

/**
 * Account — who you are, across every group.
 *
 * Two facts, one of them editable, and the screen has to say which without
 * looking like two different screens stacked up. So both are the same shape —
 * a small label over a value — and the only thing marking the name out is the
 * Edit beside it. A bordered box next to a bare line said "these are
 * different kinds of thing", which they are not.
 *
 * The email is not editable at all. It is what you sign in with, and what
 * decides a guest row is really you when you claim one; changing it belongs
 * to Supabase Auth's confirmed-email flow, not to a field here.
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

  const [editing, setEditing] = useState(false)
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

  function cancel() {
    setName(account.name)
    setNameError(null)
    setEditing(false)
  }

  async function handleSave(event) {
    event.preventDefault()
    setNameError(null)

    if (trimmed === '') {
      setNameError('Your name cannot be empty.')
      return
    }

    // Closed without a request: there is nothing to send, and "Name updated"
    // when nothing was is a lie this screen would tell often.
    if (trimmed === account.name) return cancel()

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
    setEditing(false)
    setSaving(false)
    toast.success('Name updated')
  }

  async function handleSignOut() {
    await signOut()
    toast.success('Signed out')
    router.push('/signin')
  }

  return (
    <>
      <PageHeader title="Account" />

      {/* A description list, because that is what these are: a term and the
          value belonging to it. The <div> wrappers group each pair. */}
      <dl className={Style.rows}>
        <div className={Style.row}>
          <dt className={Style.label}>Your name</dt>

          {editing ? (
            <dd>
              <form className={Style.edit} onSubmit={handleSave} noValidate>
                <TextField
                  label="Your name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                    setNameError(null)
                  }}
                  autoComplete="name"
                  autoFocus
                  size="small"
                  error={Boolean(nameError)}
                  helperText={nameError}
                  fullWidth
                  disabled={saving}
                />

                <div className={Style.editActions}>
                  <Button type="submit" disabled={saving}>
                    {saving && <CircularProgress size={16} color="inherit" />}
                    {saving ? 'Saving…' : 'Save'}
                  </Button>

                  <Button variant="secondary" onClick={cancel} disabled={saving}>
                    Cancel
                  </Button>
                </div>
              </form>
            </dd>
          ) : (
            <dd className={Style.value}>
              <span className={Style.text}>{account.name}</span>

              <Button
                variant="secondary"
                className={Style.editButton}
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
            </dd>
          )}
        </div>

        <div className={Style.row}>
          <dt className={Style.label}>Email</dt>
          <dd className={Style.value}>
            <span className={Style.text}>{account.email}</span>
          </dd>
        </div>
      </dl>

      <Button variant="secondary" className={Style.signOut} onClick={handleSignOut}>
        <LogoutIcon fontSize="small" />
        Sign out
      </Button>
    </>
  )
}
