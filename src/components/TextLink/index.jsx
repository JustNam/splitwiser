import clsx from 'clsx'
import Link from 'next/link'
import Style from './style.module.scss'

/**
 * A link inside a sentence: "You need to sign in first."
 *
 * Trivial, and that is the point — it was written out fourteen times, in
 * fourteen stylesheets, and had already drifted.
 */
export function TextLink({ className, ...props }) {
  return <Link className={clsx(Style.link, className)} {...props} />
}
