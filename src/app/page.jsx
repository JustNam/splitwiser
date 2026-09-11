'use client'

/**
 * B1 · Home
 *
 * 'use client' because the screen depends on who is signed in, and the session
 * lives in the browser (lib/supabase/client.js). A Server Component renders
 * before any of that exists, so it would have nobody to show data for.
 *
 * Two effects rather than one: the list of groups and the contents of the
 * chosen group change for different reasons. Switching group has to refetch
 * the second without refetching the first.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { GroupsApi } from '@/api/groups'
import { useAuth } from '@/hooks/useAuth'
import { pickCurrentGroup, writeCurrentGroupId } from '@/lib/current-group'
import { groupBalances } from '@/services/balance.service'
import { sessionSummaries } from '@/services/session.service'
import { BalanceList } from './components/balance-list'
import { SessionList } from './components/session-list'
import Style from './page.module.scss'

export default function HomePage() {
  const { user, loading: authLoading } = useAuth()

  const [state, setState] = useState({ status: 'loading' })
  const [groupId, setGroupId] = useState(null)
  const [snapshot, setSnapshot] = useState({ status: 'loading' })

  useEffect(() => {
    if (authLoading) return

    // No setState here on purpose: the signed-out screen is chosen during
    // render, so the effect has nothing to record.
    if (!user) return

    let cancelled = false

    async function load() {
      const { data: groups, error } = await GroupsApi.listMine(user.id)
      if (cancelled) return

      if (error) return setState({ status: 'error', error })
      if (groups.length === 0) return setState({ status: 'no-group' })

      setState({ status: 'ready', groups })
      setGroupId(pickCurrentGroup(groups).id)
    }

    load()

    // Runs when the effect is torn down. Without it, a response arriving after
    // the user has navigated away sets state on a screen that is gone.
    return () => {
      cancelled = true
    }
  }, [authLoading, user])

  useEffect(() => {
    if (!groupId) return

    let cancelled = false

    async function load() {
      const { data, error } = await GroupsApi.getSnapshot(groupId)
      if (cancelled) return

      if (error) return setSnapshot({ status: 'error', error })
      setSnapshot({ status: 'ready', data })
    }

    load()

    return () => {
      cancelled = true
    }
  }, [groupId])

  if (authLoading) return null

  if (!user) {
    return (
      <main className={Style.page}>
        <div className={Style.empty}>
          <p>
            <Link href="/signin" className={Style.link}>
              Sign in
            </Link>{' '}
            to see your groups.
          </p>
          <p className={Style.emptySub}>
            No account yet?{' '}
            <Link href="/signup" className={Style.link}>
              Create one
            </Link>
            .
          </p>
        </div>
      </main>
    )
  }

  if (state.status === 'loading') return null

  if (state.status === 'error') {
    return (
      <main className={Style.page}>
        <p className={Style.error} role="alert">
          {state.error}
        </p>
      </main>
    )
  }

  // What every brand-new account lands on. Without this the app dead-ends
  // right after sign-up: there is no group, so Home has nothing to show.
  if (state.status === 'no-group') {
    return (
      <main className={Style.page}>
        <header className={Style.topBar}>
          <p className={Style.groupName}>SplitWiser</p>
        </header>

        <div className={Style.noGroup}>
          <p className={Style.noGroupTitle}>You’re not in a group yet</p>
          <p className={Style.noGroupText}>
            Start one and share the invite link, or join a group with a code
            someone sent you.
          </p>
        </div>

        <footer className={Style.actions}>
          <Link href="/group/new" className={Style.primaryLink}>
            New group
          </Link>
          <Link href="/join" className={Style.secondaryLink}>
            Join with a code
          </Link>
        </footer>
      </main>
    )
  }

  const { groups } = state
  const group = groups.find((row) => row.id === groupId) ?? groups[0]

  function handleSwitch(event) {
    const nextId = event.target.value

    // Written before the fetch, so a reload lands on the same group — and so
    // every other screen picks up the same one.
    writeCurrentGroupId(nextId)
    setGroupId(nextId)
    setSnapshot({ status: 'loading' })
  }

  return (
    <main className={Style.page}>
      {/* Which group you're looking at has to stay visible: one account can
          belong to several, and logging a session into the wrong one is the
          mistake this line exists to prevent. */}
      <header className={Style.topBar}>
        {groups.length > 1 ? (
          // A native <select>, not a custom dropdown: on a phone it opens the
          // OS picker, which is familiar and accessible with no code of ours.
          // Hidden entirely at one group — a dropdown with a single option
          // asks a question that has no answer.
          <select
            className={Style.groupSelect}
            value={group.id}
            onChange={handleSwitch}
            aria-label="Group"
          >
            {groups.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        ) : (
          <p className={Style.groupName}>{group.name}</p>
        )}

        {/* The wireframe puts this behind a "..." menu together with Sign out.
            A plain link until there is a third thing to put in a menu. */}
        <Link href="/group" className={Style.topBarLink}>
          Group
        </Link>
      </header>

      <HomeBody group={group} snapshot={snapshot} />

      <footer className={Style.actions}>
        <Link href="/session/new" className={Style.primaryLink}>
          New session
        </Link>
        <Link href="/settle" className={Style.secondaryLink}>
          Settle up
        </Link>
      </footer>
    </main>
  )
}

/**
 * The two lists. Split out so the top bar and the buttons stay put while
 * another group's numbers are being fetched — switching group shouldn't
 * blank the whole screen.
 */
function HomeBody({ group, snapshot }) {
  if (snapshot.status === 'loading') return null

  if (snapshot.status === 'error') {
    return (
      <p className={Style.error} role="alert">
        {snapshot.error}
      </p>
    )
  }

  const { members, accounts, sessions, costLines, participants, ledger } = snapshot.data

  const { rows } = groupBalances({
    ledger,
    members,
    accounts,
    myMemberId: group.myMemberId,
  })

  const sessionRows = sessionSummaries({
    sessions,
    costLines,
    participants,
    members,
    accounts,
    groupId: group.id,
  })

  return (
    <>
      <BalanceList rows={rows} memberCount={members.length} />
      <SessionList rows={sessionRows} />
    </>
  )
}
