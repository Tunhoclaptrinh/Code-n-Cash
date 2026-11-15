---
name: bpmn-drawio
license: Apache-2.0. Complete terms in LICENSE; attribution in NOTICE.
description: Create, revise, or review BPMN 2.0 process and collaboration diagrams in draw.io (.drawio), with editable normal/colored variants, rendered PNG/SVG/PDF previews, notation and layout checks, and a business explanation. Use whenever someone asks for a BPMN or pool/lane business-process diagram, event/gateway/message-flow modeling, or a review of an existing .drawio process, including Vietnamese requests such as "vẽ sơ đồ BPMN" or "rà soát quy trình nghiệp vụ". Not for generic flowcharts, UML, or draw.io application development.
---

# BPMN with draw.io

Model the stated business faithfully, use BPMN 2.0.2 notation and inspect the rendered output. XML parsing or an empty checker error list does not prove business correctness.

## Select the work

- **Create:** extract requirements, define the process, then draw and verify it.
- **Revise:** inspect the existing `.drawio` and images first; preserve manual work and edit only the requested scope.
- **Review:** assess requirements, notation and layout separately. Change files only if the request authorizes corrections.

Read workspace/user constraints first. Choose the number of diagrams from scope; one can be sufficient. Do not inherit policy, durations, pool count or page count from a previous example.

Default handover: editable normal and colored `.drawio` variants, PNG/SVG previews of each and a Markdown explanation. They have the same model and layout, differing only in color. Honor explicit deliverable constraints. Keep each assignment and its sources separate, in a user-selected folder. Do not require this skill's development workspace or exam files.

## Analyze the business

Create a compact requirements-to-elements table: participants and boundaries, trigger/outcomes, actions/roles, data/messages, predicates, timing and exceptions. Mark facts versus assumptions. Resolve routine choices; ask when missing business information materially changes the result, while continuing independent work.

Walk the main and stated alternative/exception scenarios through tokens and messages. A gateway reads a decision produced by work; it does not approve, validate, send goods or debit money itself. Distinguish physical handover, information transfer, sending and confirmed receipt. Define subprocess entry/exit contracts and completion scope.

For detailed review or real-work models, read [business-review.md](references/business-review.md). Keep as-is/to-be, version and process-owner questions explicit when relevant. Do not claim stakeholder approval from a notation test.

## Choose notation deliberately

Read [bpmn-rules.md](references/bpmn-rules.md) for scope, events, connections and conditional/default rules. Choose each event's trigger/result from its position (top-level start, subprocess start, event-subprocess start, catch, throw, boundary, end); a message flow leaves a throwing event/activity and enters a catching event/activity. OMG is the normative source; use the user's supplied specification or the linked official version for unusual cases. Explain differences if teaching requirements differ from the standard.

Read [coverage.md](references/coverage.md) before claiming automated support. Unsupported types/variants must be reported, not silently treated as validated. A `.drawio` file is mxGraph documentation, not executable BPMN XML.

For synchronization, event races, boundary handlers, event subprocesses, transaction/compensation, loops/multi-instance or terminate scope, consult [patterns.md](references/patterns.md). Apply the required construct and trace scenarios; never copy the examples' business policies.

## Draw and export

Read [drawio-workflow.md](references/drawio-workflow.md) for native shape/style mappings, containers, routing and palette pitfalls (the native Message Flow template has a filled arrowhead; the native End uses an undrawn `terminate2` symbol). Use a readable grid, space for event/edge labels and a consistent reading direction. Sequence may cross lanes of one pool. Do not add meaningless gateways to hide crossings or fragment a requested diagram to avoid layout work.

Resolve helper paths relative to this skill. Use the user's existing draw.io source unchanged; do not silently download or upgrade it. Check dependencies with:

```bash
python3 scripts/doctor.py --drawio-root DRAWIO_SOURCE --output-dir PREVIEWS
```

Read [themes.md](references/themes.md) when applying palettes. Prefer `monochrome` and `bizagi-inspired`; `tool-convention` remains a compatibility profile. These are local presentation choices, not official OMG/Bizagi colors. All end events are red in the colored profile, including successful outcomes; never infer colors from label keywords.

```bash
python3 scripts/colorize_drawio.py MODEL.drawio NORMAL.drawio --theme monochrome
python3 scripts/colorize_drawio.py NORMAL.drawio COLOR.drawio --theme bizagi-inspired
python3 scripts/render_drawio.py NORMAL.drawio --drawio-root DRAWIO_SOURCE --output-dir PREVIEWS_NORMAL --text-mode plain
python3 scripts/render_drawio.py COLOR.drawio --drawio-root DRAWIO_SOURCE --output-dir PREVIEWS_COLOR --text-mode plain
python3 scripts/audit_drawio.py NORMAL.drawio --render-dir PREVIEWS_NORMAL --palette monochrome --report CHECK_NORMAL.json
python3 scripts/audit_drawio.py COLOR.drawio --render-dir PREVIEWS_COLOR --compare NORMAL.drawio --palette bizagi-inspired --report CHECK_COLOR.json
```

Helpers support one or many pages and compressed inputs. Rendering uses local Chrome/Chromium; `--chrome` selects an explicit executable, and `--source-manifest` permits a verified source archive without Git history. `--pdf` adds a vector PDF per page; this is not automatic fitting to a submission template.

Inspect every rendered image, zooming into markers/arrowheads and text as needed. Correct clipping, misleading junctions, overlaps, unreadable labels and routes through unrelated objects. A label that leaves its lane can be painted over by the next lane and disappear. Re-render after source edits. SVG text mode can flatten HTML labels in the render copy; disclose lost rich formatting and preserve the original source.

Audit structure, palette, unsupported elements, manual-review notes and layout findings independently. `--strict-layout` fails targeted label/container/connector findings and requires label metrics; `--require-supported` fails unrecognized types/variants. Neither proves execution soundness. Rendering/source/SVG hashes and the recorded tool version/digest establish freshness of checked artifacts, not correctness of the business assumptions. Legacy render evidence without new metrics cannot support a claim that those checks ran.

## Explain and hand over

Use [output-contract.md](references/output-contract.md) to record requirement coverage, scenarios, assumptions, notation choices, drawing instructions, diagram count, renderer provenance and actual checks. Honor requested Markdown; optional HTML must not replace it. Link both variants and their previews from the answer README.

For a review-only request, report findings and proposals without regenerating the answer. For a handover, include necessary images and relative links; exclude vendor clones, runtime caches and unrelated/private assignments. Keep business coverage, notation, palette, visual inspection and tool tests separate. Do not call the output OMG-certified or operationally approved.

For a requested test handbook, label intentionally wrong fixtures, accepted notation with local-theme errors and unsupported behavior. Extra later illustrations do not turn an earlier XML-only test into a rendered test. Keep examples synthetic and test outcomes tied to their inputs.
