/**
 * Which group the app is currently showing.
 *
 * One account can belong to several groups, and every screen needs to agree
 * on which one — otherwise switching group on Home and then tapping New
 * session logs the game into the group you just switched away from. The spec
 * calls that out as the mistake the group name in the top bar exists to
 * prevent, so it can't be left to each screen to pick for itself.
 *
 * localStorage rather than React state or a URL parameter:
 *   - state is lost on reload, and a phone reloads a PWA constantly
 *   - a parameter would have to be threaded through every <Link> in the app,
 *     and one missed link silently reverts to the wrong group
 *
 * It is a per-browser convenience, not data. Nothing here is authoritative:
 * every screen still checks the stored id against the groups it actually got
 * back, and falls back to the first one.
 */

const KEY = 'splitwiser.currentGroupId'

/**
 * The stored id, or null.
 *
 * Wrapped in try/catch because localStorage is not merely empty in a private
 * window or with site data blocked — reading it throws.
 */
export function readCurrentGroupId() {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function writeCurrentGroupId(groupId) {
  try {
    window.localStorage.setItem(KEY, groupId)
  } catch {
    // Nothing to do. The app works without it; only the choice is forgotten.
  }
}

/**
 * Pick the group to show out of the ones this account belongs to.
 *
 * The stored id is a preference, not a fact: the group may have been left, or
 * the storage may belong to a different account on the same browser. Anything
 * that doesn't match falls back to the first group.
 *
 * @param {object[]} groups - from GroupsApi.listMine()
 * @returns {object|undefined}
 */
export function pickCurrentGroup(groups) {
  const storedId = readCurrentGroupId()
  return groups.find((group) => group.id === storedId) ?? groups[0]
}
