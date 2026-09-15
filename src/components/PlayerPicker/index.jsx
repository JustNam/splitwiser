'use client'

import { useState } from 'react'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import SearchIcon from '@mui/icons-material/Search'
import { Chip, ChipGroup } from '@/components/Chip'
import { TextButton } from '@/components/TextButton'
import Style from './style.module.scss'

/**
 * Who played — for a group of four and a group of a hundred.
 *
 * Ticking names is the most repeated action in the app, so the control has to
 * be chips. Chips do not scale on their own: a hundred of them is a wall that
 * pushes everything else off the screen, and the search box that helps at a
 * hundred is a box in the way at four.
 *
 * Three rules, each earning its complexity only above a threshold:
 *
 *   Search is an icon until it is asked for. A permanently open field spends
 *   a whole row saying "you could type here" on every screen where nobody
 *   needs to.
 *
 *   Everyone and Nobody appear with the search. Below that they save nobody
 *   a tap.
 *
 *   The list is capped, and the people who ARE playing are never in the part
 *   that gets cut. They are the answer to the question the block asks; hiding
 *   one behind "Show all" to save room would hide the only thing worth
 *   seeing.
 */

// A search box below this many people is a box nobody needs.
const SEARCHABLE_FROM = 8

// How many people who are NOT playing to show before folding the rest away.
// Enough that a normal group is never folded, few enough that a big one does
// not bury the screen.
const UNPICKED_CAP = 12

export function PlayerPicker({
  members,
  nameOf,
  present,
  onToggle,
  onSetAll,
  note,
  disabled,
}) {
  const [searching, setSearching] = useState(false)
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)

  const searchable = members.length >= SEARCHABLE_FROM
  const query = search.trim().toLowerCase()

  const matches = members.filter(
    (member) => query === '' || nameOf(member).toLowerCase().includes(query)
  )

  const picked = matches.filter((member) => present[member.id])
  const unpicked = matches.filter((member) => !present[member.id])

  // Searching means you already named who you want, so nothing is folded.
  const folded = query === '' && !showAll && unpicked.length > UNPICKED_CAP
  const shown = folded ? unpicked.slice(0, UNPICKED_CAP) : unpicked
  const hidden = unpicked.length - shown.length

  return (
    <>
      {/* Bulk on the left, search on the right, on every screen that shows
          this. The position used to depend on whether a note happened to be
          present — New session had one and Edit did not, so the same three
          controls sat in two different places.

          A spacer that grows, not `margin-left: auto` on the icon: the icon
          is a MUI component whose own class ties with ours on specificity,
          and which of the two wins depends on the order Emotion injects its
          styles. A flex child that eats the free space does not care. */}
      {searchable && (
        <div className={Style.toolbar}>
          <div className={Style.bulk}>
            {onSetAll && (
              <>
                <TextButton
                  tone="quiet"
                  onClick={() => onSetAll(true)}
                  disabled={disabled}
                >
                  Everyone
                </TextButton>
                <TextButton
                  tone="quiet"
                  onClick={() => onSetAll(false)}
                  disabled={disabled}
                >
                  Nobody
                </TextButton>
              </>
            )}
          </div>

          <Tooltip title="Search names">
            <IconButton
              className={Style.searchButton}
              onClick={() => {
                // Closing clears the query too. A hidden filter still
                // filtering is a list that looks like it has lost people.
                if (searching) setSearch('')
                setSearching((current) => !current)
              }}
              aria-label="Search names"
              aria-expanded={searching}
              disabled={disabled}
            >
              <SearchIcon />
            </IconButton>
          </Tooltip>
        </div>
      )}

      {/* Its own line, below the controls rather than among them, so it
          cannot move them. */}
      {note && <p className={Style.note}>{note}</p>}

      <Collapse in={searching} unmountOnExit>
        <TextField
          label="Search names"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          size="small"
          autoFocus
          fullWidth
          disabled={disabled}
        />
      </Collapse>

      <ChipGroup>
        {/* Playing first, always. The order is the answer to the question. */}
        {picked.map((member) => (
          <Chip
            key={member.id}
            selected
            onClick={() => onToggle(member.id)}
            disabled={disabled}
          >
            {nameOf(member)}
          </Chip>
        ))}

        {shown.map((member) => (
          <Chip key={member.id} onClick={() => onToggle(member.id)} disabled={disabled}>
            {nameOf(member)}
          </Chip>
        ))}

        {matches.length === 0 && (
          <p className={Style.hint}>Nobody here by that name.</p>
        )}
      </ChipGroup>

      {folded && (
        <TextButton tone="quiet" onClick={() => setShowAll(true)} disabled={disabled}>
          Show {hidden} more
        </TextButton>
      )}

      {showAll && query === '' && unpicked.length > UNPICKED_CAP && (
        <TextButton tone="quiet" onClick={() => setShowAll(false)} disabled={disabled}>
          Show fewer
        </TextButton>
      )}
    </>
  )
}
