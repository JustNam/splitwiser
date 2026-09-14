'use client'

import { useEffect, useState } from 'react'
import Skeleton from '@mui/material/Skeleton'
import Style from './style.module.scss'

/**
 * What a screen shows while it is fetching.
 *
 * Seventeen places returned `null` here, which is a white page. On a fast
 * connection nobody noticed; on a slow one every screen in the app was
 * indistinguishable from one that had crashed.
 *
 * Nothing appears for the first 300ms, whichever of these you use. Most loads
 * finish inside that, and a placeholder that flashes up for 80ms reads as a
 * glitch rather than as progress — the fix for a blank screen must not be a
 * flickering one.
 */

const DELAY = 300

/**
 * True once the wait has gone on long enough to be worth admitting to.
 */
function useSettled() {
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), DELAY)
    return () => clearTimeout(timer)
  }, [])

  return settled
}

/**
 * A dot. For screens whose content has no shape worth pretending to — a form,
 * mostly, where a skeleton of twelve fields would be a worse lie than a dot.
 *
 * role="status" rather than role="alert": a screen reader mentions it when it
 * gets to it instead of interrupting, which is right for "still working".
 */
export function Loading({ label = 'Loading…' }) {
  const settled = useSettled()
  if (!settled) return null

  return (
    <div className={Style.box} role="status">
      <span className={Style.dot} aria-hidden="true" />
      {label}
    </div>
  )
}

/**
 * Rows, for screens that are a list. The placeholder is the shape of what is
 * coming, so the page does not jump when it arrives — and the wait reads as
 * "your balances are on the way" rather than as "something is happening".
 *
 * aria-hidden on the rows: they are decoration standing in for content, and a
 * screen reader announcing eight empty list items is worse than silence. The
 * one sentence that IS announced lives on the wrapper.
 */
export function LoadingRows({ rows = 3, label = 'Loading…' }) {
  const settled = useSettled()
  if (!settled) return null

  return (
    <div className={Style.rows} role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={Style.row} aria-hidden="true">
          <Skeleton variant="circular" width={32} height={32} />

          <div className={Style.rowText}>
            <Skeleton variant="text" width="55%" />
            <Skeleton variant="text" width="35%" />
          </div>

          <Skeleton variant="text" width={64} />
        </div>
      ))}
    </div>
  )
}

/**
 * Fields, for a screen that is a form.
 *
 * A form has a shape too — it is just not rows. Boxes the height of a field,
 * which is honest about what is coming without pretending to know how many
 * of them there are: `fields` is the count above the fold, not the whole
 * form, because a skeleton of twelve inputs is a worse lie than three.
 */
export function LoadingForm({ fields = 3, label = 'Loading…' }) {
  const settled = useSettled()
  if (!settled) return null

  return (
    <div className={Style.fields} role="status" aria-label={label}>
      {Array.from({ length: fields }, (_, index) => (
        <Skeleton
          key={index}
          variant="rounded"
          height={52}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}
