import clsx from 'clsx'
import Style from './style.module.scss'

/**
 * A button that looks like a link: Select all, Everyone, + Add a guest, Sign
 * out, Go back.
 *
 * Still a <button>, because all of these DO something rather than go
 * somewhere — that is what decides the element. The link look is only about
 * weight: a solid button here would compete with the one real action at the
 * bottom of the screen.
 *
 * `tone="quiet"` for the ones that should recede (Go back, Sign out).
 */
export function TextButton({ tone = 'brand', className, ...props }) {
  return (
    <button
      type="button"
      className={clsx(Style.button, Style[tone], className)}
      {...props}
    />
  )
}
