'use client'

/**
 * The current group and everything in it.
 *
 *     const state = useGroupSnapshot()
 *     if (state.status === 'ready') { state.group, state.snapshot }
 *
 * Five screens had already grown their own copy of this — find the groups,
 * pick the current one, fetch the snapshot, and handle four failure states on
 * the way. This is the sixth and seventh asking for it, which is late enough.
 *
 * The older screens still have their own copies. Moving them over is safe but
 * touches five working screens at once, so it belongs in its own change.
 *
 * `reload` re-runs the fetch. A dropped connection is the commonest reason
 * this ends at 'error', and it is fixed by asking again — so every screen
 * that shows the error can offer the retry rather than leaving the person to
 * work out that reloading the page might help.
 *
 * @returns {{ status: 'loading'|'signed-out'|'no-group'|'error'|'ready',
 *             group?: object, snapshot?: object, error?: string,
 *             reload: () => void }}
 */

import { useCallback, useEffect, useState } from 'react'
import { GroupsApi } from '@/api/groups'
import { pickCurrentGroup } from '@/lib/current-group'
import { useAuth } from './useAuth'

export function useGroupSnapshot() {
  const { user, loading: authLoading } = useAuth()
  const [state, setState] = useState({ status: 'loading' })

  // Bumping this re-runs the effect. A counter rather than a boolean: two
  // failed retries in a row have to be two distinct values, or the second
  // changes nothing and the button appears broken.
  const [attempt, setAttempt] = useState(0)

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    if (authLoading || !user) return

    let cancelled = false

    async function load() {
      const { data: groups, error: groupsError } = await GroupsApi.listMine(user.id)
      if (cancelled) return
      if (groupsError) return setState({ status: 'error', error: groupsError })
      if (groups.length === 0) return setState({ status: 'no-group' })

      const group = pickCurrentGroup(groups)
      const { data: snapshot, error: snapshotError } = await GroupsApi.getSnapshot(
        group.id
      )
      if (cancelled) return
      if (snapshotError) return setState({ status: 'error', error: snapshotError })

      setState({ status: 'ready', group, snapshot })
    }

    load()

    // Without this, a response arriving after the screen has gone sets state
    // on a component that no longer exists.
    return () => {
      cancelled = true
    }
  }, [authLoading, user, attempt])

  // Decided here rather than written into state from the effect: setting
  // state synchronously in an effect body costs a second render for nothing,
  // and eslint rejects it outright.
  if (authLoading) return { status: 'loading', reload }
  if (!user) return { status: 'signed-out', reload }

  return { ...state, reload }
}
