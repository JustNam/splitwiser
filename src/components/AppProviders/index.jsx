'use client'

import { ThemeProvider } from '@mui/material/styles'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import { AuthProvider } from '@/components/AuthProvider'
import { GroupDataProvider } from '@/components/GroupDataProvider'
import { ToastProvider } from '@/components/Toast'
import { theme } from '@/constants/theme'

/**
 * Every app-wide provider, in one client component — so layout.jsx can stay a
 * Server Component while these use React context, which is client-only.
 *
 * Order, outermost first: AppRouterCacheProvider (makes Emotion emit its CSS
 * during server render, so the first paint isn't unstyled) → ThemeProvider,
 * which needs that cache → AuthProvider → ToastProvider, innermost so anything
 * it renders can use the theme, and so a toast fired just before a redirect
 * outlives the screen that fired it.
 */
export function AppProviders({ children }) {
  return (
    <AppRouterCacheProvider options={{ key: 'mui' }}>
      <ThemeProvider theme={theme}>
        <AuthProvider>
          {/* Below AuthProvider because it needs to know who is signed in,
              and above everything else because it is what stops each screen
              downloading the same group again. */}
          <GroupDataProvider>
            <ToastProvider>{children}</ToastProvider>
          </GroupDataProvider>
        </AuthProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  )
}
