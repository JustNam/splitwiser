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

import Image from 'next/image'
import { Suspense } from 'react'
import Link from 'next/link'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
import GroupsIcon from '@mui/icons-material/Groups'
import HistoryIcon from '@mui/icons-material/History'
import Badge from '@mui/material/Badge'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { SigninForm } from '@/app/signin/components/signin-form'
import { useAuth } from '@/hooks/useAuth'
import { useGroupData } from '@/components/GroupDataProvider'
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
  const { user } = useAuth()

  // The group list and its contents both come from the one shared copy. Home
  // used to own two fetches and two retry counters; every other screen owned
  // the same two again.
  const { status, groups, group, snapshot, error, reload, switchGroup } =
    useGroupData()

  // Signed out, Home IS the sign-in screen. Sending people to /signin first
  // was a tap that asked nothing and told them nothing; /signin still exists
  // because ?next= links point at it.
  //
  // `status` covers the wait for auth too — the provider reports 'loading'
  // until it knows who is signed in, so there is no second flag here.
  if (status === 'signed-out') {
    return (
      <main className={Style.page}>
        <div className={Style.auth}>
          <Image
            className={Style.authArt}
            src="/auth-illustration.png"
            alt=""
            width={539}
            height={445}
            priority
          />

          <p className={Style.wordmark}>SplitWiser</p>
          <h1 className={Style.authTitle}>Welcome back</h1>
        </div>

        {/* The form reads ?next= from the URL, which is not known while this
            page is being prerendered. */}
        <Suspense fallback={null}>
          <SigninForm />
        </Suspense>

        <p className={Style.authFoot}>
          No account yet? <TextLink href="/signup">Create one</TextLink>
        </p>
      </main>
    )
  }

  if (status === 'loading') {
    return (
      <main className={Style.page}>
        <LoadingRows rows={3} />
      </main>
    )
  }

  if (status === 'error') {
    return (
      <main className={Style.page}>
        <RetryMessage message={error} onRetry={reload} />
      </main>
    )
  }

  // What every brand-new account lands on. Without this the app dead-ends
  // right after sign-up: there is no group, so Home has nothing to show.
  if (status === 'no-group') {
    return (
      <main className={Style.page}>
        {/* Account, and only Account. Activity and Group both lead to "you
            are not in a group yet", which is the screen you are already on —
            but your own name and your way out of the account are yours
            whether you have joined anything or not. */}
        <header className={Style.topBar}>
          <h1 className={Style.groupName}>SplitWiser</h1>
          <AccountButton />
        </header>

        <div className={Style.noGroup}>
          <p className={Style.noGroupTitle}>You’re not in a group yet</p>
          <p className={Style.noGroupText}>Start one, or join with a code.</p>
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

  return (
    <main className={Style.page}>
      {/* Which group you're looking at has to stay visible: one account can
          belong to several, and logging a session into the wrong one is the
          mistake this line exists to prevent. */}
      <header className={Style.topBar}>
        <GroupSwitcher groups={groups} current={group} onSwitch={switchGroup} />

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

        <AccountButton />
      </header>

      <HomeBody group={group} snapshot={snapshot} accountId={user.id} />

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
 * The two lists.
 *
 * Kept separate from the page above it even now that it takes plain data:
 * the top bar and the buttons are about the group, and these are about its
 * numbers.
 */
function HomeBody({ group, snapshot }) {

  const { members, accounts, sessions, costLines, participants, ledger } = snapshot

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
  const me = snapshot.members.find((member) => member.id === group.myMemberId)
  const myName = me ? displayName(me, snapshot.accounts) : ''

  const events = activityFeed({
    sessions: snapshot.sessions,
    costLines: snapshot.costLines,
    ledger: snapshot.ledger,
    members: snapshot.members,
    accounts: snapshot.accounts,
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

function AccountButton() {
  return (
    <Tooltip title="Account">
      <IconButton component={Link} href="/account" aria-label="Account">
        <AccountCircleIcon />
      </IconButton>
    </Tooltip>
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
