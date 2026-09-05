import Link from 'next/link'
import { SignupForm } from './components/signup-form'
import Style from './page.module.scss'

export const metadata = {
  title: 'Create an account · CourtTab',
}

/**
 * A2 · Sign up
 *
 * Same shape as A1: Server Component for the static text, form pushed into a
 * client component. The name rule (one name, visible in every group) is stated
 * next to the input rather than here, where nobody reads it.
 */
export default function SignupPage() {
  return (
    <main className={Style.page}>
      <header className={Style.header}>
        <p className={Style.wordmark}>CourtTab</p>
        <h1 className={Style.title}>Create your account</h1>
        <p className={Style.pitch}>
          Takes a minute. After this you can join your group with an invite
          code, or start one of your own.
        </p>
      </header>

      <SignupForm />

      <p className={Style.footer}>
        Already have an account?{' '}
        <Link href="/signin" className={Style.link}>
          Sign in
        </Link>
      </p>
    </main>
  )
}
