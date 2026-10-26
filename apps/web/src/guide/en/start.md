# Getting started and signing in

The sample kit at the top provides PDFs for 1–4 signers. Expand **Instructions and signer accounts** for the supplier and each signer's email; the details start collapsed so the guide stays readable on a phone.

CodeCash tracks contract milestones, evidence and payment eligibility. Choose the account responsible for the next action; the engine evaluates the result and assigns the next task.

## Choose a demo account

![Sign in: 1 — demo accounts; 2 — email form; 3 — language](../../../public/guide/images/login.webp)

1. Open **Sign in** and select **Demo accounts** at the top right.
2. Pick a featured account. The menu shows the person, organization and role; selection signs in immediately.
3. Expand **All organizations in the Data Pack** to try another buyer or supplier.
4. For password sign-in, use the credentials supplied by your operator. The local seed default is `Passw0rd!`; deployed environments can override it.

![Featured demo users and all Data Pack organizations](../../../public/guide/images/login-demo-menu.webp)

The demo selector stays on the sign-in page. To change roles, sign out from the account menu and choose another user. If the selector fails to load, check that the API is running.

## First visit and help

![First visit: select language, theme and Start](../../../public/guide/images/welcome.webp)

Select a language and theme, then start. Header controls let you change these preferences later. The question-mark button opens this guide even before sign-in. A page's **Guide** button opens its own instructions in a drawer. After signing in, choose **Open guide page** to read the full version.

![Header: help, language, theme and notifications](../../../public/guide/images/header-tips.webp)

Click any guide screenshot to zoom; close the preview to continue reading. Screenshots use Vietnamese labels, light theme and fresh demo data captured on 23 October 2026.

## Try a complete handoff

Sign in as `finance@novaan.vn`, open CT0103 milestone 2 and review the approval preview. On fresh data, approving produces PENALTY: **737.78 million payable, 2.22 million penalty**. Read the decision trace, then try `owner@novaan.vn` for the CT0019 milestone 3 dispute or `supplier@phuminh.vn` for CT0104 evidence.

> Demo actions persist in the current environment. Signing, approval and accounting transfer change the scenario. Ask the operator for a separate fresh test environment when repeating it; keep existing working data.

Missing tasks may have been completed already or belong to another organization. See [Roles](/guide/roles) and [Table tools](/guide/tables).

## Find the assigned signing account

![Search accounts: 1 — type a name/email/company; 2 — select the demo account](../../../public/guide/images/review-account-search.png)

Search by email, company name or contract code. For example `supplier@alphatech.vn` is at S001 — AlphaTech; `supplier@phuminh.vn` is at S015 — Phú Minh. Match the contract's organisation; a different supplier cannot sign on their behalf. The signing sequence shows each assigned email for comparison.
