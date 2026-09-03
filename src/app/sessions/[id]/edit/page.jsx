// STUB — replaced in Step 11. Route: /sessions/s1/edit
export default async function EditSessionPage({ params }) {
  const { id } = await params

  return (
    <main style={{ padding: 'var(--space-16)' }}>
      <h1>B4 · Edit session</h1>
      <p>
        Editing session: <b>{id}</b>
      </p>
      <p>
        What it says now vs what it will become — you type the correct value,
        never a delta. Preview how every person&rsquo;s amount changes before
        saving, and warn when someone who already paid is affected. The word
        &ldquo;adjustment&rdquo; never appears on screen.
      </p>
    </main>
  )
}
