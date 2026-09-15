import clsx from 'clsx'
import Link from 'next/link'
import { formatVnd } from '@/services/money.service'
import { LinkButton } from '@/components/LinkButton'
import { Avatar } from '@/components/Avatar'
import { SectionHeader } from '@/components/SectionHeader'
import { withFrom } from '@/lib/next-path'
import Style from './style.module.scss'

/**
 * The Balances block on Home — one row per person with an open balance.
 *
 * Direction is spelled out in words on every row, never as a + or − in front
 * of the number. The B1 spec is explicit about it: a sign gets read the wrong
 * way round often enough to matter when the number is money someone owes.
 * Colour only reinforces the words; it never carries the meaning alone.
 *
 * `limit` cuts the list down for Home, where this block competes for space
 * with the sessions and the buttons. The full list lives on /balances. Both
 * render the same component, so the row can only look one way.
 *
 * No 'use client': nothing here has state or handlers.
 */
export function BalanceList({ rows, net, memberCount, limit, seeAllHref, from }) {
  const shown = limit ? rows.slice(0, limit) : rows
  const hidden = rows.length - shown.length
  return (
    <section className={Style.section}>
      <SectionHeader
        meta={
          <>
            {memberCount} {memberCount === 1 ? 'person' : 'people'}
          </>
        }
      >
        Balances
      </SectionHeader>

      {/* Where you stand once everybody is added up, above the people it is
          added up from.
          The rows answer "how do I stand with Nam"; nothing answered "am I up
          or down" — and with three people owing you and two you owe, that is
          not a sum anybody does in their head off a list. Same wording and
          same two colours as the top of Settle up, because it is the same
          number: two screens disagreeing about which way round a net reads is
          worse than either of them not showing it.
          Not drawn when everything is settled: the block below already says
          so in a sentence, and "You're owed 0đ" says it worse. */}
      {rows.length > 0 && (
        <div className={Style.netBox}>
          <p className={Style.netLabel}>Net across everyone</p>
          <p className={clsx(Style.netText, net >= 0 ? Style.lent : Style.owed)}>
            {net >= 0 ? `You’re owed ${formatVnd(net)}` : `You owe ${formatVnd(-net)}`}
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        // Not an empty state so much as an achievement — hence the tag rather
        // than the grey "nothing here yet" treatment.
        <div className={Style.settled}>
          <p className={Style.settledTag}>All settled</p>
          <p className={Style.settledText}>Nobody owes anybody.</p>
        </div>
      ) : (
        <>
          <ul className={Style.list}>
            {shown.map((row) => (
              <BalanceRow key={row.memberId} row={row} from={from} />
            ))}
          </ul>

          {/* The count is in the link because "See all" alone doesn't say
              whether it is worth the tap. */}
          {hidden > 0 && seeAllHref && (
            <LinkButton variant="quiet" href={seeAllHref}>
              See all {rows.length}
            </LinkButton>
          )}
        </>
      )}
    </section>
  )
}

function BalanceRow({ row, from }) {
  const owedToMe = row.direction === 'they-owe-me'

  // One line, one number — and a link to where the number comes from. B5
  // shows each debt against its own session and cost line, which is the
  // answer someone actually wants when they doubt a total.
  //
  // The <Link> wraps the whole row rather than sitting inside it, so the
  // entire card is the tap target.
  return (
    <li>
      <Link href={withFrom(`/settle?member=${row.memberId}`, from)} className={Style.row}>
        {/* aria-hidden inside the Avatar: the name is right there in the
            sentence, and "T T" read out before it is noise. */}
        <Avatar name={row.name} />

        <span className={Style.phrase}>
          {owedToMe ? 'You lent ' : 'You owe '}
          <span className={Style.name}>{row.name}</span>
          {row.isGuest && <span className={Style.guest}>Guest</span>}
        </span>

        <span className={clsx(Style.amount, owedToMe ? Style.lent : Style.owed)}>
          {formatVnd(row.amount)}
        </span>
      </Link>
    </li>
  )
}
