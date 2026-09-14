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
import GroupsIcon from '@mui/icons-material/Groups'
import HistoryIcon from '@mui/icons-material/History'
import Badge from '@mui/material/Badge'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { GroupsApi } from '@/api/groups'
import { useAuth } from '@/hooks/useAuth'
import { pickCurrentGroup, writeCurrentGroupId } from '@/lib/current-group'
import { readLastSeen } from '@/lib/last-seen'
import { activityFeed, unreadCount } from '@/services/activity.service'
import { displayName } from '@/services/money.service'
import { groupBalances } from '@/services/balance.service'
import { sessionSummaries } from '@/services/session.service'
import { BalanceList } from './components/balance-list'
import { GroupSwitcher } from './components/group-switcher'
import { SessionList } from './components/session-list'
import { TextLink } from '@/components/TextLink'
import { LinkButton } from '@/components/LinkButton'
import { LoadingRows } from '@/components/Loading'
import { RetryMessage } from '@/components/RetryMessage'
import Style from './page.module.scss'

const HOME_ROW_LIMIT = 5

export default function HomePage() {
  const { user, loading: authLoading } = useAuth()

  const [state, setState] = useState({ status: 'loading' })
  const [groupId, setGroupId] = useState(null)
  const [snapshot, setSnapshot] = useState({ status: 'loading' })

  // One counter per fetch, because they fail for their own reasons: the list
  // of groups and the contents of one group are two requests, and retrying
  // the wrong one leaves the screen exactly as broken as it was.
  const [groupsAttempt, setGroupsAttempt] = useState(0)
  const [snapshotAttempt, setSnapshotAttempt] = useState(0)

  function reloadGroups() {
    setState({ status: 'loading' })
    setGroupsAttempt((n) => n + 1)
  }

  function reloadSnapshot() {
    setSnapshot({ status: 'loading' })
    setSnapshotAttempt((n) => n + 1)
  }

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
  }, [authLoading, user, groupsAttempt])

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
  }, [groupId, snapshotAttempt])

  if (authLoading) return <LoadingRows rows={3} />

  if (!user) {
    return (
      <main className={Style.page}>
        <div className={Style.empty}>
          <p>
            <TextLink href="/signin">Sign in</TextLink> to see your groups.
          </p>
          <p className={Style.emptySub}>
            No account yet? <TextLink href="/signup">Create one</TextLink>.
          </p>
        </div>
      </main>
    )
  }

  if (state.status === 'loading') {
    return (
      <main className={Style.page}>
        <LoadingRows rows={3} />
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main className={Style.page}>
        <RetryMessage message={state.error} onRetry={reloadGroups} />
      </main>
    )
  }

  // What every brand-new account lands on. Without this the app dead-ends
  // right after sign-up: there is no group, so Home has nothing to show.
  if (state.status === 'no-group') {
    return (
      <main className={Style.page}>
        <header className={Style.topBar}>
          <h1 className={Style.groupName}>SplitWiser</h1>
        </header>

        <div className={Style.noGroup}>
          <p className={Style.noGroupTitle}>You’re not in a group yet</p>
          <p className={Style.noGroupText}>
            Start one and share the invite link, or join a group with a code someone
            sent you.
          </p>
        </div>

        <footer className={Style.actions}>
          <LinkButton href="/group/new">New group</LinkButton>
          <LinkButton variant="secondary" href="/join">
            Join with a code
          </LinkButton>
        </footer>
      </main>
    )
  }

  const { groups } = state
  const group = groups.find((row) => row.id === groupId) ?? groups[0]

  function handleSwitch(nextId) {
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
        <GroupSwitcher groups={groups} current={group} onSwitch={handleSwitch} />

        {/* Icons, not words. The group name is the long thing on this line
            and it is the thing that matters; two labels beside it left it
            about half the width on a phone, and both of these are errands
            you take rather than things you read.

            aria-label is doing the work the visible text used to — without
            it these are two unnamed buttons to anybody not looking at them. */}
        <ActivityLink group={group} snapshot={snapshot} accountId={user.id} />

        {/* A tooltip is the desktop half of what aria-label already does for
            a screen reader. It never fires on a touch screen, which is fine:
            there the icons sit under a thumb, not a hovering pointer. */}
        <Tooltip title="Group">
          <IconButton component={Link} href="/group" aria-label="Group">
            <GroupsIcon />
          </IconButton>
        </Tooltip>
      </header>

      <HomeBody
        group={group}
        snapshot={snapshot}
        accountId={user.id}
        onRetry={reloadSnapshot}
      />

      <footer className={Style.actions}>
        <LinkButton href="/session/new">New session</LinkButton>
        <LinkButton variant="secondary" href="/settle">
          Settle up
        </LinkButton>
      </footer>
    </main>
  )
}

/**
 * The two lists. Split out so the top bar and the buttons stay put while
 * another group's numbers are being fetched — switching group shouldn't
 * blank the whole screen.
 */
function HomeBody({ group, snapshot, onRetry }) {
  if (snapshot.status === 'loading') return <LoadingRows rows={4} />

  if (snapshot.status === 'error') {
    return <RetryMessage message={snapshot.error} onRetry={onRetry} />
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

  // Five each. Home answers "where do I stand" at a glance; a long list of
  // old sessions pushes the two buttons off the screen and answers nothing.
  return (
    <>
      <BalanceList
        rows={rows}
        memberCount={members.length}
        limit={HOME_ROW_LIMIT}
        seeAllHref="/balances"
      />
      <SessionList rows={sessionRows} limit={HOME_ROW_LIMIT} seeAllHref="/sessions" />
    </>
  )
}

/**
 * Activity, with a count of what has happened to your money since you last
 * looked.
 *
 * Anyone in the group can change anyone's session. That rule is Splitwise's
 * and it is the right one — whoever spots a mistake should be able to fix it
 * — but it only works if the people affected find out. Without this, someone
 * could change what you owe and you would never know unless you happened to
 * reopen that exact session.
 *
 * Your own actions never count. A badge that lights up because of your own
 * tap teaches you to ignore the badge.
 */
function ActivityLink({ group, snapshot, accountId }) {
  if (snapshot.status !== 'ready') return <ActivityButton />

  const me = snapshot.data.members.find((member) => member.id === group.myMemberId)
  const myName = me ? displayName(me, snapshot.data.accounts) : ''

  const events = activityFeed({
    sessions: snapshot.data.sessions,
    costLines: snapshot.data.costLines,
    ledger: snapshot.data.ledger,
    members: snapshot.data.members,
    accounts: snapshot.data.accounts,
    myMemberId: group.myMemberId,
  })

  const unread = unreadCount(events, readLastSeen(accountId), myName)

  // MUI's Badge rather than our own span: it positions the count against the
  // icon, hides itself at zero, and caps at "9+" without any of that being
  // three more lines here.
  return (
    <Badge badgeContent={unread} color="primary" max={9} overlap="circular">
      <ActivityButton />
    </Badge>
  )
}

function ActivityButton() {
  return (
    <Tooltip title="Activity">
      <IconButton component={Link} href="/activity" aria-label="Activity">
        <HistoryIcon />
      </IconButton>
    </Tooltip>
  )
}
