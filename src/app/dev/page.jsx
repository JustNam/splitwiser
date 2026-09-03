import Link from 'next/link'
import styles from './page.module.scss'

/**
 * DEV ONLY — delete before this ever ships.
 *
 * This replaces the left-hand screen list from the design canvas. That list
 * was a tool for *viewing* the design; it is not part of the product, so it
 * lives at its own URL instead of inside the app.
 *
 * Use <Link>, never <a>, for internal navigation: <a> throws away the page and
 * reloads everything, <Link> swaps only the part that changed. That difference
 * is most of what makes this feel like an app rather than a website.
 */
const ROUTES = [
  {
    section: 'A · Auth & onboarding',
    items: [
      { href: '/signin', label: 'A1 Sign in' },
      { href: '/signup', label: 'A2 Sign up' },
      { href: '/join', label: 'A3 Join with code' },
      { href: '/group/new', label: 'A4 New group (+ A4b invite)' },
    ],
  },
  {
    section: 'B · Money flow',
    items: [
      { href: '/', label: 'B1 Home' },
      { href: '/sessions/new', label: 'B2 New session' },
      { href: '/sessions/s1', label: 'B3 Session detail' },
      { href: '/sessions/s1/edit', label: 'B4 Edit session' },
      { href: '/pay', label: 'B5 Pay & debts' },
    ],
  },
  {
    section: 'C · Supporting',
    items: [{ href: '/group', label: 'C1 Group page' }],
  },
]

export default function DevIndexPage() {
  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Dev only</p>
      <h1 className={styles.title}>Screens</h1>
      <p className={styles.note}>
        Ten routes, ten screens. Try the browser back button, and try
        refreshing on any of them — both should behave, which is the whole
        reason these are URLs and not a state variable.
      </p>

      {ROUTES.map((group) => (
        <section key={group.section} className={styles.group}>
          <h2 className={styles.sectionTitle}>{group.section}</h2>
          <ul className={styles.list}>
            {group.items.map((route) => (
              <li key={route.href}>
                <Link href={route.href} className={styles.link}>
                  <span>{route.label}</span>
                  <code>{route.href}</code>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className={styles.note}>
        <b>/sessions/s2</b> works too — same file, different id. That is what
        the <code>[id]</code> folder buys you.
      </p>
    </main>
  )
}
