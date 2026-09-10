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
import { Button } from '@/components/Button'
import { useAuth } from '@/hooks/useAuth'
import { pickCurrentGroup } from '@/lib/current-group'
import { displayName } from '@/services/money.service'
import Style from './style.module.scss'

export function GroupDetail() {
  const { user, loading: authLoading, signOut } = useAuth()
  const router = useRouter()

  const [state, setState] = useState({ status: 'loading' })

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
  }, [authLoading, user])

  if (authLoading) return null

  if (!user) {
    return (
      <p className={Style.error} role="alert">
        You need to{' '}
        <Link href="/signin" className={Style.link}>
          sign in
        </Link>{' '}
        first.
      </p>
    )
  }

  if (state.status === 'loading') return null

  if (state.status === 'error') {
    return (
      <p className={Style.error} role="alert">
        {state.error}
      </p>
    )
  }

  if (state.status === 'no-group') {
    return <p className={Style.note}>You’re not in a group yet.</p>
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
      email: accounts.find((account) => account.id === member.accountId)?.email,
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
    } catch {
      // Needs a secure context and can be refused outright. The code is on
      // screen either way, so this is a downgrade, not a failure.
      setError('Couldn’t copy — read the code above instead.')
    }
  }

  async function handleNewCode() {
    setWorking(true)
    setError(null)

    const { data, error: apiError } = await GroupsApi.regenerateCode(group.id)

    if (apiError) {
      setError(apiError)
      setWorking(false)
      return
    }

    // Only the code changed, so only the code is replaced — reloading the
    // whole screen would throw away the members list for nothing.
    setState((current) => ({ ...current, group: { ...current.group, ...data } }))
    setConfirming(false)
    setChanged(true)
    setCopied(false)
    setWorking(false)
  }

  async function handleSignOut() {
    await signOut()
    router.push('/signin')
  }

  return (
    <>
      <h1 className={Style.title}>{group.name}</h1>

      {changed && (
        <p className={Style.banner}>New code created. The old link no longer works.</p>
      )}

      <section className={Style.section}>
        <header className={Style.sectionHeader}>
          <h2 className={Style.sectionTitle}>Members</h2>
          <p className={Style.sectionMeta}>
            {accountCount} {accountCount === 1 ? 'account' : 'accounts'} ·{' '}
            {guestCount} {guestCount === 1 ? 'guest' : 'guests'}
          </p>
        </header>

        <div className={Style.rows}>
          {rows.map((row) => (
            <div key={row.id} className={Style.row}>
              <span className={Style.rowInfo}>
                <span className={Style.rowName}>
                  {row.name}
                  {row.isMe && ' (you)'}
                </span>
                <span className={Style.rowSub}>
                  {row.isGuest ? 'name only · no account' : row.email}
                </span>
              </span>

              {row.isGuest && <span className={Style.guest}>Guest</span>}
            </div>
          ))}
        </div>
      </section>

      <section className={Style.section}>
        <h2 className={Style.sectionTitle}>Invite</h2>

        <div className={Style.inviteBox}>
          <p className={Style.code}>{group.inviteCode}</p>
          <p className={Style.linkText}>{inviteLink}</p>

          <div className={Style.inviteActions}>
            <Button onClick={handleCopy} disabled={working}>
              {copied ? 'Copied ✓' : 'Copy link'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setConfirming(true)}
              disabled={working || confirming}
            >
              New code
            </Button>
          </div>

          <p className={Style.note}>
            A new code makes the old link stop working for everyone.
          </p>

          {/* The warning has to be read before the damage, not after — so the
              confirmation appears in place rather than as a toast afterwards. */}
          {confirming && (
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
          )}
        </div>
      </section>

      {error && (
        <p className={Style.error} role="alert">
          {error}
        </p>
      )}

      <p className={Style.note}>Anyone in the group can log and edit sessions.</p>

      {/* Not in the C1 wireframe — the prototype keeps Sign out in Home's
          overflow menu, which doesn't exist yet. It goes here because without
          it there is no way out of an account at all. */}
      <footer className={Style.actions}>
        <button type="button" className={Style.signOut} onClick={handleSignOut}>
          Sign out
        </button>
      </footer>
    </>
  )
}
