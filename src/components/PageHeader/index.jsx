'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import Dialog from '@mui/material/Dialog'
import { Button } from '@/components/Button'
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

  // ---- leaving by any route other than the arrow --------------------------
  //
  // On a phone the arrow is not how people go back. They swipe from the edge,
  // or press the system button, or pull down and refresh — and all three used
  // to throw a half-filled session away without a word, on a screen whose own
  // back arrow asks politely.
  //
  // Two mechanisms, because the browser gives two different events:

  // A reload, a closed tab, or a link out of the app. The browser shows its
  // own wording here — nothing we pass is displayed — and only offers it at
  // all if the person has interacted with the page, which by definition they
  // have.
  useEffect(() => {
    if (!armed) return

    const ask = (event) => {
      event.preventDefault()
      // Legacy, and still what several browsers actually check.
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [armed])

  // The back gesture. There is no cancellable event for it — by the time
  // anything fires, the browser has already moved. So the trick is to give it
  // somewhere harmless to move TO: one extra history entry for the same URL,
  // pushed the moment the form has something worth losing. Back then lands on
  // us instead of leaving, and we can ask.
  //
  // `dirty` and `decoy` are refs, not state: the listener is registered once
  // and has to read what is true when it FIRES, not what was true when it was
  // registered.
  const dirty = useRef(armed)
  const decoy = useRef(false)

  useEffect(() => {
    dirty.current = armed
  }, [armed])

  useEffect(() => {
    if (!armed || decoy.current) return

    decoy.current = true
    // Same URL, so the address bar does not change and nothing re-renders.
    window.history.pushState(null, '')
  }, [armed])

  useEffect(() => {
    function onPop() {
      // Anything we pushed has now been spent.
      if (!decoy.current) return
      decoy.current = false

      if (!dirty.current) {
        // Saved, or emptied, while the extra entry was still in the stack.
        // Carry on going back rather than making them press it twice — and
        // this cannot loop, because decoy is false from here on.
        window.history.back()
        return
      }

      setAsking(true)
    }

    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  /** Staying put. The entry that was just spent is put back, so the next
      swipe asks again rather than leaving in silence. */
  function keepEditing() {
    setAsking(false)

    if (!decoy.current && dirty.current) {
      decoy.current = true
      window.history.pushState(null, '')
    }
  }

  /** Going anyway. Disarmed first, or beforeunload would ask a second time
      on the way out.
   *
   * replace, not push: the entry we are standing on is the spare one this
   * guard pushed, and replace lands on top of it rather than beside it. Push
   * left it in the stack, so the next Back went to a copy of the screen just
   * abandoned and the press looked like it had done nothing. */
  function leave() {
    dirty.current = false
    setAsking(false)
    router.replace(backHref)
  }

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
        onClose={keepEditing}
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

          {/* Both are buttons, because both are commands. Weight says which
              is which: staying is filled, leaving is outlined. Text alone
              reads as a link — somewhere to go, not something to do. */}
          <Button fullWidth onClick={keepEditing}>
            Keep editing
          </Button>

          <Button variant="secondary" fullWidth onClick={leave}>
            Discard and leave
          </Button>
        </div>
      </Dialog>
    </header>
  )
}
