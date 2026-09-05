'use client'

import { ThemeProvider } from '@mui/material/styles'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import { AuthProvider } from '@/components/AuthProvider'
import { theme } from '@/constants/theme'

/**
 * Every app-wide provider, in one client component — so layout.jsx can stay a
 * Server Component while these use React context, which is client-only.
 *
 * Order, outermost first: AppRouterCacheProvider (makes Emotion emit its CSS
 * during server render, so the first paint isn't unstyled) → ThemeProvider,
 * which needs that cache → AuthProvider, innermost so anything it renders can
 * use the theme.
 */
export function AppProviders({ children }) {
  return (
    <AppRouterCacheProvider options={{ key: 'mui' }}>
      <ThemeProvider theme={theme}>
        <AuthProvider>{children}</AuthProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  )
}
