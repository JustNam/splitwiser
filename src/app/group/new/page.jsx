import Link from 'next/link'
import { CreateGroupForm } from './components/create-group-form'
import Style from './page.module.scss'

export const metadata = {
  title: 'New group · SplitWiser',
}

/**
 * A4 · Create group
 *
 * Same shape as the auth screens: Server Component for the static text, the
 * interactive part in a client component.
 */
export default function NewGroupPage() {
  return (
    <main className={Style.page}>
      <header className={Style.header}>
        <Link href="/" className={Style.back} aria-label="Back">
          ←
        </Link>
        <h1 className={Style.title}>New group</h1>
      </header>

      <CreateGroupForm />

      <p className={Style.footer}>
        Have an invite code?{' '}
        <Link href="/join" className={Style.link}>
          Join a group
        </Link>
      </p>
    </main>
  )
}
