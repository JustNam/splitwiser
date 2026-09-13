import { NewSessionForm } from './components/new-session-form'
import { PageHeader } from '@/components/PageHeader'
import Style from './page.module.scss'

export const metadata = {
  title: 'New session · SplitWiser',
}

/**
 * B2 · New session
 *
 * The header is static, so it stays a Server Component; everything that moves
 * lives in the form. The wireframe puts the date picker up here beside the
 * title — it sits inside the form instead, because the date is form state and
 * splitting state across a server/client boundary buys nothing.
 */
export default function NewSessionPage() {
  return (
    <main className={Style.page}>
      <PageHeader title="New session" />

      <NewSessionForm />
    </main>
  )
}
