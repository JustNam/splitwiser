'use client'

import Dialog from '@mui/material/Dialog'
import GroupsIcon from '@mui/icons-material/Groups'
import { Button } from '@/components/Button'
import { useGroupData } from '@/components/GroupDataProvider'
import Style from './style.module.scss'

/**
 * "You've been added to these groups."
 *
 * Somebody who was added as a guest already has a history here before they
 * have an account: shares, adjustments, money owed. Signing up with the
 * address they were added under hands them that history — which is the point
 * of the feature, and also the one thing in this app that happens TO a person
 * rather than because of them.
 *
 * It used to happen in silence. You signed up, landed on Home, and found a
 * group you had never joined with a number next to your name. This is the
 * sentence that was missing.
 *
 * Shown once, on the sign-in that claims them. Nothing remembers it
 * afterwards: there is nothing to come back to, and the groups are on Home.
 */
export function ClaimedGroupsDialog() {
  const { claimedGroups, dismissClaimed } = useGroupData()

  const count = claimedGroups?.length ?? 0

  return (
    <Dialog
      open={count > 0}
      onClose={dismissClaimed}
      aria-labelledby="claimed-title"
      maxWidth="xs"
      fullWidth
    >
      <div className={Style.box}>
        <GroupsIcon className={Style.icon} fontSize="large" />

        <h2 className={Style.title} id="claimed-title">
          {count === 1 ? 'You’re in a group' : `You’re in ${count} groups`}
        </h2>

        <p className={Style.text}>
          Somebody added you before you signed up. Everything already recorded
          against your name is here.
        </p>

        <ul className={Style.groups}>
          {claimedGroups.map((group) => (
            <li key={group.id} className={Style.group}>
              {group.name}
            </li>
          ))}
        </ul>

        <Button fullWidth onClick={dismissClaimed}>
          Got it
        </Button>
      </div>
    </Dialog>
  )
}
