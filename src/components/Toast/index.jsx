'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import Style from './style.module.scss'

/**
 * Short-lived confirmation that something worked, or didn't.
 *
 * Every action in this app used to end in silence or in a redirect. Settling
 * a debt — the one thing here that cannot be undone — pushed you to Home with
 * nothing said, so the only way to know it had worked was to read the numbers
 * and infer it.
 *
 * ONE dark surface for both tones, not green and red backgrounds. White on
 * --semantic-green-500 lands at 3.96:1, under the 4.5:1 floor, and darkening
 * the green until it passes gives a colour nobody chose. So the tone is
 * carried by a marker and by the words, which is the rule the balance rows
 * already follow: colour reinforces meaning, never carries it alone.
 *
 * A failure is NOT auto-dismissed. Something you need to act on should not
 * vanish while you are still reading it.
 */

const ToastContext = createContext(null)

// Long enough to read a short sentence, short enough not to sit in the way.
const SUCCESS_LIFETIME = 4000

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(1)

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (tone, message) => {
      const id = nextId.current
      nextId.current += 1

      setToasts((current) => [...current, { id, tone, message }])

      if (tone === 'success') setTimeout(() => dismiss(id), SUCCESS_LIFETIME)
    },
    [dismiss]
  )

  // Memoised so every consumer doesn't re-render whenever a toast appears.
  const api = useMemo(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
    }),
    [push]
  )

  const shown = (tone) => toasts.filter((toast) => toast.tone === tone)

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* Both regions are always in the DOM, empty or not. A live region that
          is created at the same moment as its content is one many screen
          readers never announce — they watch regions that already exist.

          Two of them, because the two tones deserve different manners:
          "Session saved" can wait for a gap in the speech, "Couldn't save"
          should interrupt. */}
      <div className={Style.viewport}>
        <div role="status" aria-live="polite" className={Style.region}>
          {shown('success').map((toast) => (
            <ToastRow key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>

        <div role="alert" aria-live="assertive" className={Style.region}>
          {shown('error').map((toast) => (
            <ToastRow key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  )
}

function ToastRow({ toast, onDismiss }) {
  return (
    <div className={Style.toast}>
      <span
        className={clsx(Style.marker, Style[toast.tone])}
        aria-hidden="true"
      />

      <span className={Style.message}>{toast.message}</span>

      <button
        type="button"
        className={Style.close}
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}

/**
 * `const toast = useToast()` → `toast.success('Saved')` / `toast.error(...)`.
 */
export function useToast() {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast() needs a <ToastProvider> above it.')
  return api
}
