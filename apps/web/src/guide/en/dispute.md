# Open and resolve disputes

An open dispute is the highest-priority blocker and produces HOLD. Buyer and supplier users with permission can open a dispute; only the buyer side can close it in the current workflow.

![Dispute record, resolution option, note and confirmation](../../../public/guide/images/dispute.webp)

## Review the case

Open the task or the milestone's dispute action. Check dispute ID, originating party, time, explanation and relevant evidence. Work on the actual open case for this milestone; a note elsewhere does not close it.

To open a new dispute, describe the issue and its supporting document or clause, then confirm. The engine re-evaluates to HOLD. Opening a dispute does not validate the claim or change the penalty amount.

## Resolve or request information

1. Sign in as the buyer's owner or contract officer.
2. Read the proposed resolution and predicted post-resolution outcome.
3. Choose the resolution and enter a concrete note recording the agreement or supporting minutes.
4. Confirm and wait for evaluation. The closing event references the original dispute.
5. If the case is not ready, request more information rather than closing it just to progress payment.

## Try CT0019 milestone 3

Use `owner@novaan.vn`. Open its dispute-resolution task and close EV00204 with a note about the agreed supplementary acceptance record. On fresh data the outcome becomes RELEASE, 591.00 million payable. Inspect the new event and history.

![Decision after CT0019 resolution](../../../public/guide/images/dispute-resolved.webp)

CT0014 milestone 2 is another example: a supplier opened it but the buyer closes it. Try the supplier account to see that viewing/opening and closing have different permissions.

## If HOLD remains

Read the new [Decision trace](/guide/decision). Missing evidence, approval roles or an unauthorized event may remain. Resolving a dispute removes only that blocker. Rejected and transferred milestones have separate locks.

> Open and close actions append new events. The original case stays in history; it is not edited or deleted. Use [Activity](/guide/activity) to reconcile who acted and why.
