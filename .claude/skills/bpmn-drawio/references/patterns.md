# Independent BPMN process patterns

Use these to review a required construct, not to copy example policies into a new
assignment. Editable native shapes are in [normal examples](../assets/bpmn-patterns.drawio)
and [colored examples](../assets/bpmn-patterns-color.drawio). Each of ten tabs is an
independent synthetic requirement. These are visual `.drawio` models, not engine XML.
The editable assets are self-contained. Render them with the supplied helpers;
scenario obligations below support manual review, not engine simulation.

## Selecting a pattern

| Tab | Requirement that justifies the pattern | Key obligation |
|---|---|---|
| V01 purchase approval | A manager chooses approve, rework or reject | A review task creates the decision; XOR reads it; rework returns to the task, not Start |
| V02 onboarding | HR and IT must both finish | AND activates both; join consumes both before one completion |
| V03 optional distribution | Any subset of email/paper channels | Inclusive activates the selected subset; join waits for that subset |
| V04 quotation | First reply or one-day expiry wins | Event-based gateway waits for events, not conditions; loser is disabled |
| V05 support reminder | After two hours remind once, work continues | Non-interrupting boundary timer creates another token and separate None End |
| V06 document issue error | A named issuance error redirects to manual handling | Error boundary interrupts; normal success work does not also run |
| V07 scheduling cancellation | A message can cancel an active request | Event subprocess frame has no external sequence; triggered start interrupts its enclosing scope |
| V08 workshop registration | Undo a completed seat reservation when the transaction is canceled | Double transaction frame; Cancel inside/on that transaction; marked compensation via association |
| V09 file review | Process a three-item collection sequentially, then in parallel | Distinguish the two multi-instance markers; outer continuation waits for the defined completion rule |
| V10 registration screening | Stop inner concurrent work on a prohibition, then record the result outside | Terminate stops its containing subprocess, not its parent continuation |

## V01 — XOR, default, rework, lanes and data

Employee and manager are lanes of one company pool. T1 writes the proposal; T2
produces APPROVE/REWORK/REJECT. G uses YES/REWORK conditions; NO is a default
slash. The domain restriction makes that default mean REJECT. Invalid decision
values would require validation, not silent interpretation as rejection.

Walk approval, rejection, and one or more revisions. Ensure each iteration
revisits T1/T2, that approval does not also record rejection, and that Start is
not a loop target. DATA/D1 show document output, not control flow.

For a conditional sequence from an **activity**, use the unfilled source diamond;
conditions from gateways do not have it. Default has a slash and no condition.
OMG §8.4.13 pp.95–97; §10.6.2 pp.287–290.

## V02/V03 — Synchronization

V02 SPLIT enables A/B unconditionally. JOIN waits for AJ and BJ; DONE runs once.
Try both completion orders. XOR at the join can duplicate DONE; XOR at the split
with an AND join can leave a permanent wait. These are business/control-flow
errors even when every individual shape looks valid.

V03 uses boolean email/paper selections and a default when neither is true. Walk
all four combinations, including both completion orders when both are selected.
The join waits only for the chosen channels. This example has a closed branch
region; a general inclusive join with cycles requires the standard's full
active-path semantics. A simple local count is not a universal inclusive algorithm.
OMG §10.6.3–10.6.4 pp.290–294.

## V04 — Event race

RACE follows a Send Task. MSG is an intermediate Message Catch; TIME is an
intermediate Timer Catch with P1D duration. There are no guards/default flow on
RM/RT and no extra incoming sequences to either catch. Compare reply-first and
expiry-first; a late reply must not reactivate the closed instance.

If Receive Tasks are used instead, do not mix them with Message Catch events in
the same configuration or attach boundary events to those Receive Tasks. Timers
can coexist with either permitted configuration. Declare correlation/buffering
when early replies matter. A tie policy, if required, is a business decision;
the drawing itself does not implement event ordering. OMG §10.6.5 pp.295–299.

## V05/V06 — Boundary events

Attach REM/ERR to the activity they monitor and inspect that attachment on the
rendered image. Exact centering is a layout choice; the event must intersect its
activity boundary. Metadata alone is insufficient. Rounded corners and unusual
shapes require manual review even when a rectangular geometry check passes.

REM has dashed double rings, PT2H duration, no repeating cycle. It starts a
reminder token while WORK continues; finishing WORK removes its pending timer.
If the reminder already started, a None End on the main path does not kill it.

ERR has solid double rings and an unfilled Error marker. E_ISSUE interrupts
ISSUE; success-only LOG cannot run on that error path. “Transferred to manual
handling” is an accurate end result; “successfully issued” would be false.
OMG §10.5.4 pp.252–255; §10.5.6 pp.274–279.

## V07 — Event subprocess

ESP has a dashed frame, one Message Start CS, and no incoming/outgoing sequence
on the frame. CS is solid because it interrupts. The frame's dash pattern does
not determine interruption. CS handles the existing request instance, not a new
top-level process instance. Normal work in the enclosing process is stopped;
completed side effects are not automatically undone. A non-interrupting start
would be dashed and add concurrent handler instances instead.

Document when cancellation is allowed and how state updates are serialized. If
the request has already completed, its handler is no longer subscribed. A
normal embedded subprocess uses a None Start; do not substitute a triggered
start without turning it into the appropriate event subprocess.
OMG §10.3.5 pp.174–176; §10.5.6 pp.274–279.

## V08 — Transaction and compensation

TX has a double frame. BOOK reserves a seat; its compensation handler UNDO
releases an already reserved seat. COMP has **solid** double rings and a catching
compensation marker. Interrupting/non-interrupting does not apply to it: the
compensated work is already complete. Connect COMP to marked UNDO by a directed
association; UNDO has no ordinary incoming/outgoing sequence.

TC is a Cancel End inside TX. BC is a Cancel Boundary on TX. Walk both commit
and cancel. BC continues only after rollback/compensation completes. An Error
or Timer on a transaction does not automatically execute cancellation compensation.
Hazards/failed compensation require additional design when in scope. Never use
Cancel End merely because an order/request outcome is called “canceled”.
OMG §10.3.5 pp.176–178; §10.5.4 p.254; §10.7 pp.301–305.

## V09/V10 — Repetition and termination scope

V09 has three sequential normalization instances (horizontal bars), then three
parallel review instances (vertical bars). Each outer activity completes only
after its three instances. Explain collection/item mapping and any early
completion condition; cardinality in `.drawio` metadata is not engine configuration.
Standard Loop is a separate construct with its own loop condition/test timing.
OMG §10.3.8 pp.188–195.

V10 launches A/B in SP. None Ends consume individual tokens; SP waits while
other work remains. STOP terminates remaining work **inside SP**, then parent P
continues to LOG. It does not roll back completed work, terminate every pool or
claim that an unsuccessful outcome has become successful. Set output status
before termination and name the parent continuation accurately.
OMG §10.5.3 pp.245–248; §10.5.6 p.279.

## Beyond these examples

Select symbols by their semantics. Signal broadcasts, Message targets a
participant; Error and Escalation have distinct propagation rules; paired Link
events are same-level connectors, not cross-pool messaging. Call Activity calls
a reusable global definition and has a thick activity border. Ad-hoc uses its
completion/ordering rules; Choreography and Conversation are other diagram
families, not private-process flowcharts with different labels.

These constructs are not all demonstrated here. Read the supplied specification
when one is required, add a task-specific scenario, and disclose which automated
checks apply. Do not invent a substitute or infer full BPMN conformance from
the acceptance of these ten examples.
