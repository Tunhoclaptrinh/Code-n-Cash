# Smart Contract Workflow, frontend

Web client for the contract milestone payment gate. It covers contract intake and signing (A), milestone evidence,
approval and decision (B), and contract detail, dispute and activity log (C).

## Requirements

- Node.js 22 or newer
- pnpm 10 or newer

## Run

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck
pnpm build
```

## Accounts

All seeded accounts use the password `Passw0rd!`.

| Email | Role | Lands on |
| --- | --- | --- |
| `owner@novaan.vn` | Contract owner | Contracts |
| `legal@novaan.vn` | Legal / Contract BA | Contracts |
| `finance@novaan.vn` | Finance approver | Awaiting my approval |
| `admin@novaan.vn` | Admin / Auditor | Activity log |
| `supplier@phuminh.vn` | Supplier | My tasks |

## Routes

| Path | Screen |
| --- | --- |
| `/login` | Sign in |
| `/contracts` | A1 Contract list |
| `/contracts/new` | A2 Upload contract |
| `/contracts/:contractId` | C1 Contract detail and milestones |
| `/contracts/:contractId/sign-positions` | A3 Signature positions |
| `/contracts/:contractId/digitize` | A4 Digitised clauses review |
| `/contracts/:contractId/signing` | A5 Signing sequence |
| `/contracts/:contractId/signing/:stepNo` | A6 Choose signing method and sign |
| `/verify/:contractId?` | A7 Signature verification |
| `/tasks` | B1 Task inbox |
| `/submissions/:contractId?/:milestoneNo?` | B2 Submit evidence |
| `/approvals/:contractId?/:milestoneNo?` | B3 Payment approval |
| `/contracts/:contractId/milestones/:milestoneNo/decision` | B4 Milestone decision |
| `/contracts/:contractId/milestones/:milestoneNo/dispute` | C2 Dispute |
| `/activity-log` | C3 Activity log |

## Languages

Vietnamese (default for Vietnamese browsers) and English. The language is switched from the account menu in the top
bar and remembered in `localStorage`. Text lives in `src/locales/<language>/<namespace>.json`.

## Data

There is no backend yet. `src/shared/mock` and `src/features/*/mock` hold in-memory seed data, and every read or write
goes through an `api/` function that simulates latency. Replacing those functions with HTTP calls is the only change
needed to connect a real API. See `CLAUDE.md` for the full set of conventions.
