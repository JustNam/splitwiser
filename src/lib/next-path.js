/**
 * Where to go after signing in.
 *
 * The invite flow is the reason this exists. Tapping /join?code=ABCD-2345
 * while signed out used to end at Home with the code gone — and that link is
 * the only way a second person ever gets into a group, so losing it breaks
 * the one path the app cannot do without.
 */

/**
 * Read `?next=` safely.
 *
 * Anything that isn't a path within this app is thrown away. Without that
 * check, `?next=https://evil.example` would turn our own sign-in screen into
 * a redirect service pointing at someone else's site — an open redirect, and
 * a convincing one, because the link really does start at our domain.
 *
 * `//evil.example` is rejected too: the browser reads a leading double slash
 * as "same protocol, different host".
 *
 * @param {URLSearchParams} searchParams
 * @returns {string} a safe path, defaulting to Home
 */
export function readNextPath(searchParams) {
  const next = searchParams.get('next')

  if (!next) return '/'
  if (!next.startsWith('/')) return '/'
  if (next.startsWith('//')) return '/'

  return next
}

/**
 * Build a sign-in (or sign-up) link that comes back here afterwards.
 *
 * encodeURIComponent is not optional: the path being carried has its own
 * query string, and its `?code=` would otherwise be read as a parameter of
 * the sign-in URL instead of part of the value.
 *
 * @param {string} base - '/signin' or '/signup'
 * @param {string} returnTo - path to come back to
 * @returns {string}
 */
export function withNextPath(base, returnTo) {
  return `${base}?next=${encodeURIComponent(returnTo)}`
}

/**
 * Read `?from=` — where the back arrow should go.
 *
 * The same safety check as readNextPath, for the same reason: this value ends
 * up in an href, and an href built from a query parameter is an open redirect
 * unless something refuses anything that isn't a path of ours.
 *
 * Kept separate from `next` because they answer different questions. `next`
 * is "where was I going before you asked me to sign in"; `from` is "which
 * list did I open this out of". A screen can carry both at once.
 *
 * @param {URLSearchParams} searchParams
 * @param {string} fallback - where back goes when nobody said
 * @returns {string}
 */
export function readFromPath(searchParams, fallback = '/') {
  const from = searchParams.get('from')

  if (!from) return fallback
  if (!from.startsWith('/')) return fallback
  if (from.startsWith('//')) return fallback

  return from
}

/**
 * Tag a link with the screen it is being opened from.
 *
 *     withFrom(`/session/${id}`, '/sessions')  → '/session/123?from=%2Fsessions'
 *     withFrom('/settle?member=7', '/balances') → '/settle?member=7&from=...'
 *
 * `/` is left untagged: it is the default, and a parameter that says what
 * would have happened anyway is noise in the address bar.
 *
 * @param {string} path
 * @param {string} [from]
 * @returns {string}
 */
export function withFrom(path, from) {
  if (!from || from === '/') return path

  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}from=${encodeURIComponent(from)}`
}
