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

  // `wantedId` is a parameter rather than a ref: a ref written during render
  // is a value React has not promised to have kept up to date, and eslint
  // says so. Passing it in makes every caller state which group it means.
  const load = useCallback(
    async (accountId, wantedId, { background }) => {
      if (!background) setState({ status: 'loading' })

      // listMine and the snapshot used to run one after the other, costing a
      // whole round trip — about 350ms — before the second could start. The
      // group being shown is remembered in localStorage, so the snapshot can
      // be asked for at the same moment and thrown away if the guess is
      // wrong, which it almost never is.
      const guessedId = wantedId ?? readCurrentGroupId()

      const [groupsResult, guessedSnapshot] = await Promise.all([
        GroupsApi.listMine(accountId),
        guessedId ? GroupsApi.getSnapshot(guessedId) : null,
      ])

      const { data: groups, error: groupsError } = groupsResult
      if (groupsError) return setState({ status: 'error', error: groupsError })
      if (groups.length === 0) return setState({ status: 'no-group', groups: [] })

      // listMine decides, always. The guess is allowed to save time, never to
      // choose the group — a stale id must not show somebody a group they
      // have left.
      const group =
        groups.find((row) => row.id === wantedId) ?? pickCurrentGroup(groups)

      if (group.id === guessedId && guessedSnapshot && !guessedSnapshot.error) {
        return setState({
          status: 'ready',
          groups,
          group,
          snapshot: guessedSnapshot.data,
        })
      }

      const { data: snapshot, error } = await GroupsApi.getSnapshot(group.id)
      if (error) return setState({ status: 'error', error })

      setState({ status: 'ready', groups, group, snapshot })
    },
    []
  )

  useEffect(() => {
    if (authLoading || !user) return

    let cancelled = false

    // The guard is here rather than inside load(), so a response arriving
    // after sign-out cannot write to a signed-out app.
    async function run() {
      const result = await load(user.id, groupId, { background: false })
      if (cancelled) return result
    }

    run()

    return () => {
      cancelled = true
    }
  }, [authLoading, user, groupId, attempt, load])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  const revalidate = useCallback(() => {
    if (!user) return
    load(user.id, groupId, { background: true })
  }, [load, user, groupId])

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
      : !user
        ? { status: 'signed-out' }
        : state

    return { ...base, reload, revalidate, switchGroup, patch }
  }, [authLoading, user, state, reload, revalidate, switchGroup, patch])

  return <GroupDataContext.Provider value={value}>{children}</GroupDataContext.Provider>
}

/**
 * @returns {{ status: 'loading'|'signed-out'|'no-group'|'error'|'ready',
 *             groups?: object[], group?: object, snapshot?: object,
 *             error?: string, reload: () => void, revalidate: () => void,
 *             switchGroup: (id: string) => void, patch: (fn) => void }}
 */
export function useGroupData() {
  const value = useContext(GroupDataContext)
  if (!value) throw new Error('useGroupData() needs a <GroupDataProvider> above it.')
  return value
}
