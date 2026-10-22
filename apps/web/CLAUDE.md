# Web application

Read the root CLAUDE.md. Use Ant Design 6 and `@codecash/ui`, keep React 19/Router 7/TanStack Query/i18next.

All feature reads/writes go through API modules and the shared authenticated client. Keep query keys scoped by actor. Do not import fixture stores or calculate decisions in pages. Business handlers and initial fixture data live in apps/api/src/workflow.

Retain Vietnamese/English resources. Add public shared components to packages/ui; keep feature-specific document viewers/signature positioning components local. Only layout and specialized document visuals need feature CSS.

Run from root: `pnpm dev`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`.
