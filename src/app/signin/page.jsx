import { Suspense } from 'react'
import { SigninForm } from './components/signin-form'
import { TextLink } from '@/components/TextLink'
import Style from './page.module.scss'

export const metadata = {
  title: 'Sign in · SplitWiser',
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
        <p className={Style.wordmark}>SplitWiser</p>
        <h1 className={Style.title}>Welcome back</h1>
        <p className={Style.pitch}>
          Log a game session, split the cost, and see who owes who — without anyone
          having to do the maths.
        </p>
      </header>

      {/* The form reads ?next= from the URL, which isn't known when this
          page is prerendered — Next requires a Suspense boundary around
          anything that does. fallback={null} because the form is the
          screen; a spinner would only flash. */}
      <Suspense fallback={null}>
        <SigninForm />
      </Suspense>

      <p className={Style.footer}>
        New here? <TextLink href="/signup">Create an account</TextLink>
      </p>
    </main>
  )
}
