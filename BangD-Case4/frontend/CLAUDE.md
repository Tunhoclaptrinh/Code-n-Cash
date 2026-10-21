# CLAUDE.md (frontend)

Frontend for Smart Contract Workflow. Read the root `CLAUDE.md` first; this file adds the frontend rules.

## Stack

Vite, React 19, TypeScript (strict), react-router-dom v7 (data router), TanStack Query v5, i18next + react-i18next,
CSS Modules with design tokens. Package manager: `pnpm`.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck
pnpm build        # must pass before every commit
```

Sign in with any seeded account (password `Passw0rd!`, see `src/shared/mock/users.ts`):
`owner@novaan.vn`, `legal@novaan.vn`, `finance@novaan.vn`, `admin@novaan.vn`, `supplier@phuminh.vn`.

## Structure

```
src/
  main.tsx, App.tsx, router.tsx     Providers and the route table (lazy default-export pages)
  i18n/index.ts                     Registers every locales/<lang>/<namespace>.json automatically
  locales/{vi,en}/<namespace>.json  One namespace per feature, plus `common`
  styles/                           tokens.css (design tokens) and global.css
  shared/
    ui/            Icon, SvgIcon and other presentational primitives
    layout/        AppShell (side navigation + top bar), navConfig
    auth/          Session context, RequireAuth, LoginPage
    api/           Types and thin async functions over the store (the future HTTP client boundary)
    mock/          In-memory store. The only place that holds demo data
    lib/format.ts  Locale-aware money, number, date and time formatting
  features/<feature>/
    pages/         Route components, one default export per file, named <Thing>Page.tsx
    components/    Components used by that feature only
    api/           Query and mutation functions for the feature (read/write `shared/mock/db` or `./mock`)
    mock/          Feature-specific seed data
    *.module.css   Styles, next to the component that uses them
```

Features: `contracts`, `signing`, `milestones`, `disputes`, `audit`.

## Rules

1. **English identifiers.** Components `PascalCase`, hooks `useThing`, files match their default export.
2. **No hard-coded UI text.** Use `useTranslation('<namespace>')` and add the key to **both** `locales/vi` and
   `locales/en`. Keys are nested, camelCase, grouped by screen (`contractList.table.columns.supplier`).
   Use interpolation and plurals (`{{count}}`), never string concatenation of translated fragments.
3. **Enums are English constants** (`AWAITING_SIGNATURE`, `HOLD`) and are translated at render time through a
   `status.<ENUM>` style key. Never store translated text in data.
4. **Data goes through `api/` functions + TanStack Query.** Pages never import `shared/mock` directly.
5. **Format through `shared/lib/format.ts`** (millions of VND with two decimals, localised dates).
6. **Styling.** CSS Modules and the tokens in `styles/tokens.css`. Do not hard-code colours that already have a token.
   The screens were designed on a 1920×1080 canvas; at that viewport each page must match the canvas exactly
   (same sizes, spacing, colours, type scale, copy). Below that width layouts may reflow, but never overflow the page.
7. **Accessibility.** Real `<button>`, `<a>`, `<label for>`, headings in order, `aria-label` on icon-only controls.
8. **No demo UI.** No "demo" or "mock" labels, role switchers, scenario buttons or presenter notes.
9. **Shell is shared.** Every authenticated page renders inside `<AppShell active=... breadcrumb=[...]>`; never copy
   the side navigation or top bar into a page.
10. Run `pnpm typecheck && pnpm build` before committing.

## Source designs

The A1-C3 canvas boards are the visual source of truth for the screens in `features/`:
A (contract intake and signing), B (milestone evidence, approval and decision), C (contract detail, dispute, activity log).
