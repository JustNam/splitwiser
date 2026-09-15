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
import { useToast } from '@/components/Toast'
import { useGroupData } from '@/components/GroupDataProvider'
import { useAuth } from '@/hooks/useAuth'
import { useSignedOutRedirect } from '@/hooks/useSignedOutRedirect'
import Style from './style.module.scss'

export function AccountDetail() {
  const { user, loading: authLoading, signOut } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const groupData = useGroupData()
  const { patch, status: authStatus } = groupData

  useSignedOutRedirect(authStatus)

  // The row is already here. Every screen holds the group, the group holds
  // its accounts, and the person reading this one is in it by definition — a
  // member row is what a group is made of. So the request below is only for
  // somebody who belongs to no group at all, which is the one case the shared
  // copy cannot answer.
  const cached =
    authStatus === 'ready'
      ? (groupData.snapshot.accounts.find((row) => row.id === user?.id) ?? null)
      : null

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
    if (authLoading || !user || cached) return

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
  }, [authLoading, user, attempt, cached])

  // Whichever arrived. The cached row wins when there is one, so a rename
  // patched into the shared copy shows here too without a second request.
  const account = cached ?? (state.status === 'ready' ? state.account : null)

  if (authLoading || !user || !account) {
    return (
      <>
        <PageHeader title="Account" />

        {(authLoading || state.status === 'loading') && <LoadingForm fields={2} />}

        {user && state.status === 'error' && (
          <RetryMessage message={state.error} onRetry={reload} />
        )}
      </>
    )
  }

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

    setState({ status: 'ready', account: data })

    // The name on screen in every group comes from the shared snapshot's
    // `accounts`, not from this row — so without this, every other screen
    // keeps showing the old name until the app is reloaded. That used to be
    // true by accident: each screen refetched for itself.
    patch((current) => ({
      snapshot: {
        ...current.snapshot,
        accounts: current.snapshot.accounts.map((account) =>
          account.id === data.id ? { ...account, name: data.name } : account
        ),
      },
    }))
    setName(data.name)
    setEditing(false)
    setSaving(false)
    toast.success('Name updated')
  }

  async function handleSignOut() {
    await signOut()
    toast.success('Signed out')

    // Home, not /signin. Signed out, Home IS the sign-in screen — /signin
    // still exists only because ?next= links point at it, and sending people
    // to the spare door meant the app had two front doors to keep in step.
    router.push('/')
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
                // Filled here rather than when the screen loads. The field
                // only exists while editing, and the row can now arrive from
                // the shared copy without the fetch that used to seed it —
                // which would have opened the box empty.
                onClick={() => {
                  setName(account.name)
                  setEditing(true)
                }}
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
