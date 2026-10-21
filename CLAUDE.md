# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project

Smart Contract Workflow. Festival Chuyển đổi số 2026, Bảng D, Case 4 (preliminary round, Blueprint). A gate that checks
the payment conditions of every contract milestone and returns one decision per milestone:
`RELEASE`, `HOLD`, `REJECT` or `PENALTY`, with amount, reason and an audit trail.

## Monorepo layout

```
frontend/                                     React web app (see frontend/CLAUDE.md)
BangD-Case4/
  DeThi2026_BangD_SmartContractWorkflow.pdf   Official brief (source of truth)
  DataPack-CASE4_SmartContractWorkflow/       Official Data Pack
docs/                                         Team documents, written in Vietnamese
  04_DAC_TA_NGHIEP_VU.md                      Business specification, the authoritative rules
tools/kiem_chung_nghiep_vu.py                 Python reference check of the specification against the Data Pack
tests/test_dac_ta_nghiep_vu.py                unittest suite for the specification
```

Run the Python checks from the repository root:

```bash
python3 tools/kiem_chung_nghiep_vu.py --check
python3 -m unittest discover -s tests -v
```

## Language rules

- **Code is English.** Identifiers, comments, commit messages, branch names, file names, test names and this file.
- **User-facing text is never hard-coded.** It lives in i18next resource files (`vi` and `en`).
- **`docs/` stays Vietnamese**; do not translate or rename existing documents unless asked.
- Business terms keep their canonical English value in code (`RELEASE`, `HOLD`, `REJECT`, `PENALTY`,
  `APPROVAL_QUORUM_NOT_MET`, ...) and are translated only when rendered.

## Git workflow

- Never commit to `main`. Work on a branch named `<type>/<kebab-case-summary>` where type is one of
  `feat`, `fix`, `docs`, `refactor`, `test`, `chore`. Example: `feat/frontend-contract-workflow-screens`.
- Commit messages follow Conventional Commits: `feat(frontend): add contract list screen`.
  Imperative mood, subject line at most 72 characters, body only when the reason is not obvious.
- **No AI attribution.** Never add `Co-Authored-By`, "Generated with Claude Code" or any similar trailer or footer to
  commits, pull requests, issues or code comments. Commits are authored by the human configured in git.
- Do not push, force-push, open pull requests or merge unless the user asks for that specific action.
- Keep one logical change per commit; do not mix a refactor with a feature.

## Working agreements

- The business specification in `docs/04_DAC_TA_NGHIEP_VU.md` wins over the UI. If a screen disagrees with it, report the
  disagreement instead of silently changing either side.
- Money is expressed in millions of VND with two decimals. Never use floating-point arithmetic for decisions in
  engine code; the frontend only formats values it receives.
- Demo data is allowed, but it lives only in the data layer (`frontend/src/shared/mock`, `frontend/src/features/*/mock`).
  The UI never shows labels such as "demo", "mock" or "sample data", and has no scenario buttons or role switchers.
- Ask before deleting files, rewriting history or changing anything outside the task's scope.
