'use client'

/**
 * The group's data, fetched once and kept.
 *
 * Every screen used to fetch the same snapshot for itself. Home → Sessions →
 * open a session → back to Home was four downloads of the same seven
 * kilobytes, and each one cost about a second before anything could be drawn.
 * The data did not change in between; only the screen did.
 *
 * This lives in the root layout, so it survives navigation. The first screen
 * pays for the fetch and every screen after it renders from memory.
 *
 * Two ways to refresh, and the difference matters:
 *
 *   reload()     — clears to 'loading'. For the Try again button, where the
 *                  person is watching and there is nothing to show meanwhile.
 *   revalidate() — refetches with the old data still on screen. For after a
 *                  mutation, where blanking a screen someone is reading is a
 *                  worse answer than a stale number for 300ms.
 *
 * Nothing revalidates on a timer. The only thing that changes this data is
 * somebody doing something, and the app knows when that happened.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { GroupsApi } from '@/api/groups'
import {
  pickCurrentGroup,
  readCurrentGroupId,
  writeCurrentGroupId,
} from '@/lib/current-group'
import { useAuth } from '@/hooks/useAuth'

const GroupDataContext = createContext(null)

export function GroupDataProvider({ children }) {
  const { user, loading: authLoading } = useAuth()

  const [state, setState] = useState({ status: 'loading' })

  // Which group to show. Starts as the remembered one and is corrected by
  // whatever listMine actually returns.
  const [groupId, setGroupId] = useState(null)

  const [attempt, setAttempt] = useState(0)

  // Groups this account was already a guest in, taken over the moment it
  // signed up with the matching address. Held so something can say so:
  // being added to a group by somebody else is the one thing in this app
  // that happens TO you, and it used to arrive with no sentence attached.
  const [claimedGroups, setClaimedGroups] = useState([])

  // Which account claiming has already been attempted for. A boolean here
  // meant "once per page load", which is right for a group switch or a retry
  // — nothing new to claim then — and wrong for the second person to sign in
  // on the same tab, whose guest rows were never claimed at all because the
  // flag was still set by the first. An id answers both.
  const claimedFor = useRef(null)

  // `wantedId` is a parameter rather than a ref: a ref written during render
  // is a value React has not promised to have kept up to date, and eslint
  // says so. Passing it in makes every caller state which group it means.
  //
  // `isCurrent` is how a fetch finds out it has been overtaken. It used to be
  // a `cancelled` flag checked in the effect AFTER awaiting load() — by which
  // time load() had already called setState, so the flag guarded nothing and
  // two quick group switches could finish out of order. Every write below
  // goes through put(), which asks first.
  const load = useCallback(
    async (accountId, wantedId, { background, isCurrent = () => true }) => {
      const put = (next) => {
        if (isCurrent()) setState(next)
      }

      if (!background) put({ status: 'loading' })

      // listMine and the snapshot used to run one after the other, costing a
      // whole round trip — about 350ms — before the second could start. The
      // group being shown is remembered in localStorage, so the snapshot can
      // be asked for at the same moment and thrown away if the guess is
      // wrong, which it almost never is.
      const guessedId = wantedId ?? readCurrentGroupId()

      // Claiming runs alongside the fetch rather than before it. Awaiting it
      // first would add a round trip to every app start for a call that
      // almost always has nothing to do; running it after means the snapshot
      // is already taken and misses what it claimed.
      const claiming =
        claimedFor.current === accountId
          ? null
          : GroupsApi.claimGuestRows().then((result) => {
              claimedFor.current = accountId
              return result
            })

      const [groupsResult, guessedSnapshot, claimResult] = await Promise.all([
        GroupsApi.listMine(accountId),
        guessedId ? GroupsApi.getSnapshot(guessedId) : null,
        claiming,
      ])

      // A claim means listMine ran against a roster this account was not in
      // yet, so both answers above are stale. Start again rather than patch:
      // it is once per sign-in, and only for somebody who was invited.
      const claimed = claimResult?.data ?? []

      if (claimed.length > 0) {
        if (!isCurrent()) return

        setClaimedGroups(claimed)

        // Bumping the attempt re-runs the effect, which calls this again.
        // Not a recursive call: a useCallback that names itself is a
        // reference to a value that does not exist while it is being built,
        // and eslint is right to refuse it. claimedFor stops the second pass
        // claiming again.
        return setAttempt((n) => n + 1)
      }

      const { data: groups, error: groupsError } = groupsResult
      if (groupsError) return put({ status: 'error', error: groupsError })
      if (groups.length === 0) return put({ status: 'no-group', groups: [] })

      // listMine decides, always. The guess is allowed to save time, never to
      // choose the group — a stale id must not show somebody a group they
      // have left.
      const group =
        groups.find((row) => row.id === wantedId) ?? pickCurrentGroup(groups)

      // Write the answer back. Without this the stored id was only ever
      // written by switchGroup, so a browser holding an id this account is
      // not in — a second account signing in on the same phone, or a first
      // run with nothing stored — guessed wrong on EVERY load and paid for a
      // speculative snapshot plus the real one, for good. Nothing corrected
      // the guess because nothing ever wrote to it.
      writeCurrentGroupId(group.id)

      if (group.id === guessedId && guessedSnapshot && !guessedSnapshot.error) {
        return put({
          status: 'ready',
          groups,
          group,
          snapshot: guessedSnapshot.data,
        })
      }

      const { data: snapshot, error } = await GroupsApi.getSnapshot(group.id)
      if (error) return put({ status: 'error', error })

      put({ status: 'ready', groups, group, snapshot })
    },
    []
  )

  // The id, not the user object. onAuthStateChange hands back a NEW session
  // object on every silent token refresh, so depending on `user` re-ran this
  // effect roughly once an hour with background:false — dropping whatever
  // somebody was reading back to skeletons for no reason at all. The id is
  // the only part of it this effect actually uses.
  const accountId = user?.id ?? null

  // The newest request wins, whichever path started it. One counter shared by
  // the effect and revalidate(), rather than a `cancelled` flag per effect
  // run: a background revalidate fired just before a group switch has no
  // cleanup to cancel it, and would otherwise land on the new screen with the
  // old group's data in it.
  const newest = useRef(0)

  const begin = useCallback(() => {
    newest.current += 1
    const mine = newest.current
    return () => newest.current === mine
  }, [])

  useEffect(() => {
    if (authLoading || !accountId) return

    // Checked at the moment of every write rather than after the await, so a
    // fetch that has been overtaken cannot land on top of a newer one.
    load(accountId, groupId, { background: false, isCurrent: begin() })
  }, [authLoading, accountId, groupId, attempt, load, begin])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  const revalidate = useCallback(() => {
    if (!accountId) return
    load(accountId, groupId, { background: true, isCurrent: begin() })
  }, [load, accountId, groupId, begin])

  const dismissClaimed = useCallback(() => setClaimedGroups([]), [])

  const switchGroup = useCallback((nextId) => {
    // Written before the fetch, so a reload lands on the same group and every
    // other screen picks up the same one.
    writeCurrentGroupId(nextId)
    setGroupId(nextId)
  }, [])

  /**
   * Change the cached snapshot in place, without a request.
   *
   * For the edits a screen already knows the answer to — a guest added, a
   * new invite code — where refetching seven kilobytes to learn one field is
   * a round trip spent on nothing.
   */
  const patch = useCallback((change) => {
    setState((current) =>
      current.status === 'ready' ? { ...current, ...change(current) } : current
    )
  }, [])

  const value = useMemo(() => {
    const base = authLoading
      ? { status: 'loading' }
      : !accountId
        ? { status: 'signed-out' }
        : state

    return {
      ...base,
      // Masked rather than cleared in an effect: signing out must not leave
      // the next person's screen showing a dialog about groups the LAST
      // person was added to.
      claimedGroups: accountId ? claimedGroups : [],
      reload,
      revalidate,
      switchGroup,
      patch,
      dismissClaimed,
    }
  }, [
    authLoading,
    accountId,
    state,
    claimedGroups,
    reload,
    revalidate,
    switchGroup,
    patch,
    dismissClaimed,
  ])

  return <GroupDataContext.Provider value={value}>{children}</GroupDataContext.Provider>
}

/**
 * @returns {{ status: 'loading'|'signed-out'|'no-group'|'error'|'ready',
 *             groups?: object[], group?: object, snapshot?: object,
 *             error?: string, claimedGroups: object[],
 *             reload: () => void, revalidate: () => void,
 *             switchGroup: (id: string) => void, patch: (fn) => void,
 *             dismissClaimed: () => void }}
 */
export function useGroupData() {
  const value = useContext(GroupDataContext)
  if (!value) throw new Error('useGroupData() needs a <GroupDataProvider> above it.')
  return value
}
