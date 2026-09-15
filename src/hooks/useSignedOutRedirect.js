'use client'

/**
 * Send a signed-out visitor to the front door, and remember where they were
 * going.
 *
 * Someone opens a link to a session, or comes back to /account on a phone
 * whose session has expired, and the screen said "You need to sign in first"
 * — a dead end wearing a link. Worse on a shared link: the person has done
 * nothing wrong and is being told off by a screen that could simply have
 * asked.
 *
 * Home is the sign-in screen, so that is where they go, carrying `?next=`.
 * SigninForm reads it and returns them to the link they opened.
 *
 * `router.replace`, not push: the signed-out screen should not be a place the
 * back button can return to, or signing in and pressing back lands on the
 * dead end again.
 *
 * window.location.search rather than useSearchParams(): most of these screens
 * are statically prerendered, and useSearchParams() in one of those requires
 * a Suspense boundary or the build fails. Inside an effect there is always a
 * window, and no such rule.
 */

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { withNextPath } from '@/lib/next-path'

export function useSignedOutRedirect(status) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (status !== 'signed-out') return

    router.replace(withNextPath('/', pathname + window.location.search))
  }, [status, pathname, router])
}
