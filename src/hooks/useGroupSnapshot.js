'use client'

/**
 * The current group and everything in it.
 *
 *     const state = useGroupSnapshot()
 *     if (state.status === 'ready') { state.group, state.snapshot }
 *
 * Now a thin read of GroupDataProvider, which holds one copy for the whole
 * app. It used to do the fetching itself, once per screen — so moving
 * between two screens downloaded the same seven kilobytes twice.
 *
 * Kept as its own hook rather than deleted: the screens using it want a
 * group and a snapshot, not a data store, and every one of them would
 * otherwise have to know about switchGroup and patch to ignore them.
 *
 * @returns {{ status: 'loading'|'signed-out'|'no-group'|'error'|'ready',
 *             group?: object, snapshot?: object, error?: string,
 *             reload: () => void }}
 */

import { useGroupData } from '@/components/GroupDataProvider'

export function useGroupSnapshot() {
  const { status, group, snapshot, error, reload } = useGroupData()
  return { status, group, snapshot, error, reload }
}
