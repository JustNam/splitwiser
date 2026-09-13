'use client'

import clsx from 'clsx'
import Style from './style.module.scss'

/**
 * A name you can tick: who played.
 *
 * A real <button>, not a checkbox dressed up. It belongs to no form, submits
 * nothing, and toggles a choice on this screen — which is what a button with
 * `aria-pressed` is for. The pressed state is what a screen reader reads out,
 * so ticking is not something only sighted users can tell has happened.
 */
export function Chip({ selected = false, className, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={clsx(Style.chip, selected && Style.selected, className)}
      {...props}
    />
  )
}

/** The wrapping row. Wraps onto as many lines as the roster needs. */
export function ChipGroup({ children }) {
  return <div className={Style.group}>{children}</div>
}
