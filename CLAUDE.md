# CodeCash project guidance

Smart Contract Workflow, Case 4. The official brief and `docs/04_DAC_TA_NGHIEP_VU.md` are the business sources of truth.

## Workspace

- `apps/web`: React 19, Router 7, Ant Design 6, TanStack Query, i18next.
- `apps/api`: NestJS API, resource CRUD, authentication, scoped workflow actions and persistence. `src/domain` imports the Data Pack as tables, adds marked seed data (origin `DATA_PACK` | `SEED` | `APP`), and re-runs the Python engine after every workflow action.
- `apps/engine`: Python adapter around the tested Data Pack evaluator. The evaluator is the `codecash_engine` package (one module per stage); `tools/kiem_chung_nghiep_vu.py` is the spec check command on top of it.
- `packages/ui`: reusable components migrated from UniFlow and adapted for CodeCash.
- `packages/contracts`: public types and resource definitions.
- `packages/api-client`: typed HTTP/resource client.
- `tools/kiem_chung_nghiep_vu.py` and `tests/`: keep the specification checks intact.

## Rules

- Code identifiers/comments are English. User-facing strings live in Vietnamese/English locale resources. Team docs remain Vietnamese.
- Use Ant Design and shared components. The earlier exact canvas styling requirement is superseded by the user's Ant Design migration request; retain workflow semantics and routes.
- `packages/ui` base components, hooks and utils are ported from UniFlow: do not change their behaviour or look. Extend through props, CSS tokens or new components in `apps/web/src/shared/ui`. List pages follow the UniFlow base pattern in docs/08_HUONG_DAN_PHAT_TRIEN_UI.md.
- The browser does not own business decisions. Keep business handlers in the API and Data Pack calculations in Python. Never use floats for Data Pack money.
- Derive identity and scope from the authenticated actor. Never trust a client-supplied role, actor ID or tenant header.
- Audit and decisions are not generic editable CRUD. Add explicit domain actions with permission checks.
- The audit log is a hash chain sealed in `Repository.transact`; write audit entries only through it, never edit or delete them.
- Keep SoD-1: the controller (`ADMIN_AUDITOR`) handles exceptions, `SYSTEM_ADMIN` manages accounts and configuration, `AUDITOR` only reads.
- Preserve the official Data Pack and sample labels. Do not infer accuracy on all 405 milestones from 20 samples.
- Do not copy credentials or .env files from the reference repository.
- Work on a feature branch. Do not commit to main or push/merge without user instructions.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` and relevant smoke tests before reporting completion.
