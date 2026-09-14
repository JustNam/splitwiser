'use client'

/**
 * C1 · Group page — who's in the group, and the invite code.
 *
 * The invite code is the reason this screen matters: A4 shows it once, right
 * after the group is created, and until now there was nowhere to see it
 * again. A code you can't look up is a group nobody else can join.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { GroupsApi } from '@/api/groups'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { SectionHeader } from '@/components/SectionHeader'
import { LoadingRows } from '@/components/Loading'
import { RetryMessage } from '@/components/RetryMessage'
import { useToast } from '@/components/Toast'
import { PageHeader } from '@/components/PageHeader'
import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import LogoutIcon from '@mui/icons-material/Logout'
import RefreshIcon from '@mui/icons-material/Refresh'
import Alert from '@mui/material/Alert'
import Collapse from '@mui/material/Collapse'
import TextField from '@mui/material/TextField'
import { TextButton } from '@/components/TextButton'
import { LinkButton } from '@/components/LinkButton'
import { TextLink } from '@/components/TextLink'
import { useAuth } from '@/hooks/useAuth'
import { pickCurrentGroup } from '@/lib/current-group'
import { displayName } from '@/services/money.service'
import Style from './style.module.scss'

export function GroupDetail() {
  const { user, loading: authLoading, signOut } = useAuth()
  const router = useRouter()
  const toast = useToast()

  const [state, setState] = useState({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  function reload() {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  // Adding a guest used to be possible only from inside New session, on a
  // screen about one evening's badminton. This is the screen about who is in
  // the group, which is where you look when that is the thing you want.
  const [addingGuest, setAddingGuest] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [savingGuest, setSavingGuest] = useState(false)

  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [changed, setChanged] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (authLoading || !user) return

    let cancelled = false

    async function load() {
      const { data: groups, error: groupsError } = await GroupsApi.listMine(user.id)
      if (cancelled) return
      if (groupsError) return setState({ status: 'error', error: groupsError })
      if (groups.length === 0) return setState({ status: 'no-group' })

      const group = pickCurrentGroup(groups)
      const { data: roster, error: rosterError } = await GroupsApi.listMembers(group.id)
      if (cancelled) return
      if (rosterError) return setState({ status: 'error', error: rosterError })

      setState({ status: 'ready', group, ...roster })
    }

    load()

    return () => {
      cancelled = true
    }
  }, [authLoading, user, attempt])

  // Header in every state, so a failed load still has a way back.
  if (authLoading || !user || state.status !== 'ready') {
    return (
      <>
        <PageHeader title="Group" />

        {(authLoading || state.status === 'loading') && <LoadingRows rows={3} />}

        {!authLoading && !user && (
          <p className={Style.error} role="alert">
            You need to <TextLink href="/signin">sign in</TextLink> first.
          </p>
        )}

        {user && state.status === 'error' && (
          <RetryMessage message={state.error} onRetry={reload} />
        )}

        {/* The two ways out, on the one screen that is about groups. */}
        {user && state.status === 'no-group' && (
          <>
            <p className={Style.note}>You’re not in a group yet.</p>
            <div className={Style.otherActions}>
              <LinkButton href="/group/new">New group</LinkButton>
              <LinkButton variant="secondary" href="/join">
                Join with a code
              </LinkButton>
            </div>
          </>
        )}
      </>
    )
  }

  const { group, members, accounts } = state

  // Roster before guests: the people with accounts are the group, and the
  // guests are attached to it.
  const rows = [...members]
    .map((member) => ({
      id: member.id,
      isGuest: member.type === 'guest',
      isMe: member.id === group.myMemberId,
      name: displayName(member, accounts),
      // A roster member's email is on their account; a guest's sits on the
      // member row, waiting for them to sign up with it.
      email:
        member.email ??
        accounts.find((account) => account.id === member.accountId)?.email,
    }))
    .sort((a, b) => Number(a.isGuest) - Number(b.isGuest))

  const guestCount = rows.filter((row) => row.isGuest).length
  const accountCount = rows.length - guestCount

  const inviteLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/join?code=${group.inviteCode}`
      : ''

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      toast.success('Invite link copied')
      // Back to "Copy link" after a beat. Left latched, the button spends the
      // rest of the visit claiming a copy that happened a page-view ago, and
      // a second tap gives you no sign it worked.
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Needs a secure context and can be refused outright. The code is on
      // screen either way, so this is a downgrade, not a failure.
      setError('Couldn’t copy — read the code above instead.')
      toast.error('Couldn’t copy — read the code above')
    }
  }

  async function handleNewCode() {
    setWorking(true)
    setError(null)

    const { data, error: apiError } = await GroupsApi.regenerateCode(group.id)

    if (apiError) {
      setError(apiError)
      toast.error(apiError)
      setWorking(false)
      return
    }

    // Only the code changed, so only the code is replaced — reloading the
    // whole screen would throw away the members list for nothing.
    setState((current) => ({
      ...current,
      group: { ...current.group, ...data },
    }))
    toast.success('New invite code created')
    setConfirming(false)
    setChanged(true)
    setCopied(false)
    setWorking(false)
  }

  async function handleSignOut() {
    await signOut()
    toast.success('Signed out')
    router.push('/signin')
  }

  async function handleAddGuest() {
    setSavingGuest(true)
    setError(null)

    const { data, error: apiError } = await GroupsApi.addGuest(
      group.id,
      guestName.trim(),
      guestEmail.trim()
    )

    if (apiError) {
      setError(apiError)
      toast.error(apiError)
      setSavingGuest(false)
      return
    }

    // Only the roster changed, so only the roster is added to — refetching
    // the screen would throw away the invite code for nothing.
    setState((current) => ({ ...current, members: [...current.members, data] }))

    toast.success(
      guestEmail.trim() === ''
        ? `${data.name ?? guestName.trim()} added`
        : `${data.name ?? guestName.trim()} added — we’ll invite them`
    )

    setGuestName('')
    setGuestEmail('')
    setAddingGuest(false)
    setSavingGuest(false)
  }

  return (
    <>
      <PageHeader title={group.name} />

      {/* MUI's Alert rather than a tinted <p>: it brings the icon and the
          severity wiring, and a tick beside the sentence is read faster than
          the sentence is. */}
      {changed && (
        <Alert severity="success">New code created. The old link no longer works.</Alert>
      )}

      <section className={Style.section}>
        <SectionHeader
          meta={
            <>
              {accountCount} {accountCount === 1 ? 'account' : 'accounts'} ·{' '}
              {guestCount} {guestCount === 1 ? 'guest' : 'guests'}
            </>
          }
        >
          Members
        </SectionHeader>

        <ul className={Style.rows}>
          {rows.map((row) => (
            <li key={row.id} className={Style.row}>
              <Avatar name={row.name} />

              <span className={Style.rowInfo}>
                <span className={Style.rowName}>
                  {row.name}
                  {row.isMe && ' (you)'}
                </span>
                <span className={Style.rowSub}>
                  {row.isGuest && !row.email ? 'name only · no account' : row.email}
                </span>
              </span>

              {/* An invited guest is waiting, not just unregistered: the
                  moment they sign up with that email this row becomes theirs. */}
              {row.isGuest && (
                <span className={Style.guest}>{row.email ? 'Invited' : 'Guest'}</span>
              )}
            </li>
          ))}
        </ul>

        {/* Closed by default — the same shape B2 uses. The fields and their
            explanation appear only for the person who came to add someone. */}
        {/* Collapse rather than a bare conditional: a block that appears
            between two taps with no transition reads as the page having
            jumped, and you look for what moved instead of at what arrived. */}
        <Collapse in={addingGuest} unmountOnExit>
          <div className={Style.guestBlock}>
            <div className={Style.guestRow}>
              <TextField
                label="Name"
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                size="small"
                autoFocus
                disabled={savingGuest}
              />
              <TextField
                label="Email (optional)"
                value={guestEmail}
                onChange={(event) => setGuestEmail(event.target.value)}
                slotProps={{ htmlInput: { inputMode: 'email' } }}
                size="small"
                disabled={savingGuest}
              />
            </div>

            <p className={Style.note}>
              Email is optional, but worth adding: we’ll invite them, and when they
              sign up everything they owe or are owed comes with them.
            </p>

            <div className={Style.inviteActions}>
              <Button
                onClick={handleAddGuest}
                disabled={guestName.trim() === '' || savingGuest}
              >
                {savingGuest ? 'Adding…' : 'Add'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setAddingGuest(false)
                  setGuestName('')
                  setGuestEmail('')
                }}
                disabled={savingGuest}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Collapse>

        {!addingGuest && (
          <TextButton onClick={() => setAddingGuest(true)}>
            <AddIcon fontSize="small" />
            Add a guest
          </TextButton>
        )}
      </section>

      <section className={Style.section}>
        <SectionHeader>Invite</SectionHeader>

        <div className={Style.inviteBox}>
          <p className={Style.code}>{group.inviteCode}</p>
          <p className={Style.linkText}>{inviteLink}</p>

          <div className={Style.inviteActions}>
            <Button onClick={handleCopy} disabled={working}>
              {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setConfirming(true)}
              disabled={working || confirming}
            >
              <RefreshIcon fontSize="small" />
              New code
            </Button>
          </div>

          <p className={Style.note}>
            A new code makes the old link stop working for everyone.
          </p>

          {/* The warning has to be read before the damage, not after — so the
              confirmation appears in place rather than as a toast afterwards. */}
          <Collapse in={confirming} unmountOnExit>
            <div className={Style.confirm}>
              <p className={Style.confirmText}>
                Anyone holding the current link won’t be able to join. Carry on?
              </p>
              <div className={Style.inviteActions}>
                <Button onClick={handleNewCode} disabled={working}>
                  {working ? 'Working…' : 'Yes, new code'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setConfirming(false)}
                  disabled={working}
                >
                  Keep this one
                </Button>
              </div>
            </div>
          </Collapse>
        </div>
      </section>

      {error && (
        <p className={Style.error} role="alert">
          {error}
        </p>
      )}

      <p className={Style.note}>Anyone in the group can log and edit sessions.</p>

      {/* "New group" and "Join with a code" used to be repeated here. They
          now live in the group switcher on Home, next to the list of groups
          they add to — which is where the question "which group?" is already
          being asked. Two places offering the same two actions is two places
          to keep in step, and one of them was always going to drift. */}

      {/* Not in the C1 wireframe — the prototype keeps Sign out in Home's
          overflow menu, which doesn't exist yet. It goes here because without
          it there is no way out of an account at all. */}
      <footer className={Style.actions}>
        <TextButton tone="danger" onClick={handleSignOut}>
          <LogoutIcon fontSize="small" />
          Sign out
        </TextButton>
      </footer>
    </>
  )
}
