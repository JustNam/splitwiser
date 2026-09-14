import { NewSessionForm } from './components/new-session-form'
import Style from './page.module.scss'

export const metadata = {
  title: 'New session · SplitWiser',
}

/**
 * B2 · New session
 *
 * The header used to live here, static. It moved into the form: the back
 * arrow has to ask before discarding a half-filled session, and whether there
 * is anything to discard is form state. Same reason the date picker is in
 * there rather than up beside the title as the wireframe draws it.
 */
export default function NewSessionPage() {
  return (
    <main className={Style.page}>
      <NewSessionForm />
    </main>
  )
}
