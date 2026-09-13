import Style from './style.module.scss'

/**
 * The label above a block within a screen: Costs, Who played, Split, Members,
 * Invite, Edits.
 *
 * Two levels exist on purpose and only two. A screen has ONE h1; everything
 * inside it is one of these. Home's Balances and Sessions are the same level
 * as B3's Costs — they only looked different because they were written in
 * different files.
 *
 * `meta` is the quiet counter on the right: "6 of 30", "2 people".
 */
export function SectionHeader({ children, meta }) {
  return (
    <header className={Style.header}>
      <h2 className={Style.title}>{children}</h2>
      {meta && <p className={Style.meta}>{meta}</p>}
    </header>
  )
}
