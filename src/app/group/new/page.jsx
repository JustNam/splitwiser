import { CreateGroupForm } from './components/create-group-form'
import { PageHeader } from '@/components/PageHeader'
import { TextLink } from '@/components/TextLink'
import Style from './page.module.scss'

export const metadata = {
  title: 'New group · SplitWiser',
}

/**
 * A4 · Create group
 *
 * Same shape as the auth screens: Server Component for the static text, the
 * interactive part in a client component.
 */
export default function NewGroupPage() {
  return (
    <main className={Style.page}>
      <PageHeader title="New group" />

      <CreateGroupForm />

      <p className={Style.footer}>
        Have an invite code? <TextLink href="/join">Join a group</TextLink>
      </p>
    </main>
  )
}
