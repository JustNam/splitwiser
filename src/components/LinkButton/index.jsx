import clsx from 'clsx'
import Link from 'next/link'
import Style from './style.module.scss'

/**
 * A link wearing a button's clothes: New session, Go to group, Join with a
 * code, Pay my share.
 *
 * A <Link> and not a <Button> because these navigate. A screen reader should
 * announce them as links, and a middle click should open a new tab — neither
 * of which a <button> with an onClick can do.
 *
 * Same variants as Button, so the two can sit side by side in a footer and
 * look like one row, which they do on Home.
 */
export function LinkButton({ variant = 'primary', className, ...props }) {
  return <Link className={clsx(Style.link, Style[variant], className)} {...props} />
}
