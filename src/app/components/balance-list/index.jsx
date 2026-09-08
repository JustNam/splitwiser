import clsx from 'clsx'
import { formatVnd } from '@/services/money.service'
import Style from './style.module.scss'

/**
 * The Balances block on Home — one row per person with an open balance.
 *
 * Direction is spelled out in words on every row, never as a + or − in front
 * of the number. The B1 spec is explicit about it: a sign gets read the wrong
 * way round often enough to matter when the number is money someone owes.
 * Colour only reinforces the words; it never carries the meaning alone.
 *
 * No 'use client': nothing here has state or handlers.
 */
export function BalanceList({ rows, memberCount }) {
  return (
    <section className={Style.section}>
      <header className={Style.header}>
        <h2 className={Style.title}>Balances</h2>
        <p className={Style.meta}>{memberCount} people</p>
      </header>

      {rows.length === 0 ? (
        // Not an empty state so much as an achievement — hence the tag rather
        // than the grey "nothing here yet" treatment.
        <div className={Style.settled}>
          <p className={Style.settledTag}>All settled</p>
          <p className={Style.settledText}>Nobody owes anybody.</p>
        </div>
      ) : (
        <ul className={Style.list}>
          {rows.map((row) => (
            <BalanceRow key={row.memberId} row={row} />
          ))}
        </ul>
      )}
    </section>
  )
}

function BalanceRow({ row }) {
  const owedToMe = row.direction === 'they-owe-me'

  // One line, one number. Where the number comes from is B5's job — it can
  // show each debt against its own session and cost line, which is the
  // answer someone actually wants when they doubt a total. The row becomes a
  // link to it once that screen exists.
  return (
    <li className={Style.row}>
      <p className={Style.phrase}>
        {owedToMe ? 'You lent ' : 'You owe '}
        <span className={Style.name}>{row.name}</span>
        {row.isGuest && <span className={Style.guest}>Guest</span>}
      </p>

      <p className={clsx(Style.amount, owedToMe ? Style.lent : Style.owed)}>
        {formatVnd(row.amount)}
      </p>
    </li>
  )
}
