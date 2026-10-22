# Web application

Read the root CLAUDE.md and docs/08_HUONG_DAN_PHAT_TRIEN_UI.md. Use Ant Design 6 and `@codecash/ui`, keep React 19/Router 7/TanStack Query/i18next.

All feature reads/writes go through API modules and the shared authenticated client. Keep query keys scoped by actor. Do not import fixture stores or calculate decisions in pages. Business handlers and initial fixture data live in apps/api/src/workflow.

Base: `packages/ui` mirrors UniFlow's base; never edit it to suit a page. List pages use `PageContainer` + `DataTable` with statistics, tabs, `filters` (`useFilters`), search, `onRefresh`, pagination (`usePagination` or `useResource`), export, `customActions` (IconButton + Dropdown; it replaces the default buttons), `DetailModal`, `FormModal`, `ConfirmModal`.

Layout: `AppLayout` is the persistent route layout (UniFlow MainLayout structure); every page wraps its body in `AppPage` (active nav key + breadcrumb) and usually `PageContainer`. Shared building blocks live in `src/shared/ui` (`PageState`, `Panel`, `ToneTag`, `ExpandableModal`, `ImportPreviewModal`, `columnSearch`) and `packages/ui`. Use Ant Design `Button` props for meaning (`type`, `danger`, `color` + `variant`); do not reintroduce wrapper adapters. Colours come from `packages/ui/src/theme.ts` and the tokens in `packages/ui/src/styles/tokens.css`; statistic pills use the UniFlow pastel palette (rgba background + solid value colour).

Retain Vietnamese/English resources. Add public shared components to packages/ui; keep feature-specific document viewers/signature positioning components local. Only layout and specialized document visuals need feature CSS.

Run from root: `pnpm dev`, `pnpm check` (typecheck, lint, format:check, build, test), `pnpm test:browser` with the dev servers running.
