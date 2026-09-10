import { Suspense } from 'react'
import Link from 'next/link'
import { JoinGroupForm } from './components/join-group-form'
import Style from './page.module.scss'

export const metadata = {
  title: 'Join a group · SplitWiser',
}

/**
 * A3 · Join with a code
 *
 * The <Suspense> wrapper is required, not decorative: JoinGroupForm calls
 * useSearchParams(), and Next.js cannot know the query string while
 * prerendering the page on the server. Suspense marks the boundary it is
 * allowed to fill in once the request arrives in the browser.
 */
export default function JoinPage() {
  return (
    <main className={Style.page}>
      <header className={Style.header}>
        <Link href="/" className={Style.back} aria-label="Back">
          ←
        </Link>
        <h1 className={Style.title}>Join a group</h1>
      </header>

      <Suspense fallback={null}>
        <JoinGroupForm />
      </Suspense>

      <p className={Style.footer}>
        No group yet?{' '}
        <Link href="/group/new" className={Style.link}>
          Create a group
        </Link>
      </p>
    </main>
  )
}
