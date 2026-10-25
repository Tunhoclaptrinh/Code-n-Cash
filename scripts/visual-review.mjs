/** Read-only layout review; use an isolated file fixture containing a real CT0105 PDF. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inspectButtons } from "./lib/button-audit.mjs";
import { writeVisualReport } from "./lib/visual-report.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:3311";
const out = resolve(
  process.env.VISUAL_OUT ?? "playwright-report/visual-review",
);
const health = await fetch(base + "/api/v1/health").then((r) => r.json());
assert.equal(health.data.storage, "file", "ISOLATED_FILE_FIXTURE_REQUIRED");
await mkdir(out, { recursive: true });
const allCases = [
  ["tasks", "Cán bộ hợp đồng", "legal@novaan.vn", "/tasks", ".ant-table-row"],
  [
    "contracts",
    "Chủ hợp đồng",
    "owner@novaan.vn",
    "/contracts",
    ".ant-table-row",
  ],
  [
    "upload",
    "Cán bộ hợp đồng",
    "legal@novaan.vn",
    "/contracts/new",
    "#contract-title",
  ],
  [
    "positions",
    "Cán bộ hợp đồng",
    "legal@novaan.vn",
    "/contracts/CT0105/sign-positions",
    "[data-testid=real-pdf-page]",
  ],
  [
    "decision",
    "Chủ hợp đồng",
    "owner@novaan.vn",
    "/contracts/CT0019/milestones/3/decision",
    "[data-testid=replay-timeline]",
  ],
  [
    "guide",
    "Cán bộ hợp đồng",
    "legal@novaan.vn",
    "/guide/start",
    "[data-testid=guide-demo-contracts]",
  ],
  [
    "signing",
    "Nhà cung cấp",
    "supplier@phuminh.vn",
    "/contracts/CT0102/signing",
    ".ant-steps",
  ],
  [
    "rules",
    "Quản trị hệ thống",
    "sysadmin@codecash.vn",
    "/platform/rule-versions",
    "[data-testid=rule-version-create]",
  ],
  [
    "organizations",
    "Quản trị hệ thống",
    "sysadmin@codecash.vn",
    "/platform/organizations",
    ".ant-table-row",
  ],
  [
    "detail",
    "Chủ hợp đồng",
    "owner@novaan.vn",
    "/contracts/CT0019",
    ".ant-tabs",
  ],
  [
    "approval",
    "Phê duyệt tài chính",
    "finance@novaan.vn",
    "/approvals/CT0103/2",
    "[data-testid=approve-payment]",
  ],
  [
    "dispute",
    "Chủ hợp đồng",
    "owner@novaan.vn",
    "/contracts/CT0019/milestones/3/dispute",
    "textarea",
  ],
  [
    "digitize",
    "Cán bộ hợp đồng",
    "legal@novaan.vn",
    "/contracts/CT0105/digitize",
    "[data-testid=extraction-panel]",
  ],
  [
    "verification",
    "Cán bộ hợp đồng",
    "legal@novaan.vn",
    "/verify/CT0103",
    "[data-testid=verification-layout]",
  ],
  [
    "evidence",
    "Nhà cung cấp",
    "supplier@phuminh.vn",
    "/submissions/CT0103/2",
    "[data-testid=evidence-slot]",
  ],
  [
    "activity",
    "Kiểm toán viên",
    "auditor@codecash.vn",
    "/activity-log",
    ".ant-table-row",
  ],
  [
    "permissions",
    "Quản trị hệ thống",
    "sysadmin@codecash.vn",
    "/platform/permissions",
    ".ant-table-row",
  ],
  [
    "templates",
    "Quản trị hệ thống",
    "sysadmin@codecash.vn",
    "/platform/contract-templates",
    ".ant-table-row",
  ],
];
const selected = process.env.VISUAL_CASES?.split(",");
assert.ok(
  !selected || selected.every((name) => allCases.some(([id]) => id === name)),
  "UNKNOWN_REVIEW_CASE",
);
const cases = allCases.filter(([name]) => !selected || selected.includes(name));
assert.ok(cases.length, "NO_REVIEW_CASES_SELECTED");
const sizes = [
  [1440, 900],
  [1280, 720],
  [768, 1024],
  [390, 844],
].filter(
  ([width]) =>
    !process.env.VISUAL_WIDTHS ||
    process.env.VISUAL_WIDTHS.split(",").includes(String(width)),
);
const themes = process.env.VISUAL_THEMES?.split(",") ?? ["light", "dark"];
assert.ok(sizes.length, "NO_REVIEW_WIDTHS_SELECTED");
assert.ok(
  themes.length && themes.every((theme) => ["light", "dark"].includes(theme)),
  "INVALID_REVIEW_THEME",
);
const profile = await mkdtemp(join(tmpdir(), "codecash-visual-"));
const chrome = spawn(
  process.env.CHROME_BIN ?? "google-chrome",
  [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const captured = [],
  failures = [],
  audit = [];
let ws;
try {
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    port = await readFile(join(profile, "DevToolsActivePort"), "utf8")
      .then((s) => s.split("\n")[0])
      .catch(() => undefined);
    if (!port) await pause(100);
  }
  assert.ok(port, "CHROME_START_FAILED");
  const tab = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
    method: "PUT",
  }).then((r) => r.json());
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, reject) => {
    ws.onopen = r;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (!m.id) return;
    const job = pending.get(m.id);
    pending.delete(m.id);
    m.error ? job.reject(Error(m.error.message)) : job.resolve(m.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.text);
    return r.result.value;
  };
  const until = async (expression) => {
    for (let i = 0; i < 200; i++) {
      if (await evaluate(expression)) return;
      await pause(100);
    }
    throw Error("TIMEOUT " + expression);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: base + "/login" });
  await until("!!document.querySelector('#root')");
  const inventory = cases.flatMap(([name, role]) =>
    sizes.flatMap(([w, h]) =>
      themes.map((theme) => ({
        id: `${name}-${w}-${theme}`,
        role,
        title: `${name} · ${w}×${h} · ${theme}`,
      })),
    ),
  );
  await writeFile(
    join(out, "inventory.json"),
    JSON.stringify(inventory, null, 2) + "\n",
  );
  for (const [name, role, email, path, selector] of cases) {
    await evaluate(
      `(async()=>{const r=await fetch('/api/v1/auth/demo-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:${JSON.stringify(email)}})});if(!r.ok)throw Error('LOGIN_FAILED');const j=await r.json();localStorage.setItem('codecash.accessToken',j.data.token);localStorage.setItem('scw.session.userId',j.data.user.id);localStorage.setItem('codecash.onboarding','done');localStorage.setItem('scw.language','vi');})()`,
    );
    for (const [width, height] of sizes) {
      await send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await send("Page.navigate", { url: base + path });
      await until(
        `!!document.querySelector('h1') && !!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector('.ant-spin-spinning')`,
      );
      await pause(300);
      for (const theme of themes) {
        if (
          (await evaluate("document.documentElement.dataset.theme")) !== theme
        ) {
          await evaluate(
            "document.querySelector('[data-testid=header-theme]').click()",
          );
          await until(
            `document.documentElement.dataset.theme === ${JSON.stringify(theme)}`,
          );
        }
        await pause(200);
        const id = `${name}-${width}-${theme}`;
        const layout = await evaluate(
          `({overflow:document.documentElement.scrollWidth>innerWidth+1,headings:[...document.querySelectorAll('h1')].filter(x=>x.checkVisibility()).map(x=>x.innerText),guideIntroTop:document.querySelector('article h2')?.getBoundingClientRect().top,tableTop:document.querySelector('.ant-table-thead')?.getBoundingClientRect().top,footerBottom:document.querySelector('[data-testid=positions-footer]')?.getBoundingClientRect().bottom,pdfWidth:document.querySelector('[data-pagearea]')?.getBoundingClientRect().width,canvasWidth:document.querySelector('[data-testid=signature-canvas]')?.clientWidth,canvasHeight:document.querySelector('[data-testid=signature-canvas]')?.clientHeight,viewport:innerHeight})`,
        );
        const buttons = await evaluate(`(${inspectButtons.toString()})()`);
        const issues = [];
        if (layout.overflow) issues.push("PAGE_HORIZONTAL_OVERFLOW");
        if (layout.headings.length !== 1) issues.push("MULTIPLE_PAGE_HEADINGS");
        if (name === "guide" && layout.guideIntroTop > height - 100)
          issues.push("GUIDE_INTRO_BELOW_FOLD");
        if (
          name === "contracts" &&
          width === 390 &&
          layout.tableTop > height * 0.75
        )
          issues.push("CONTRACT_TABLE_BELOW_FOLD");
        if (
          name === "positions" &&
          width > 1100 &&
          layout.footerBottom > height
        )
          issues.push("SIGNATURE_ACTIONS_BELOW_FOLD");
        if (name === "positions" && layout.canvasHeight < 380)
          issues.push("SIGNATURE_CANVAS_TOO_SHORT");
        if (name === "positions" && layout.pdfWidth < layout.canvasWidth * 0.85)
          issues.push("SIGNATURE_DOCUMENT_TOO_SMALL");
        for (const b of buttons.filter((b) => b.issue))
          issues.push(`${b.label}: ${b.issue}`);
        const screenshot = await send("Page.captureScreenshot", {
          format: "png",
        });
        await writeFile(
          join(out, id + ".png"),
          Buffer.from(screenshot.data, "base64"),
        );
        captured.push({
          id,
          role,
          title: `${name} · ${width}×${height} · ${theme}`,
          file: id + ".png",
          original: id + ".png",
          path,
          annotations: [],
        });
        audit.push({ id, layout, buttons, issues });
        failures.push(...issues.map((issue) => ({ id, issue })));
      }
    }
    console.log("Reviewed", name);
  }
} finally {
  await writeFile(
    join(out, "captured.json"),
    JSON.stringify(captured, null, 2) + "\n",
  );
  await writeFile(
    join(out, "failures.json"),
    JSON.stringify(failures, null, 2) + "\n",
  );
  await writeFile(
    join(out, "layout-audit.json"),
    JSON.stringify(audit, null, 2) + "\n",
  );
  await writeVisualReport(out);
  ws?.close();
  chrome.kill();
  await pause(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
console.log(
  `Visual review: ${captured.length} captures; ${failures.length} issues.`,
);
if (process.env.VISUAL_ASSERT === "1")
  assert.equal(failures.length, 0, "VISUAL_REVIEW_FAILED");
