import { createTheme } from '@mui/material/styles'

/**
 * MUI theme = the design tokens, translated into the shape MUI expects.
 *
 * Rule of thumb for this project:
 *   - MUI is used for BEHAVIOUR (Dialog, Drawer, Checkbox, Select, TextField,
 *     Snackbar) — the things that are genuinely annoying to build by hand.
 *   - Our own SCSS-module components are used for the LOOK (Button, Badge,
 *     Row, TopBar). Cheaper than fighting MUI's opinions.
 *
 * Both read the same values, so they stay consistent.
 *
 * Hex values are hardcoded here rather than `var(--flamingo-600)` because MUI
 * needs to do colour math on them (hover/disabled shades), and it can't do
 * math on a CSS variable it can't resolve at build time.
 */
export const theme = createTheme({
  palette: {
    primary: {
      main: '#da2a52', // --flamingo-600
      dark: '#b32656', // --flamingo-700
      light: '#f384a7', // --flamingo-400
      contrastText: '#ffffff',
    },
    error: { main: '#dc0034' }, // --semantic-red
    success: { main: '#538e3b' }, // --semantic-green-500
    text: {
      primary: '#231f20', // --neutral-900
      secondary: '#716a68', // --charcoal-500
      disabled: '#cccccc', // --neutral-400
    },
    divider: '#e5e5e5', // --border-default
    background: {
      default: '#ffffff', // --surface-page
      paper: '#ffffff', // --surface-card
    },
  },

  shape: {
    borderRadius: 4, // --radius, brand-wide constant
  },

  typography: {
    // Matches --font-sans in _tokens.scss. --font-lato is injected by next/font.
    fontFamily:
      'var(--font-lato), -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightBold: 700,
    // MUI has no "black" slot; 900 is applied per-component where needed.
  },

  components: {
    // Every tappable target is >= 44px in the design (thumb-sized).
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: 'none', minHeight: 44 },
      },
    },
  },
})
