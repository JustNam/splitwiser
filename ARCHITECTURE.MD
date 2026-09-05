# Project Architecture

## Overview

---

## Main Technologies

- **Next.js 16** (App Router, React 19)
- **SCSS Modules** and **TailwindCSS** (utility-first, themeable)
- **MUI elements**
- **Supabase** (authentication, database, edge functions)

---

## Directory Structure & Naming Conventions

```
src/
  app/           # Next.js App Router (pages)
  api/           # API service classes (e.g., <feature>.js)
  components/    # Shared React components (e.g., AuthProvider/)
  hooks/         # Custom React hooks (e.g., useAuth.js)
  lib/           # External library configurations (e.g., supabase/)
  services/      # Pure helpers with no I/O (e.g., money.service.js)
  constants/     # Static values, theme
  styles/        # Global SCSS, Tailwind config
```

**Best Practices:**

- **Folders**: Use lowercase and dashes for folders (`product-info/`, `order-list/`).
- **Files**: Use camelCase for files, PascalCase for React components (`ProductInfo.jsx`).
- **SCSS Modules**: Name as `style.module.scss` in each component folder;
  route-level styles are `page.module.scss` / `layout.module.scss`, next to the
  file they style.
- **Constants**: Use uppercase with underscores (`API_URL`).

**`api/` vs `services/`**: `api/` talks to the outside world and its methods are
`async`. `services/` is pure functions — same input, same output, no network, no
React. If it can fail, it belongs in `api/`.

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
import clsx from "clsx";
import { forwardRef } from "react";
import Style from "./style.module.scss";

export const Button = forwardRef(({ className, ...props }, ref) => (
  <button ref={ref} className={clsx(Style.button, className)} {...props} />
));
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
<AuthProvider>{children}</AuthProvider>
```

---

## Authentication

Uses **Supabase Authentication** (`supabase-js`) client-side. Acceptable for MVP;

**Main Components:**

- `src/lib/supabase/` - Supabase client configuration
- Auth state via `onAuthStateChange`/`getSession()`, checked per protected page/layout

---

## API/Data Fetching

### Client-Side API Services (`src/api/`)

- **API service classes** (e.g., `<Feature>Api`) call Supabase directly (tables or edge functions)

```js
// src/api/<feature>.js
export class FeatureApi {
  static async list() {
    const { data, error } = await supabase.from("<feature>").select("*");
    if (error) throw error;
    return { data };
  }

  static async create(data) {
    const { data: created, error } = await supabase
      .from("<feature>")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return { data: created };
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

| Entity      | Convention       | Example             |
| ----------- | ---------------- | ------------------- |
| Component   | PascalCase       | `ProductInfo.jsx`   |
| Hook        | camelCase, use\* | `useAuth.js`        |
| Constant    | UPPER_SNAKE_CASE | `API_URL`           |
| SCSS Module | kebab-case       | `style.module.scss` |
| Folder      | kebab-case       | `product-info/`     |

---
