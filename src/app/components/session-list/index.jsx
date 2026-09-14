import Link from 'next/link'
import { SectionHeader } from '@/components/SectionHeader'
import { formatVnd } from '@/services/money.service'
import { LinkButton } from '@/components/LinkButton'
import { withFrom } from '@/lib/next-path'
import Style from './style.module.scss'

/**
 * The Sessions block on Home — recent sessions, newest first.
 *
 * Each row links to B3. The <Link> wraps the whole row rather than sitting
 * inside it, so the entire card is the tap target — a 60px row with a 20px
 * link in it is the kind of thing that only annoys people on phones.
 *
 * `from` is where B3's back arrow should return to. Home leaves it unset and
 * gets the default; /sessions passes itself, so coming back lands in the list
 * you were reading rather than at the top of the app.
 */
export function SessionList({ rows, limit, seeAllHref, from }) {
  const shown = limit ? rows.slice(0, limit) : rows
  const hidden = rows.length - shown.length

  if (rows.length === 0) {
    return (
      <section className={Style.section}>
        <SectionHeader>Sessions</SectionHeader>
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
      <SectionHeader>Sessions</SectionHeader>

      <ul className={Style.list}>
        {shown.map((row) => (
          <li key={row.id}>
            <Link href={withFrom(`/session/${row.id}`, from)} className={Style.row}>
              <span className={Style.info}>
                <span className={Style.date}>
                  {/* A date is data, not a word that happens to look like one.
                      dateTime gives the machine-readable form, so "10 Sep"
                      stays short for a human without the year being lost. */}
                  <time dateTime={row.date}>{row.dateLabel}</time>
                  {row.isEdited && <span className={Style.edited}>Edited</span>}
                </span>
                <span className={Style.subtitle}>{row.subtitle}</span>
              </span>

              <span className={Style.total}>{formatVnd(row.total)}</span>
              <span className={Style.chevron} aria-hidden="true">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {hidden > 0 && seeAllHref && (
        <LinkButton variant="quiet" href={seeAllHref}>
          See all {rows.length}
        </LinkButton>
      )}
    </section>
  )
}
