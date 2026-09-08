import { formatVnd } from '@/services/money.service'
import Style from './style.module.scss'

/**
 * The Sessions block on Home — recent sessions, newest first.
 *
 * Rows aren't links yet; B3 (session detail) doesn't exist. The chevron is
 * there because its presence is part of what the layout is being judged on.
 */
export function SessionList({ rows }) {
  if (rows.length === 0) {
    return (
      <section className={Style.section}>
        <h2 className={Style.title}>Sessions</h2>
        <div className={Style.empty}>
          <p className={Style.emptyTitle}>No sessions yet</p>
          <p className={Style.emptyText}>
            Log a session after you play. SplitWiser works out who owes whom.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className={Style.section}>
      <h2 className={Style.title}>Sessions</h2>

      <ul className={Style.list}>
        {rows.map((row) => (
          <li key={row.id} className={Style.row}>
            <div className={Style.info}>
              <p className={Style.date}>
                {row.dateLabel}
                {row.isEdited && <span className={Style.edited}>Edited</span>}
              </p>
              <p className={Style.subtitle}>{row.subtitle}</p>
            </div>

            <p className={Style.total}>{formatVnd(row.total)}</p>
            <span className={Style.chevron} aria-hidden="true">
              ›
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
