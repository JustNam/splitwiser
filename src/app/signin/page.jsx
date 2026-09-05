import Link from 'next/link'
import { SigninForm } from './components/signin-form'
import Style from './page.module.scss'

export const metadata = {
  title: 'Sign in · CourtTab',
}

/**
 * A1 · Sign in
 *
 * A Server Component (no 'use client'): static text only, with the interactive
 * part handed to <SigninForm />. Marking the whole page 'use client' to get one
 * form working would ship the headline and footer to the browser as JS too.
 */
export default function SigninPage() {
  return (
    <main className={Style.page}>
      <header className={Style.header}>
        <p className={Style.wordmark}>Splitwiser</p>
        <h1 className={Style.title}>Welcome back</h1>
        <p className={Style.pitch}>
          Log a game session, split the cost, and see who owes who —
          without anyone having to do the maths.
        </p>
      </header>

      <SigninForm />

      <p className={Style.footer}>
        New here?{' '}
        <Link href="/signup" className={Style.link}>
          Create an account
        </Link>
      </p>
    </main>
  )
}
