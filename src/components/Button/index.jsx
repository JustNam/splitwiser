'use client'

/**
 * Button — our own look, not MUI's. Per constants/theme.js: MUI handles
 * BEHAVIOUR (Dialog, Select, Snackbar), our SCSS handles LOOK. A button has
 * almost no behaviour, so it's ours.
 *
 * `forwardRef` so MUI can anchor a Tooltip or Menu to it; without it that
 * warns and never positions.
 */

import clsx from 'clsx'
import { forwardRef } from 'react'
import Style from './style.module.scss'

export const Button = forwardRef(function Button(
  { variant = 'primary', fullWidth = false, className, type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      // `type` defaults to 'button', overriding the HTML default of 'submit'.
      // An unlabelled <button> inside a <form> submits it — which is a
      // surprise every single time. Forms pass type="submit" explicitly.
      type={type}
      className={clsx(
        Style.button,
        Style[variant],
        fullWidth && Style.fullWidth,
        // className comes LAST so a caller can always win.
        className
      )}
      {...props}
    />
  )
})
