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
