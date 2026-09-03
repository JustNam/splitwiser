'use client'

import { ThemeProvider } from '@mui/material/styles'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import { theme } from '@/constants/theme'

/**
 * Everything MUI needs, in one client component.
 *
 * Why this file exists at all: `layout.js` is a Server Component, and
 * ThemeProvider uses React context — which only works on the client. So we
 * park the providers here, mark this file 'use client', and let layout.js
 * stay a server component.
 *
 * AppRouterCacheProvider makes Emotion (MUI's styling engine) emit its CSS
 * during server rendering, so the first paint isn't unstyled.
 */
export function AppProviders({ children }) {
  return (
    <AppRouterCacheProvider options={{ key: 'mui' }}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </AppRouterCacheProvider>
  )
}
