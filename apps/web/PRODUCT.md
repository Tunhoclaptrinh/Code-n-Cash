# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Buyer-side operators who run contract milestones to payment, at an office desktop: contract owner, finance approver, secondary approver and the legal reviewer who submits the buyer's evidence (acceptance, sign-off).
- Supplier staff who sign contracts and submit delivery, invoice, go-live and warranty evidence.
- Controllers (`ADMIN_AUDITOR`) who handle evidence exceptions with two-person approval, auditors who only read, and the system administrator who manages accounts and configuration.
- Near-term priority: the Case 4 judging panel watching the demo in docs/KICH_BAN_DEMO.md. Screens on that path are refined first.

## Product Purpose

CodeCash runs contracts with conditional payments end to end: digitise the terms, sign in order, submit evidence per milestone, approve, dispute, decide payment and keep an auditable trail. Success means every payment decision is correct, explained and traceable, and that the person on each screen knows what to do next.

## Positioning

- Every payment decision is explained down to the rule, the evidence that met it and what is still missing.
- When the grounds are incomplete the milestone is held; the system never releases money on doubt.
- The browser never decides: the API runs the business handlers and the Python engine computes decisions and money with exact decimals.
- The audit log is a hash chain with sealed decisions; exceptions need two controllers; signatures are bound to the document content.

## Operating Context

- Workflow: upload and digitise a contract, sign in the configured order, submit evidence per milestone, approve by role, open and resolve disputes, review the engine's decision, transfer payment, audit.
- Business evidence comes from the organiser's Data Pack (100 contracts, 405 milestones, 1,134 events) plus marked seed data (demo contracts CT0101 to CT0104, accounts). Documents are PDFs shown beside the decision.
- Business time is Vietnam time (UTC+7); due dates, grace periods and late penalties drive what is urgent.

## Capabilities and Constraints

- Vietnamese is the primary language, English is complete; all user-facing text lives in locale resources.
- Light and dark themes. Desktop first; the layout must still work below 992 px where the sidebar becomes a drawer.
- Ant Design 6 with the UniFlow-derived base in `packages/ui`. The UniFlow layout, structure and behaviour stay; its visual details may be refined when a review shows a real defect (see docs/08_HUONG_DAN_PHAT_TRIEN_UI.md).
- Workflow screens show business words, never raw codes; graded codes stay reachable in technical details.
- Money is never shown from floating-point values.

## Evidence on Hand

- Official Data Pack and brief: `BangD-Case4/` (preserve its labels; do not infer accuracy on all 405 milestones from 20 samples).
- Business specification: docs/NGHIEP_VU.md; demo script: docs/KICH_BAN_DEMO.md.
- There are no real customers, testimonials or production metrics; do not invent them.

## Product Principles

1. Payment safety first: uncertainty reads as a hold, never as a release.
2. Show why: decision, rule, evidence and missing conditions are always one step away.
3. One clear next action per screen for the signed-in role.
4. Nobody edits a decision, amount or audit entry; people act through new events or two-person exceptions.

## Accessibility & Inclusion

WCAG 2.2 AA: text contrast at least 4.5:1 (3:1 for large text), full keyboard reach with visible focus, labelled icon buttons, in both themes.
