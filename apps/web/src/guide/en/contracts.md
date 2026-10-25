# Contract list and details

Open **Contracts** or **My contracts**. Access follows your organization. Owners and buyer contract officers can see drafts; suppliers and approvers cannot see buyer drafts. System administrators do not access contract business records.

![Contract list tools](../../../public/guide/images/contracts.webp)

## Find and open a record

Search a contract ID or words in its name, then narrow by statistics, tabs or column filters. Click the name for a quick view and use the full-screen control to expand it. Open the contract's detail page for milestones and workflow actions.

![Quick view with full-screen control](../../../public/guide/images/contract-modal.webp)

## Read the overview

![CT0103: title, origin, activity, tabs, milestones and payment totals](../../../public/guide/images/contract-detail.webp)

The breadcrumb contains the ID and title. Status and origin tags distinguish official Data Pack, demo seed and app-created records. Demo records are not official answer labels.

Each milestone shows due date, required evidence, achieved/required approvals, current decision and the next action. The payment overview separates planned, eligible, penalized and transferred amounts, in million VND. Use the milestone's decision trace to understand a HOLD rather than assuming an attached file is enough.

## Explore tabs

The events tab shows event type, actor, time and origin. History connects status changes with evaluation runs. Signing shows the assigned order; participants identifies the buyer, supplier and approvers. The contract activity button opens a log filtered to this contract.

![Contract events](../../../public/guide/images/contract-detail-events.webp)

## Continue according to status

Drafts need preparation, signing positions and reviewed terms. Signing contracts wait for the assigned signer. Active milestones need evidence or approvals. HOLD requires addressing its specific reason. RELEASE and PENALTY allow finance to transfer to accounting. Rejected and transferred milestones are locked.

> A visible event is not automatically valid evidence. The engine also checks authority, status, duplication, disputes and policy. Access checks remain enforced when opening a URL directly.

See [Decision trace](/guide/decision), [New contracts and signing](/guide/signing) and [Table tools](/guide/tables).

## Signed contracts can still have blocked payments

![CT0084: 1 — a missing milestone condition, independent of signature completion](../../../public/guide/images/review-signed-hold.png)

**CT0084** has a contract-signed event, but **MS0337 — Acceptance** lacks `ACCEPTANCE`. Two approvals do not replace the acceptance evidence, so that milestone is **HOLD**. The warning names the milestone and missing action. Do not mark every payment complete just because the signing view says 3/3.

**Contract owner** is a role; **Project director** is a job title. A signer may also approve payments where the policy allows it, subject to the separate conditions and quorum of each milestone. **Role/organisation: Organiser data** alongside **Demo identity** distinguishes Data Pack functions from demo personal names/emails.
