# Prepare, review and sign a contract

The flow is **Upload → Signature positions → Terms review → Signing → Effective**. Owners and buyer contract officers prepare it; assigned signers act in order.

## Prepare the draft

![Contract form](../../../public/guide/images/upload-form.webp)

Enter title, parties, contract type, value in million VND and dates. Select approval policy, grace days, daily penalty rate and cap. These values flow into generated milestones with penalties enabled. Upload the document and wait for completion.

Choose up to four signers, including both parties. Presets help arrange order but still require review. Signing roles and payment-approval roles are separate.

![Signer selection and presets](../../../public/guide/images/upload-signers.webp)

## Position signatures and review terms

![Signature positioning](../../../public/guide/images/upload-positions.webp)

Select each signer and place a signature box on an allowed page, avoiding blocked content and other signatures. Save, then review milestone amounts, percentages, evidence types, approvals, penalties and dates. A relative warranty term needs an explicit confirmed deadline.

![Digitization review and deadline confirmation](../../../public/guide/images/upload-digitize.webp)

> Current extraction uses workflow templates derived from the Data Pack and manually entered draft parameters. It does not read PDF clauses using OCR, NLP or an LLM. Clause locations are illustrative. Compare against the actual document before confirming.

Confirmation creates milestones, locks terms and starts signing. The final milestone absorbs rounding remainder so amounts add to the contract value. An unresolved structural gap can leave a milestone on HOLD.

## Sign in order

![Signing order](../../../public/guide/images/signing-flow.webp)

![Supplier's turn on CT0102](../../../public/guide/images/signing-turn.webp)

Sign in as the current signer, read the document, choose a method and complete the simulated confirmation. The final step requires a digital-signature method rather than only an image. Completion advances the next turn; final completion activates the contract and records `CONTRACT_SIGNED` for the buyer.

![Signing method selection](../../../public/guide/images/signing-method.webp)

Try CT0102 as supplier, then secondary approver. Attempts before your turn are blocked. Workflow cancellation belongs to the draft manager and requires reviewing its confirmation.

## Verify recorded signatures

![Recorded signature information](../../../public/guide/images/verify.webp)

Compare signer, method, time and effective date. External PDF structural detection is reported as unverified.

> Provider signing and internal signature results are simulated. The app has no live CA, OCSP/CRL or cryptographic PDF verification. A demo “valid” result is not evidence of a real verified digital signature.
