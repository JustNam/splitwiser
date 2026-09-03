import { formatVnd, displayName } from '@/services/money.service'
import { members, accounts } from '@/constants/mock'

export default function HomePage() {
  const checks = [
    ['formatVnd(90000)', formatVnd(90000), '90.000đ'],
    ['formatVnd(7500)', formatVnd(7500), '7.500đ'],
    ['formatVnd(105000)', formatVnd(105000), '105.000đ'],
    ['formatVnd(0)', formatVnd(0), '0đ'],
    ['displayName(m1) roster', displayName(members[0], accounts), 'Trân'],
    ['displayName(m5) guest', displayName(members[4], accounts), 'Nam'],
  ]

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>Step 4a checks</h1>
      {checks.map(([label, got, want]) => (
        <div key={label}>
          {got === want ? '✅' : '❌'} {label} → got <b>{String(got)}</b>, want <b>{want}</b>
        </div>
      ))}
    </main>
  )
}
