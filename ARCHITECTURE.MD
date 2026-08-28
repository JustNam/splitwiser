# Project Architecture

## Overview


---

## Main Technologies

- **Next.js 16** (App Router, React 19)
- **SCSS Modules** and **TailwindCSS** (utility-first, themeable)
- **MUI elements** 
- **Supabase** (authentication, database with SSR support)
- **Axios** (API requests, interceptors)

---

## Directory Structure & Naming Conventions

```
src/
  app/           # Next.js App Router (pages, api routes)
  api/           # API service classes (e.g., <feature>.js)
  adapters/      # Data transformation adapters (snake_case ↔ camelCase)
  components/    # Shared React components (e.g., AuthProvider.jsx)
  hooks/         # Custom React hooks (e.g., useAuth.js)
  services/      # App-wide services and external library configs (e.g., notification.service.js, supabase/)
  constants/     # Enums, static values, theme
  styles/        # Global SCSS, Tailwind config
```

**Best Practices:**
- **Folders**: Use lowercase and dashes for folders (`product-info/`, `order-list/`).
- **Files**: Use camelCase for files, PascalCase for React components (`ProductInfo.jsx`).
- **SCSS Modules**: Name as `style.module.scss` in each component folder.
- **Enums**: Prefix with `E` (e.g., `EOrderStatus`).
- **Constants**: Use uppercase with underscores (`API_URL`).

---

## Example: Feature Structure

```
src/app/<feature>/
  page.jsx
  [id]/
    page.jsx
  components/
    product-info/
      index.jsx
      style.module.scss
```

- **Each feature** lives under its own route segment in `app/`, with local components colocated.
- **Component folders** contain `index.jsx` and `style.module.scss`.

---

## Example: Component

```jsx
// src/components/Button/index.jsx
import clsx from 'clsx'
import { forwardRef } from 'react'
import Style from './style.module.scss'

export const Button = forwardRef(({ className, ...props }, ref) => (
  <button ref={ref} className={clsx(Style.button, className)} {...props} />
))
```

- **Naming**: Use PascalCase for components, folder matches component name.
- **Styling**: Use SCSS modules for encapsulation.

---


### Providers & Context

**Global Infrastructure Providers** (`src/components/`): For app-wide concerns that need to wrap the entire application tree:
- `AuthProvider.jsx` - Authentication state and methods

**Feature-Scoped Providers**: For state that's specific to one feature:
- Use React Context for feature-local state that doesn't require reactive patterns
- Place alongside the feature's route segment in `app/`

**Provider Usage Pattern**:
```jsx
// Global layout composition
<AuthProvider>
  {children}
</AuthProvider>
```

---

## Authentication

Uses **Supabase Authentication** with SSR and secure cookie-based session management.

**Key Features:**
- Server-side session management with `@supabase/ssr`
- Cookie-based authentication (HttpOnly, secure)
- Route protection via `getUser()` check in each protected layout/page (Server Component), redirecting to login if unauthenticated

**Main Components:**
- `src/services/supabase/` - Server and client Supabase configurations
- `src/hooks/useAuth.js` - Authentication hook
- `src/app/api/auth/` - Authentication API endpoints

---

## Services

- **App-wide utilities** in `src/services/` for reusable business logic and external library configuration.
- **Static methods** on classes, kebab-case naming with `.service.js` suffix.
- **Feature-local utilities** colocated with the feature's route segment in `app/`.

---

## API/Data Fetching

### Client-Side API Services (`src/api/`)
- **API service classes** (e.g., `<Feature>Api`, `Public<Feature>Api`)
- **Frontend HTTP clients** that call external APIs (Supabase edge functions)
- Use `adminAxios`/`publicAxios` with auth interceptors
- **Adapters** automatically convert between database snake_case and frontend camelCase

### Server-Side API Routes (`src/app/api/`)
- **Next.js API endpoints** that your app serves (App Router convention: `app/api/*` → HTTP endpoints)
- **Server-side logic** for auth, session management, and local processing
- **Auth routes** (`auth/signin`, `auth/signup`) handle Supabase cookies and server validation

```js
// src/api/<feature>.js
export class FeatureApi {
  static async list() {
    const response = await axios.get('/api/<feature>')
    const frontendData = featureAdapter.listToFrontend(response.data.data || response.data)
    return { data: frontendData }
  }

  static async create(data) {
    const dbData = featureAdapter.createRequestToDatabase(data)
    const response = await axios.post('/api/<feature>', dbData)
    const responseData = response.data.data || response.data
    const frontendData = featureAdapter.toFrontend(responseData)
    return { data: frontendData }
  }
}
```

---

## Styling

- **SCSS modules** for component styles (`style.module.scss`).
- **TailwindCSS** for utility classes.
- **Variables** in `src/styles/_variables.scss` for theme consistency.
- **Naming**: Use BEM or utility classes, avoid global selectors.

---

## Example: Naming Conventions

| Entity         | Convention         | Example                        |
|----------------|-------------------|--------------------------------|
| Component      | PascalCase        | `ProductInfo.jsx`              |
| Hook           | camelCase, use*   | `useAuth.js`                   |
| Enum           | Prefix with E     | `EOrderStatus`                 |
| Constant       | UPPER_SNAKE_CASE  | `API_URL`                      |
| Service        | kebab-case        | `editor-conversion.service.js` |
| SCSS Module    | kebab-case        | `style.module.scss`            |
| Folder         | kebab-case        | `product-info/`                |

---