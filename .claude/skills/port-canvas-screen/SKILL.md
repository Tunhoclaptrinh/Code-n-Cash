---
name: port-canvas-screen
description: Port a screen from a design canvas board (static HTML with inline styles) into a pixel-faithful React page in the frontend app. Use when asked to implement, build or port a screen such as A1-C3.
---

# Port a canvas screen to React

Goal: the React page, rendered at 1920×1080, is visually identical to the canvas board, with real data, i18next text
and English code.

## Steps

1. **Read the board** end to end. Note every size, gap, colour, font size and weight, border, radius and the exact copy.
2. **Check what already exists**: `src/shared/layout/AppShell` (side navigation, top bar), `src/shared/ui/Icon`,
   `src/styles/tokens.css`, `src/shared/lib/format.ts`. Never recreate the shell inside a page.
3. **Model the data** the screen shows. Put types in the feature, seed data in `features/<feature>/mock`, reads and
   writes in `features/<feature>/api`, and consume them with TanStack Query. Rows, counts and labels are derived
   from data, not typed into JSX.
4. **Write the page** as `features/<feature>/pages/<Thing>Page.tsx` (default export) wrapped in
   `<AppShell active=... breadcrumb=[...]>`, with a `<Thing>Page.module.css` next to it.
   Translate inline styles to CSS Modules one-to-one: keep the pixel values, replace repeated colours by tokens.
5. **Extract text** to `locales/vi/<namespace>.json` (original Vietnamese copy) and `locales/en/<namespace>.json`
   (natural English). See the `add-i18n-strings` skill.
6. **Wire interactions**: links go to real routes from `router.tsx`; form controls are controlled; buttons call
   mutations that update the in-memory store and invalidate the relevant queries.
7. **Drop demo-only content** from the board: presenter notes, "illustrative data" disclaimers, scenario or role
   switchers. Everything else stays.
8. **Verify visually.** Serve the board (`python -m http.server` in the folder holding the `.dc.html` files and
   `support.js`), open it and the React page at 1920×1080, screenshot both and compare. Fix every difference in
   spacing, size, colour or copy before reporting done.
9. Run `pnpm typecheck && pnpm build`.

## Do not

- Hard-code user-facing strings, colours that have tokens, or `px` positions that only work at one width
  (use flex or grid as the board does).
- Import `shared/mock` from a page or component.
- Edit files outside your feature folder, except adding new namespace files under `locales/`.
