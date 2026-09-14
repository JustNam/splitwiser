'use client'

import { useEffect, useState } from 'react'
import Style from './style.module.scss'

/**
 * What a screen shows while it is fetching.
 *
 * Seventeen places returned `null` here, which is a white page. On a fast
 * connection nobody noticed; on a slow one every screen in the app is
 * indistinguishable from one that has crashed.
 *
 * Nothing appears for the first 300ms. Most loads finish inside that, and a
 * spinner that flashes up for 80ms reads as a glitch rather than as progress
 * — the fix for a blank screen should not be a flickering one.
 *
 * role="status" rather than role="alert": a screen reader mentions it when it
 * gets to it instead of interrupting, which is right for "still working".
 */
export function Loading({ label = 'Loading…' }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 300)
    return () => clearTimeout(timer)
  }, [])

  if (!show) return null

  return (
    <div className={Style.box} role="status">
      <span className={Style.dot} aria-hidden="true" />
      {label}
    </div>
  )
}
