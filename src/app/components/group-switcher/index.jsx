'use client'

import { useState } from 'react'
import Link from 'next/link'
import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import LoginIcon from '@mui/icons-material/Login'
import Divider from '@mui/material/Divider'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Style from './style.module.scss'

/**
 * Which group you are looking at, and how to look at another one.
 *
 * This was a native <select>. On a phone that opens the OS picker, which is
 * the right trade for most things — but the list it opens is drawn by the
 * operating system, so the one part that looked wrong was the one part no
 * amount of CSS could reach.
 *
 * A Menu can carry more than names. "New group" and "Join with a code" lived
 * only on the group page, two taps from the person who wanted them; they are
 * the natural other answers to "which group?", so they belong in the same
 * list. That is also why this now appears with a single group, where a
 * <select> was hidden: a dropdown with one option asks a question with no
 * answer, but this one has two.
 *
 * MUI for the behaviour a menu is made of — focus trap, Escape, arrow keys,
 * click-away, and anchoring that stays on screen near an edge. The look is
 * ours, through the theme.
 */
export function GroupSwitcher({ groups, current, onSwitch }) {
  const [anchor, setAnchor] = useState(null)
  const open = Boolean(anchor)

  function choose(groupId) {
    setAnchor(null)
    if (groupId !== current.id) onSwitch(groupId)
  }

  return (
    <>
      {/* The heading stays the heading. The button inside it is what opens
          the menu, so the page still has one <h1> saying where you are. */}
      <h1 className={Style.heading}>
        <button
          type="button"
          className={Style.trigger}
          onClick={(event) => setAnchor(event.currentTarget)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {current.name}
          <ExpandMoreIcon className={Style.caret} fontSize="small" />
        </button>
      </h1>

      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ list: { 'aria-label': 'Switch group' } }}
      >
        {groups.map((row) => (
          <MenuItem
            key={row.id}
            selected={row.id === current.id}
            onClick={() => choose(row.id)}
          >
            {/* ListItemIcon rather than a span of our own: it is the piece
                MUI sizes the icon column with, so the gap is the one every
                other menu in the world uses instead of a number I picked.
                Empty for the groups you are not in — the column has to stay
                the same width or the names shuffle sideways. */}
            <ListItemIcon>
              {row.id === current.id && (
                <CheckIcon fontSize="small" className={Style.current} />
              )}
            </ListItemIcon>
            <ListItemText>{row.name}</ListItemText>
          </MenuItem>
        ))}

        <Divider />

        <MenuItem component={Link} href="/group/new" onClick={() => setAnchor(null)}>
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>New group</ListItemText>
        </MenuItem>

        <MenuItem component={Link} href="/join" onClick={() => setAnchor(null)}>
          <ListItemIcon>
            <LoginIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Join with a code</ListItemText>
        </MenuItem>
      </Menu>
    </>
  )
}
