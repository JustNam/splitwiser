import { Lato } from 'next/font/google'
import { AppProviders } from '@/components/AppProviders'
import styles from './layout.module.scss'
import '@/styles/globals.scss'

/**
 * Lato is the single brand typeface (Sociolla Uniform — no mono).
 * next/font downloads and self-hosts it at build time, so there's no
 * render-blocking request to Google at runtime.
 *
 * Note: Lato ships `latin` + `latin-ext` only — no `vietnamese` subset.
 * latin-ext covers many Vietnamese characters but not all of them, so a few
 * (ữ, ự, ợ …) fall back to the system font. Same limitation the prototype has.
 */
const lato = Lato({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '700', '900'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-lato', // consumed by --font-sans in _tokens.scss
})

export const metadata = {
  title: 'Splitwiser',
  description: 'Log game sessions and split the cost with your group.',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets the page paint under the notch / home bar. Required for the
  // env(safe-area-inset-*) values in _tokens.scss to be anything but 0.
  viewportFit: 'cover',
}

/**
 * The root layout wraps every screen. Whatever goes in here renders once and
 * survives navigation between routes — which is exactly why the mobile shell
 * lives here rather than being repeated in all ten pages.
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={lato.variable}>
      <body>
        <AppProviders>
          <div className={styles.app}>{children}</div>
        </AppProviders>
      </body>
    </html>
  )
}
