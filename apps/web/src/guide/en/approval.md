# Approve a milestone

Owners, finance approvers and secondary approvers act according to the contract's approval policy. An account with another role cannot substitute for a required approver.

![Approval roles, predicted result and approve action](../../../public/guide/images/approval.webp)

## Review before choosing

1. Verify contract, milestone, planned amount and current status.
2. Read valid evidence, including issuer and time.
3. Check achieved/required roles. CT0103 needs finance and owner, rather than any two people.
4. Read the predicted decision, penalty and payable amount.
5. Open the trace when you need the rules or lateness calculation.

## Three actions

| Action                   | Effect                                          |
| ------------------------ | ----------------------------------------------- |
| Approve                  | Adds an APPROVAL for your role and re-evaluates |
| Request more information | Adds a note without granting approval           |
| Reject                   | Adds REJECTION and locks the REJECT result      |

Notes are required for rejection and requests for information. Read the confirmation before submitting; the current flow does not undo a rejection.

![Approval confirmation](../../../public/guide/images/approval-confirm.webp)

## Try CT0103 milestone 2

Sign in as `finance@novaan.vn`. The owner has approved, finance is pending. Preview shows PENALTY: 740.00 planned, 2.22 penalty, 737.78 payable, all in million VND. Approve and confirm to open the resulting decision with reason `LATE_COMPLETION`.

Accounting transfer is a separate action on the decision page. Approval records an authorized decision; it does not execute a bank payment.

## Understand remaining conditions

Policies may require owner only, owner plus secondary, or finance plus owner. One approval in a two-role policy leaves HOLD. Even a complete quorum can leave HOLD if evidence is missing or a dispute remains open.

> Preview uses the current state. The API checks again when you submit. If another person has just acted, refresh and review the updated result before retrying.

If no approval action appears, verify organization, required role and whether you have already approved. Controllers and system administrators cannot approve business payments. See [Roles](/guide/roles) and [Decision trace](/guide/decision).
