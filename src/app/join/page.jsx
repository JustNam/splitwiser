import { Suspense } from 'react'
import { JoinGroupForm } from './components/join-group-form'
import { PageHeader } from '@/components/PageHeader'
import { TextLink } from '@/components/TextLink'
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
      <PageHeader title="Join a group" />

      <Suspense fallback={null}>
        <JoinGroupForm />
      </Suspense>

      <p className={Style.footer}>
        No group yet? <TextLink href="/group/new">Create a group</TextLink>
      </p>
    </main>
  )
}
