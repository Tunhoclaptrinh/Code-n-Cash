# Activity and history

Activity connects user actions, business events and status changes. Records are append-only through the application. Business users see their scope; controllers and auditors can review across organizations.

![Activity tools and source filtering](../../../public/guide/images/activity.webp)

## Follow a contract

1. Open a contract, select the **☰** button beside **Guide**, then its contract activity. The log is filtered to that contract, such as CT0103.
2. Each row shows the time, the activity (category icon, description, who did it and their role; a **You** tag when it was you), contract · milestone, evidence id and origin.
3. Narrow results using tabs, **Everyone / Mine**, search, filters or column filters. Filters live in the page address, so a link opens the same rows.
4. Reconcile: select the contract, milestone or evidence id to open that place (the evidence id opens the milestone's decision with that event highlighted); the download button beside it fetches the signed file. Only links you may open are shown. Export CSV/JSON for checks outside the app.

## Distinguish record types

| Information      | Question answered                                       |
| ---------------- | ------------------------------------------------------- |
| User action      | Who submitted, approved, signed or reviewed?            |
| Business event   | Which evidence or approval was recorded by which party? |
| State transition | What changed, and under which evaluation run?           |
| Origin           | Official data, demo seed or app-created record?         |

One action can create several rows. Approval may add an APPROVAL event, run the engine and create a status transition. The number of log rows is not the number of payments.

## Reconcile CT0103 milestone 2

After finance approval, filter CT0103. Find the finance actor and new approval, then the transition from awaiting approval to payment after deduction. Compare the evaluation run and decision trace: on fresh sample data it is PENALTY, 2.22 million penalty and 737.78 million payable.

Simply reading a page does not create a payment event. If a record is missing, check contract, source and activity-type filters, then refresh.

## Export and preserve

Export respects the current query and access scope. Select relevant columns while retaining contract and milestone IDs. “All” exports all matching rows, not inaccessible organizations.

> Viewing a log entry does not prove the database was untouched. Use [Integrity](/guide/integrity) to compare hashes, with an independent anchor when whole-history replacement must be detectable.

Do not overwrite history through administration or direct imports. Business corrections require authorized new actions, preserving the original record and its resolution.
