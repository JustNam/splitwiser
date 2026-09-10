import { EditSessionForm } from './components/edit-session-form'
import Style from './page.module.scss'

export const metadata = {
  title: 'Edit session · SplitWiser',
}

/**
 * B4 · Edit session
 *
 * The word "adjustment" never appears on this screen. Per the spec's own
 * vocabulary note: `adjustment` is a value of Ledger.type, a data-model
 * detail. The user is editing a session, and that is all they should have to
 * know.
 */
export default function EditSessionPage() {
  return (
    <main className={Style.page}>
      <EditSessionForm />
    </main>
  )
}
