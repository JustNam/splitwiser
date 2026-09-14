import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

/**
 * The globals a browser gives us. Needed only because of `no-undef` below:
 * without a list, the rule reports `window` and `setTimeout` as typos.
 */
const browserGlobals = {
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  crypto: 'readonly',
  document: 'readonly',
  fetch: 'readonly',
  Intl: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  process: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  sessionStorage: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  window: 'readonly',
}

const eslintConfig = defineConfig([
  ...nextVitals,

  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: { globals: browserGlobals },
    rules: {
      /**
       * Off by default here, because the Next preset expects TypeScript to
       * catch this. This project is JavaScript, so nothing was:
       * `SPLIT_EXACT` was used in new-session-form and never imported, and
       * the first anyone knew was a ReferenceError on tapping "Someone paid
       * for something else". Lint had passed, and so had the build.
       */
      'no-undef': 'error',
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
])

export default eslintConfig
