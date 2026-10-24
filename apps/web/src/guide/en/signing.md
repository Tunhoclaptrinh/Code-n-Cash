# Prepare, review and sign a contract

The flow is **Upload → Signature positions → Terms review → Signing → Effective**. Owners and buyer contract officers prepare it; assigned signers act in order.

## Prepare the draft

![Contract form](../../../public/guide/images/upload-form.webp)

Enter title, parties, contract type, value in million VND and dates. Select approval policy, grace days, daily penalty rate and cap. These values flow into generated milestones with penalties enabled. Upload the document and wait for completion.

Choose one to four signers. A single signer completes the configured signing flow; two or more signers must include both parties. Presets help arrange order but still require review. Signing roles and payment-approval roles are separate.

![Signer selection and presets](../../../public/guide/images/upload-signers.webp)

## Position signatures and review terms

![Signature positioning](../../../public/guide/images/upload-positions.webp)

Select each signer and place a signature box on an allowed page, avoiding blocked content and other signatures. Save, then review milestone amounts, percentages, evidence types, approvals, penalties and dates. A relative warranty term needs an explicit confirmed deadline.

![Digitization review and deadline confirmation](../../../public/guide/images/upload-digitize.webp)

> Extraction reads real PDF/DOCX text using rules and requires explicit review. Scans need an OCR integration. Milestone templates still come from the Data Pack; the signature placement canvas remains a schematic rather than PAdES page coordinates.

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

## Preview the actual document

![PDF rendered from the actual contract file](../../../public/guide/images/upload-real-preview.webp)

1. Select a PDF/DOCX or generate a sample. The preview displays an actual PDF; DOCX files are converted to PDF rather than illustrated.
2. Scroll or change pages inside the viewer; download the preview PDF to compare it. Rendering does not change the original bytes or hash.
3. After saving, open contract details → **Original documents** to view the stored file. Organiser records without attachments show a missing-file message.

## Use a managed template

Select a template in the upload form, then adjust terms, signer count/order and additional text for this contract. **Generate sample contract** produces a real DOCX. If you edit those fields afterwards, regenerate or upload a replacement before continuing. Saved drafts preserve the applied template version even if an administrator edits or deletes it.

Original files can be opened during review, signing and contract details. The current file appears before previous uploads; download the original separately from the rendered preview PDF. Text extraction requires explicit review; scan OCR and PAdES positioning are not connected. Local signing creates actual Ed25519 proofs with test keys; VNPT/Viettel method flows remain simulated.

## Quick input stays under your control

![Empty new form: 1 — fill remaining empty fields](../../../public/guide/images/upload-form.webp)

![Sample input is filled but has not been saved](../../../public/guide/images/upload-demo-filled.webp)

New upload forms start empty; generated IDs and system fields remain read-only. Use the single **Fill sample data** button at the top to fill every empty field, including unselected signers. Existing text, zero and false values stay unchanged; the action does not save or submit. Open **Actions** on a signer row to move it up, move it down or remove it. Signing order runs from top to bottom. Completing an existing draft preserves its stored data.

**Load suggestions** uses values actually extracted from the file for review. Unconfirmed dates and new signature positions also start empty and have explicit suggestion/sample actions.

![Contract document: 1 — custom content; 2 — select or replace the file](../../../public/guide/images/upload-document.webp)
