// STUB — replaced in Step 6. Route: /sessions/s1, /sessions/s2, ...

/**
 * `[id]` is a dynamic segment: this one file serves every session URL.
 *
 * Two Next.js things worth noticing:
 *
 * 1. `params` is a Promise, so the component is `async` and we `await` it.
 *    (This changed in Next 15 — older tutorials read `params.id` directly and
 *    that no longer works.)
 *
 * 2. The sibling folder `sessions/new` is a STATIC segment, so /sessions/new
 *    always lands there, never here with id === 'new'. Static wins over
 *    dynamic. That's why "new" can safely sit next to real session ids.
 */
export default async function SessionDetailPage({ params }) {
  const { id } = await params

  return (
    <main style={{ padding: 'var(--space-16)' }}>
      <h1>B3 · Session detail</h1>
      <p>
        Session id from the URL: <b>{id}</b>
      </p>
      <p>
        Cost lines and who fronted each one; who played; each person&rsquo;s
        amount and whether it is paid; the edit history in plain words, with
        the original numbers still intact.
      </p>
    </main>
  )
}
