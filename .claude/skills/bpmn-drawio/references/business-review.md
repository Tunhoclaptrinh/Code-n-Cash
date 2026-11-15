# Business review for BPMN assignments

Use this reference for a requested comprehensive review or when a semantic ambiguity affects the result. Check the assignment itself before treating a modeling preference as a business requirement.

## Required evidence

Keep a requirements-to-elements table with a source location, responsible participant, trigger, data/message, condition, result and scenario. Mark each entry as given, assumed, derived or outside scope. An assumption is not a fact from the assignment and is not silently accepted because it appears in generated XML.

Review in this order:

1. **Scope and responsibility:** participant boundaries, lane ownership, starting trigger, success and unsuccessful outcomes. A black-box pool hides its process; it does not prove that process is complete or has stopped.
2. **Business actions:** each decision must have an available input produced by prior work or an explicit assumption. A gateway reads a condition; it does not check a dossier, debit a card or approve a request itself. An action that means “review and choose” needs its stated outcome alternatives. An action that specifically means “record an already approved decision” does not automatically need a rejection branch.
3. **Task types:** human application work is User Task; physical work independent of a process application is Manual Task; automated work is Service Task. Sending/receiving information is distinct from travel, picking up goods or handing them over. Split mixed steps when one marker would conceal a material business distinction.
4. **Messages and knowledge:** pair senders/receivers at the selected abstraction level; explain reused message IDs across views. Account for early, late and repeated messages when those situations affect the stated requirements. Message flow is not a physical goods conveyor or a cross-pool token.
5. **Conditions and state:** make branch predicates exclusive/exhaustive where intended. State who records the decision. Specify when payment is captured and when a refund is confirmed. Do not equate sending a cancellation request with the recipient completing cancellation.
6. **Timing and concurrency:** specify the activity to which a deadline applies, its start point, and whether expiry interrupts work. If exact-time ties are requested, supply an explicit business rule or flag the missing rule. A diagram does not implement atomic updates or idempotency.
7. **Scenario walkthroughs:** main path, each required exception, boundary timing, empty/negative outcomes and any stated race. Record visited tasks, required messages, final state, money state if relevant, and prohibited actions. Keep verification of a graph path distinct from verification that the chosen business rule matches the assignment.

## Review conclusions

Distinguish requirements **verification** (clarity, consistency, usable detail and conformance) from **validation** (support for the intended need, benefits and scope), following the [IIBA BABOK glossary](https://www.iiba.org/career-resources/a-business-analysis-professionals-foundation-for-success/babok/glossary/). For an exercise, validate against the supplied prompt and marking requirements; do not invent stakeholder approval. For real work, identify whose process and rules are being represented, keep questions/assumptions visible, and prepare the model for review with the relevant process owners. A notation check alone cannot establish business agreement or operational readiness.

Report separately:

- Required business coverage, with assumptions and unresolved questions.
- BPMN notation and participant/subprocess scope checks.
- Actual rendered image review, including marker visibility and readability.
- Optional palette checks and equality of normal/colored variants.
- Tool regression tests, which validate the checker, not the user's business process.

An abstract subprocess may be appropriate in a high-level answer. State its entry/exit contract and undisplayed error behavior. Do not claim its internal paths have been drawn, simulated or proven when only the contract is present.

For a detailed review document, include source references, findings and fixes, requirements mapping, an element/connector inventory, scenario and decision tables, scope limitations, drawing instructions and reproducible checks. Scale detail to the user's request; do not turn every small diagram edit into an exhaustive review.


## Reusable handover for real work

When relevant, record whether the model is as-is or to-be, its process version, owner and unresolved decisions. Separate internal modeling assumptions from stakeholder-confirmed rules. Record the moment data becomes available, the source of decisions, the scope of cancellation and the completion contract of physical tasks or abstract subprocesses. Trace boundary-time and repeated-message cases if they affect the requirements. Prepare reviewable artifacts; do not invent stakeholder sign-off or imply operational readiness from a test result.
