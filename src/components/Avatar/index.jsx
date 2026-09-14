import clsx from 'clsx'
import Style from './style.module.scss'

/**
 * A person, as a coloured disc with their initials in it.
 *
 * Every list of people in this app was a column of left-aligned text, which
 * you have to READ to find anyone in. A disc is something the eye lands on —
 * it matters least at three people and most at thirty, which is the size the
 * group screens are built for.
 *
 * Ours rather than MUI's Avatar: the shape and the letters are the easy part,
 * and the only thing worth getting right — a colour that is the same every
 * time for the same person — is not something MUI decides for you.
 *
 * Deliberately NOT random, and NOT by list position: a member who moves up a
 * row when somebody leaves the group must not change colour, or the thing
 * that made them recognisable becomes the thing that misleads you.
 */

// Six that all clear 4.5:1 against white text, checked rather than picked by
// eye. Six is enough to break up a list; more and they start to look alike,
// which defeats the point.
const TONES = ['plum', 'teal', 'indigo', 'clay', 'moss', 'slate']

export function Avatar({ name, size = 'md', className }) {
  return (
    <span
      className={clsx(Style.avatar, Style[size], Style[toneFor(name)], className)}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}

/**
 * 'Thoa Tran' → 'TT', 'Katie' → 'K'.
 *
 * First and last word, not the first two letters: "Th" says less about who
 * this is than "TT" does, and two words is what almost every name here has.
 */
function initials(name) {
  const words = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return '?'
  if (words.length === 1) return words[0][0].toUpperCase()

  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/**
 * The same name always lands on the same tone.
 *
 * A sum of char codes, which is crude and exactly sufficient: this picks a
 * colour, so a collision costs two people in a group sharing one — not a bug,
 * just a missed opportunity.
 */
function toneFor(name) {
  const text = String(name ?? '')
  let total = 0

  for (let i = 0; i < text.length; i += 1) total += text.charCodeAt(i)

  return TONES[total % TONES.length]
}
