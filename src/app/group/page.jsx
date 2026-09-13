import { GroupDetail } from './components/group-detail'
import Style from './page.module.scss'

export const metadata = {
  title: 'Group · SplitWiser',
}

/**
 * C1 · Group page
 *
 * Adding page.jsx here makes /group a route of its own; /group/new keeps
 * working because it has its own page.jsx one level down.
 *
 * The wireframe also has Rename in the header. Left out: it needs its own
 * write, and nothing is blocked by a group being called the wrong thing.
 */
export default function GroupPage() {
  return (
    <main className={Style.page}>
      <GroupDetail />
    </main>
  )
}
