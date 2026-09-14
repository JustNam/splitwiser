'use client'

import { Button } from '@/components/Button'
import Style from './style.module.scss'

/**
 * A load that failed, and the one thing worth offering afterwards.
 *
 * Every screen in this app used to end a failed fetch at a sentence. A
 * dropped connection — much the commonest cause — is fixed by asking again,
 * but the app never offered to, so the way out was for the person to work out
 * for themselves that reloading the page might help.
 *
 * role="alert" announces it; the button is what makes it actionable.
 */
export function RetryMessage({ message, onRetry, label = 'Try again' }) {
  return (
    <div className={Style.box}>
      <p className={Style.text} role="alert">
        {message}
      </p>

      <Button variant="secondary" onClick={onRetry}>
        {label}
      </Button>
    </div>
  )
}
