'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import Dialog from '@mui/material/Dialog'
import { Button } from '@/components/Button'
import { TextButton } from '@/components/TextButton'
import Style from './style.module.scss'

/**
 * The top of every screen below Home: a way back, the title, and sometimes
 * one action on the right.
 *
 * It exists because there were nine copies of the back arrow and the title
 * was an h1 on one screen, an h2 on four and an h3 on three. Which size a
 * heading is should not depend on which file somebody was in that day.
 *
 * `title` may be omitted while data is still loading, which is why the two
 * screens whose title IS the data — a session's date, the group's name —
 * render this from inside their client component.
 *
 * `backHref` defaults to Home. Screens opened out of a list pass the list
 * instead, read from `?from=` — see lib/next-path.js. Deliberately NOT
 * router.back(): on a link opened from a chat there is no history to go back
 * through, and "back" would leave the app.
 *
 * `guard` turns the arrow into a question. Pass `{ when, message }` from a
 * form with unsaved work in it; leaving is then something you confirm rather
 * than something that happens to you.
 */
export function PageHeader({ backHref = '/', title, action, guard }) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)

  const armed = Boolean(guard?.when)

  return (
    <header className={Style.header}>
      {armed ? (
        <button
          type="button"
          className={Style.back}
          onClick={() => setAsking(true)}
          aria-label="Back"
        >
          <ArrowBackIcon fontSize="small" />
        </button>
      ) : (
        <Link href={backHref} className={Style.back} aria-label="Back">
          <ArrowBackIcon fontSize="small" />
        </Link>
      )}

      {title && <h1 className={Style.title}>{title}</h1>}

      {action && <div className={Style.action}>{action}</div>}

      {/* MUI for the behaviour a dialog is almost entirely made of: focus
          trap, Escape, scroll lock. The look is ours. */}
      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        aria-labelledby="leave-confirm-title"
        // `xs` (444px), not MUI's default `sm` (600px). This asks one
        // question in one sentence, and the whole app is a 480px column — a
        // dialog wider than the screen it interrupts reads as a different
        // app arriving rather than as a question about this one.
        maxWidth="xs"
        fullWidth
      >
        <div className={Style.confirm}>
          <h2 className={Style.confirmTitle} id="leave-confirm-title">
            Leave without saving?
          </h2>

          <p className={Style.confirmText}>{guard?.message}</p>

          {/* Staying is the safe answer, so it is the one under your thumb
              and the one that looks like the button. Leaving is the quiet
              text — findable, never tapped by accident. */}
          <Button fullWidth onClick={() => setAsking(false)}>
            Keep editing
          </Button>

          <TextButton tone="danger" onClick={() => router.push(backHref)}>
            Discard and leave
          </TextButton>
        </div>
      </Dialog>
    </header>
  )
}
