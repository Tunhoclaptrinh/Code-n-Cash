# BPMN rules to apply selectively

Use OMG BPMN 2.0.2 as the normative source, from the user's supplied copy or the official link below. Discover the supplied file rather than assuming a workspace path. The standard's printed page numbers differ from its PDF viewer indices; verify numbering before citing a page.

## Requirements and control flow

- A pool represents a participant; lanes partition responsibility within its process. Departments are not automatically separate participants. A private process can be shown without an explicit pool; external participants can be black boxes. Neither four pools nor any lane count is mandatory.
- Sequence flow stays within one pool and process/subprocess scope. It is solid with a filled arrowhead. A sequence may cross lanes. Task/gateway labels do not change this scope.
- Message flow connects different participants, never two elements of the same pool. It is dashed with an open circle at the sender and an unfilled arrowhead at the receiver. Figure 9.11 uses an outlined triangle; do not replace it with a filled sequence arrow. Gateways, lanes, and data/artifacts are not message endpoints.
- Association/data association is not control flow or participant messaging. Use it only where the model needs artifacts/data; do not add data objects merely for decoration.
- A conditional sequence from an activity has an unfilled mini-diamond at the source and requires another outgoing sequence. A condition from a gateway has no mini-diamond. A default sequence has a slash, no condition, and runs only when no other condition is true. AND and event-based gateways do not use conditions/default branches. Labels alone do not establish complete, exclusive predicates.
- XOR chooses one route; predicates must match the story and cover the intended cases. An XOR merge does not synchronize. AND splits activate all outgoing paths and an AND join waits for all incoming paths. Inclusive split/join has different active-path semantics. Trace joins and loops; do not mechanically pair diamonds or join alternative-only branches with AND.
- BPMN permits multiple outgoing sequence flows from a start or activity. Do not declare such diagrams invalid just because a simple example has exactly one. Check the resulting concurrent tokens and required synchronization. Explicit gateways often make an exam answer easier to explain.
- An event-based gateway represents competing events, not a data decision. Check its permitted immediate catching/receive successors in the specification. In particular a receive task immediately used in such a configuration cannot also have attached intermediate boundary events.
- For a non-instantiating exclusive event-based gateway, use at least two alternatives: allowed intermediate catches (Message, Signal, Timer, Conditional, suitable Multiple) or Receive Tasks. Do not mix Message catches and Receive Tasks in the same configuration, add another incoming sequence to a successor, or put data conditions on the outgoing sequences. The first event wins; the other waits are disabled. Instantiating/parallel event-based variants require their own rules.

## Events and tasks

- Ordinary start: one thin circle, no incoming sequence flow. Message start: catching/unfilled envelope, incoming message, no outgoing messages. A normal embedded subprocess uses a None start; event subprocesses are different and use trigger events.
- End: one thick circle, no outgoing sequence flow. None end has no result marker. A message end sends a message and has a dark envelope. Reaching one ordinary end consumes that token; it does not automatically stop concurrent tokens or another participant.
- A business outcome called “cancelled” does **not** require a Cancel End marker. Cancel End is for Transaction Sub-Processes. Terminate End has a filled inner circle and terminates its own process scope; it is not a generic completion or cross-pool kill switch.
- An intermediate/boundary event has two thin outer rings. For an interrupting boundary timer these rings are solid and the clock is attached to the waiting activity. A non-interrupting boundary event has dashed rings and creates an additional path. Do not swap them as styling. Check its visible position on the activity boundary as well as metadata; an `attachedToRef` string alone does not establish that the drawing is attached correctly.
- Error and Cancel boundary events always interrupt and have solid rings. Compensation boundary also has solid rings, but interrupting/non-interrupting does **not** apply: it compensates already completed work. Connect its marked compensation activity with an association, outside normal sequence flow (§10.5.4 p.254; §10.7 pp.301–305). Do not mark compensation dashed merely because it cannot interrupt completed work.
- A send task has a dark envelope; a receive task has an unfilled envelope and waits for the associated message. Service/user/manual markers reflect what performs the work; do not mark physical travel as an automated service merely for appearance. Split mixed actions only when it improves business clarity or is required.
- Start and end events are optional in parts of the BPMN standard; do not mistake the common teaching recommendation to show them explicitly for an absolute conformance requirement. For exam diagrams, explicit trigger/outcome events are usually clearer unless the task says otherwise.
- A collapsed subprocess has the plus-in-a-box marker. A normal expanded subprocess has a solid outline. An event subprocess is a different construct with a dashed boundary. Do not connect ordinary sequence flows across the frame to its inner activities.
- An event subprocess has no incoming/outgoing sequence on its frame and exactly one triggered start; read interrupting status from the **start**, not the dashed frame. A Transaction Sub-Process has a double boundary; Cancel End belongs inside it and Cancel Boundary attaches to it. Its cancel flow waits for rollback/compensation completion. A plain Error/Timer interruption does not automatically perform transaction compensation.
- Multi-instance sequential uses three horizontal bars; parallel uses three vertical bars. Specify collection/cardinality, item data, and whether all instances or an explicit completion condition finish the activity. A standard loop repeats one activity according to its loop condition; it is not the same as multi-instance.

## Event triggers/results by position

OMG Tables 10.84–10.90 and 10.93 (printed pp.239–259). The checker uses the same matrix; `general` means None.

| Position | Permitted markers | Notes |
|---|---|---|
| Top-level start | None, Message, Timer, Conditional, Signal, Multiple, Parallel Multiple | Not Error/Escalation/Compensation/Cancel/Link/Terminate |
| Embedded subprocess start | None | The parent token is the trigger |
| Event-subprocess start, interrupting | Message, Timer, Escalation, Error, Compensation, Conditional, Signal, Multiple, Parallel Multiple | Solid ring; exactly one start |
| Event-subprocess start, non-interrupting | Message, Timer, Escalation, Conditional, Signal, Multiple, Parallel Multiple | Dashed ring; never Error/Compensation |
| Intermediate catch (normal flow) | Message, Timer, Conditional, Link, Signal, Multiple, Parallel Multiple | Unfilled marker; Escalation/Error/Cancel/Compensation catch only on a boundary |
| Intermediate throw (normal flow) | None, Message, Escalation, Compensation, Link, Signal, Multiple | Filled marker; None intermediate is a throw |
| Boundary, interrupting | Message, Timer, Escalation, Conditional, Error, Cancel, Compensation, Signal, Multiple, Parallel Multiple | Not None/Link/Terminate; Cancel only on a transaction |
| Boundary, non-interrupting | Message, Timer, Escalation, Conditional, Signal, Multiple, Parallel Multiple | Dashed rings |
| End | None, Message, Escalation, Error, Cancel, Compensation, Signal, Terminate, Multiple | Not Timer/Conditional/Link/Parallel Multiple |

Connections (§10.5.2–10.5.4, §10.6.1): a message flow may leave a throwing Message/Multiple event, a Message/Multiple End or an activity/pool, and may enter a catching Message/Multiple/Parallel Multiple start, intermediate or boundary event, an activity or a pool. A catching event never sends a message; a throwing event never receives one; a message intermediate event has incoming or outgoing message flow, not both. A boundary event needs at least one outgoing sequence flow unless it is Compensation. A normal-flow intermediate event needs incoming and outgoing sequence flow, except that a source (throw) Link has no outgoing and a target (catch) Link has no incoming flow. Each source Link needs exactly one same-named target Link in the same process level. A gateway must split or merge: at least two incoming or two outgoing sequence flows.

## Timing, cancellation, and concurrency

Check when waiting begins and what stops it. Distinguish “send request” from “receive confirmation”. Do not add an arbitrary five-minute limit, online payment, refunds, or cancellation policy if absent from the new problem. If simultaneous acceptance/expiry matters, specify the business winner/tie rule and one atomic status transition; a gateway drawing alone does not provide implementation locking.

If early messages may arrive before the modeled receive is active, state correlation/buffering assumptions or model an appropriate persistent-state interaction. If cancel/refund success is an outcome, the model must reach it only after the required work/confirmation; a notification send alone is not proof another party has stopped.

## Color and layout

Color is optional under §7.5 (printed pp.39–40); §12.1.1 (p.367) also explicitly calls alternative colors non-normative and warns that their meaning varies between tools/users. There is no single mandatory palette shared by all BPMN tools. Bizagi's official event palette illustrates a familiar green start / red end convention; other tools may use monochrome. Use the documented bizagi-inspired profile for the colored variant unless the assignment specifies another: green start, red **every** end, yellow intermediate/boundary events and gateways, blue activities. Red means end, not failure. Never infer colors from label keywords such as “cancel”, “reject” or “complete”.

Keep markers recognizable: throwing/sending markers dark and catching markers unfilled relative to the background. Never change solid/dashed lines, ring count, ring thickness, arrow fill, or task/event type to add color. Two color variants must preserve labels, geometry, hierarchy, markers and connections.

Keep text annotations recognizable as artifacts when part of the model; titles and external captions need not become flow objects. Use actual participant/subprocess containers so moving a shape does not silently change ownership.

## Useful normative locations

| Topic | OMG section | Printed pages |
|---|---|---|
| Color/lines, connection rules | 7.5–7.6 | 39–42 |
| Sequence flow and conditional/default markers | 8.4.13 | 95–97 |
| Participant, lane, message flow | 9.3–9.4 | 111–122 |
| Task types | 10.3.3–10.3.4 | 154–165 |
| Subprocess types | 10.3.5 | 171–181 |
| Start/end/intermediate events | 10.5.2–10.5.4 | 237–258 |
| Boundary event handling | 10.5.6 | 274–279 |
| Gateways | 10.6 | 286–300 |
| Non-normative colors and limits of diagram interchange | 12.1.1 | 367 |

Official supporting references: [draw.io BPMN library](https://www.drawio.com/docs/diagram-types/bpmn-2-0/), [Bizagi event palette](https://help.bizagi.com/platform/en/events.htm), [OMG BPMN 2.0.2](https://www.omg.org/spec/BPMN/2.0.2/PDF). Use OMG for conformance when a vendor's overview oversimplifies a rule; a general-purpose shape palette is not a business validator.

These rules guide a model review; they are not an exhaustive substitute for the standard. Unsupported advanced constructs need a targeted review, not conversion into simpler symbols without changing meaning.

For independent, editable examples and scenario obligations for these patterns, read [patterns.md](patterns.md). They are synthetic requirements with explicit scope, not a mandatory template for new assignments.

An accepted native-shape/format fixture proves only the tested recognition or constraint. In particular, accepting an inclusive gateway or a start with multiple outgoing flows does not establish join soundness or business correctness. A visual handbook should label those limits beside the figure rather than call every accepted fixture a complete correct model.
