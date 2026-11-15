# Building and reviewing draw.io BPMN artifacts

## Source checkout

Use the user's existing source directory, supplied through `--drawio-root`; do not assume a particular workspace layout. Record the commit/viewer digest. `--source-manifest` verifies a source archive using `commit` and `viewer_sha256` without requiring Git history. Do not silently pull a new version. The source gives exact shape implementations; the OMG reference and assignment establish modeling semantics.

Inspect these paths when needed:

- `src/main/webapp/js/diagramly/sidebar/Sidebar-BPMN.js`: native palette styles and variants.
- `src/main/webapp/shapes/bpmn/mxBpmnShape2.js`: event, gateway, task and marker drawing.
- `src/main/webapp/js/grapheditor/Shapes.js`: basic shapes/markers used by BPMN.
- `src/main/webapp/js/viewer-static.min.js`: standalone official renderer with required shapes.
- `src/main/webapp/index.html`: editor entry point, for a full local editor if required.

Do not needlessly modify/build the application to generate a diagram. Never execute repository maintenance/deployment scripts just to open a drawing.

## XML and native shapes

Use an uncompressed `.drawio` document with one `diagram/mxGraphModel` per requested view. One page is enough for a single diagram. Give IDs unique within each page, keep container-relative geometry consistent, and attach boundary events to their activity. Multiple pages can reuse root IDs `0`/`1`; decoding them together into one codec document causes ambiguous references. The renderer isolates each model before decoding.

Put an edge crossing lanes under their common pool/layer, not inside only the source lane. draw.io can clip the route at that lane boundary even when both endpoint references exist and the BPMN sequence scope is valid. Inspect the complete visible route and arrowhead after rendering.

Prefer metadata on `<object id="..." label="..." bpmnType="...">` wrappers where helpful, while preserving a real child `<mxCell>`. Use `participant`, `lane`, `startEvent`, `endEvent`, `boundaryEvent`, `serviceTask`, `sendTask`, `receiveTask`, `manualTask`, `userTask`, `subProcess`, `exclusiveGateway`, `sequenceFlow`, and `messageFlow` consistently. Metadata assists auditing; it does not make a wrong visual style correct.

Examples of native styles (verify the actual clone when using a different version):

| Element | Key styles |
|---|---|
| Task | `shape=mxgraph.bpmn.task2;rectStyle=rounded;size=10;taskMarker=abstract;` |
| Send/receive | task style plus `taskMarker=send` / `taskMarker=receive` |
| Ordinary collapsed subprocess | task style plus `isLoopSub=1`; **not** `bpmnShapeType=subprocess`, which the implementation uses for an event-subprocess variant |
| Start | `shape=mxgraph.bpmn.event;outline=standard;symbol=general;` |
| Message start | start style plus `symbol=message` |
| None end | event shape plus `outline=end;symbol=general;` |
| Interrupting timer | event shape plus `outline=boundInt;symbol=timer;` |
| XOR | `shape=mxgraph.bpmn.gateway2;gwType=exclusive;outline=none;symbol=none;` |
| Sequence | `dashed=0;endArrow=blockThin;endFill=1;` |
| Message | `dashed=1;startArrow=oval;startFill=0;endArrow=blockThin;endFill=0;` |

Native palette pitfalls at the pinned commit (`Sidebar-BPMN.js`, `mxBpmnShape2.js`):

- The plain **Message Flow** template has `endFill=1`, a filled arrowhead. OMG requires an unfilled head; set `endFill=0`. The checker rejects the filled form.
- The plain **End** template uses `symbol=terminate2`, which the renderer does not draw: it looks like a None End while the style claims something else. Choose `general` or `terminate` deliberately; unknown symbols are reported as unsupported.
- `bpmnShapeType=call` draws a Call Activity (thick border), `subprocess` an event subprocess (dashed) and `transaction` a double border. A task style with `bpmnShapeType=call` is not an ordinary task.
- Lanes may use `swimlane` or `shape=mxgraph.bpmn.swimlane`; both are containers.
- Interrupting event-subprocess starts appear as `outline=standard` or `eventInt`; both draw a solid ring.

The renderer makes `outline=end` three times the base stroke width; inspect the SVG rather than assuming the style's base stroke is the final ring thickness.

## Layout and rendering

Use a grid and comparable task sizes; center events/gateways on the reading axis, route exceptions deliberately, and reserve room for messages/labels. A connection may attach to any side; choose a direction that makes its meaning clear. Allow space for external event labels and timer labels. Crossings should not look like joins. Do not add a meaningless gateway simply to avoid a crossing.

`scripts/render_drawio.py` works with a single or multi-page `.drawio`, including compressed page payloads. It uses the viewer from the clone and Chrome/Chromium, outputs SVG/PNG plus render data, and records input digest and draw.io commit. No network or fixed three-page list is needed.

```bash
python3 PATH_TO_SKILL/scripts/render_drawio.py OUTPUT/Answer.drawio \
  --drawio-root vendor/drawio --output-dir OUTPUT/previews/normal
```

The renderer creates `.bpmn-runtime` beneath its output folder for temporary HTML. It does not modify the source checkout. Headless Chrome may require the environment's normal execution approval; do not claim rendered checks if it could not run.

## Audit and compare

```bash
python3 PATH_TO_SKILL/scripts/audit_drawio.py OUTPUT/Answer.drawio \
  --render-dir OUTPUT/previews/normal --report OUTPUT/check-normal.json
python3 PATH_TO_SKILL/scripts/audit_drawio.py OUTPUT/Answer_Co_mau.drawio \
  --render-dir OUTPUT/previews/color --compare OUTPUT/Answer.drawio \
  --palette bizagi-inspired --report OUTPUT/check-color.json
```

The audit reports errors, manual-review warnings, page count, and digest freshness. It infers native shapes when metadata is absent, but unusual/legacy/custom shapes need review. It checks common connection/notation constraints, rendered geometry collisions, and color-only equivalence. It deliberately does not assert that all BPMN constructs or business semantics have been validated. Interpret any warning, and manually inspect all rendered images and token/message scenarios.

An intermediate lane of an endpoint participant is not a routing obstacle: sequence flows may cross lane boundaries in the same pool (OMG 9.3). Geometry checks still reject routes through unrelated activities or participant containers. Do not shorten a business flow or replace a lane with a separate pool merely to avoid such a false positive.

The helper checks rendered boundary intersection using activity bounding rectangles, common conditional/default markers, standard exclusive event-gateway successors, event-subprocess connections and selected transaction/compensation constraints. Rounded corners/custom shapes, condition truth/exhaustiveness, advanced gateway variants and execution soundness still need targeted review. Graph reachability warnings are advisory because implicit starts and handlers have special activation rules. Do not read an empty `errors` list as coverage of all BPMN rules.

`scripts/bpmn_builder.py` provides native shapes and explicit edge routing without assignment-specific assumptions. `Diagram` accepts absolute page coordinates and stores container-relative geometry; edges use a common container so cross-lane routes remain visible. It builds normal/color variants but does not determine business logic, infer a layout, or output executable BPMN XML. See the editable assets linked in `references/patterns.md` for examples; choose one or many diagrams from the actual assignment.

Color comparison ignores only the values of `fillColor`, `swimlaneFillColor`, `strokeColor`, `fontColor`, `labelBackgroundColor`, and `labelBorderColor`; `strokeColor=none` or `fontColor=none` hides notation or text and therefore counts as a content change. It still compares node IDs, labels, hierarchy, sizes/coordinates, edge routing, ring/marker styles, and arrow/dash options. A label or connection change is not a color variant.

Generate the selected optional palette with `scripts/colorize_drawio.py INPUT.drawio OUTPUT_Co_mau.drawio --theme bizagi-inspired`; it also accepts compressed inputs. It chooses fills by element type, never label keywords. `--palette NAME` checks that profile in XML and rendered flow objects. `bpmn_builder.save_pair(diagrams, path, normal_theme="monochrome", color_theme="bizagi-inspired")` writes both variants; its defaults keep earlier `tool-convention` outputs reproducible. Palette failures are reported separately from BPMN structure errors. Keep rendering evidence per input/variant and regenerate it after any source change; a passing report against an old digest cannot validate a new drawing.

## Markdown evidence

Explain each requirement's location in the diagram and walk its concrete scenarios. Document assumptions separately. State the diagram/page count, source commit, rendered variants, actual automated checks, manual findings, and any unresolved issue. A clean XML parse and fresh PNG are necessary tooling evidence, not a business correctness proof.


## Portable rendering and targeted layout checks

Use `doctor.py --drawio-root SOURCE --output-dir OUTPUT` before rendering on a new machine. Python 3.10+ and Chrome/Chromium are needed; `--chrome PATH` overrides discovery. Only Linux with Python 3.14 has been exercised locally (Chrome 155 for rc.1, Chrome 156 for rc.2); scripts are parsed with the Python 3.10 grammar in the unit suite, which is not the same as running 3.10. CI configuration is provided but is not evidence that remote CI ran.

`render_drawio.py --text-mode plain` converts HTML labels in a rendering copy and uses the viewer's own SVG text alternatives. It refuses to silently discard an HTML label with no SVG alternative. Source XML stays unchanged; rich formatting may be flattened. `--pdf` additionally creates one content-sized PDF per page from portable SVG. This does not fit a page to A3/Letter or fill an exam template. Original preserve mode remains available for editor-oriented HTML labels.

Fresh render data includes label bounds, the SVG digest and the skill version/tool digest. The auditor checks the SVG digest and notes render evidence from another tool version. Targeted layout findings cover: labels on unrelated shapes or labels; activity/container labels overflowing their own shape; event/gateway/data labels leaving their lane, pool or subprocess; labels straddling a container border or header line; labels crossed by an unrelated connector; two connectors without a shared endpoint running on the same line (a false junction); and flow objects outside their declared container. Overlaps of 2 px or less are ignored because label boxes include spacing. A label outside its lane is more than cosmetic: a later-drawn lane can paint over it. Findings stay separate from BPMN notation errors by default; `--strict-layout` requires label metrics and promotes them to failure. Rounded corners, exact glyph extents, perpendicular crossings and readability at the intended printed size still require inspecting images.

`--require-supported` rejects reported unknown types/variants. Recognition and passing selected constraints do not mean full validation of a known construct: inclusive joins, transactions/compensation and other advanced patterns retain manual obligations in coverage.md.

## Self-contained checks

```bash
python3 PATH_TO_SKILL/scripts/run_checks.py
python3 PATH_TO_SKILL/scripts/run_checks.py --render --drawio-root SOURCE --output-dir NEW_EVIDENCE --report NEW_EVIDENCE/checks.json
```

Tests use synthetic inputs in this skill; no exam or student files are needed. Keep per-run evidence directories separate and inspect the report, including expected negative controls and manual review notes. The render suite adds four layout-control pages (one tidy, three deliberately defective) and, when `pdfimages`/`pdftotext` exist, checks that demo PDFs contain no raster image and keep Vietnamese text; otherwise it records an explicit skip.

```bash
python3 PATH_TO_SKILL/scripts/package_skill.py --output-dir CANDIDATE
python3 PATH_TO_SKILL/scripts/smoke_package.py CANDIDATE/bpmn-drawio-VERSION-candidate.zip --drawio-root SOURCE --report CANDIDATE/smoke.json
```

The smoke test extracts into a new folder, refuses unsafe entries, compares every entry and the tool digest with the manifests, reruns the unit suite from the extracted copy and, with `--drawio-root`, creates, renders and strictly audits the demo there.
