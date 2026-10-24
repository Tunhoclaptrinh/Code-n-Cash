# Web application

Read the root CLAUDE.md and docs/08_HUONG_DAN_PHAT_TRIEN_UI.md. Use Ant Design 6 and `@codecash/ui`, keep React 19/Router 7/TanStack Query/i18next.

All feature reads/writes go through API modules and the shared authenticated client. Keep query keys scoped by actor. Do not import fixture stores or calculate decisions in pages. Business handlers, the Data Pack import and seed data live in apps/api/src/domain; workflow calls go through `src/shared/api/domain.ts`. Show where a record comes from with `OriginTag` (`src/shared/ui/DomainTags.tsx`); workflow labels live in the `domain` namespace.

Base: `packages/ui` mirrors UniFlow's base; never edit it to suit a page. List pages use `PageContainer` + `DataTable` with statistics, tabs, `filters`, search, `onRefresh`, pagination and export driven by `useListQuery` (`src/shared/lib/useListQuery.ts`: one query for page, search, filters, column filters and sort; `useResource` for CRUD resources), `customActions` (`TableRowActions`: compact icon buttons with translated tooltip/aria-label and an overflow menu on one line; toolbar/form buttons retain visible translated text; it replaces the default buttons), `DetailModal`, `FormModal`, `ConfirmModal`.

Layout: `AppLayout` is the persistent route layout (UniFlow MainLayout structure); every page wraps its body in `AppPage` (active nav key + breadcrumb; the last crumb is the page title, `tags` and `extra` sit in the same row) and usually a `PageContainer` without `title`/`subtitle`/`tooltip`. Important notes are an info `Alert`; tabs that switch lists go inside the `DataTable`. Shared building blocks live in `src/shared/ui` (`PageState`, `Panel`, `ToneTag`, `ExpandableModal`, `ImportPreviewModal`, `columnSearch`) and `packages/ui`. Use Ant Design `Button` props for meaning (`type`, `danger`, `color` + `variant`); do not reintroduce wrapper adapters. Colours come from `packages/ui/src/theme.ts` and the tokens in `packages/ui/src/styles/tokens.css`; statistic pills use the UniFlow pastel palette (rgba background + solid value colour).

Retain Vietnamese/English resources. Add public shared components to packages/ui; keep feature-specific document viewers/signature positioning components local. Only layout and specialized document visuals need feature CSS.

Run from root: `pnpm dev`, `pnpm check` (typecheck, lint, format:check, build, test), `pnpm test:browser` with the dev servers running.
