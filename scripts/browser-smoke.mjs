/** Browser regression smoke using Chrome DevTools Protocol; no extra browser framework is required. */
import assert from "node:assert/strict";
import { inspectButtons } from "./lib/button-audit.mjs";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const base = process.env.WEB_URL ?? "http://127.0.0.1:5173";
// These scripts perform workflow writes; never inherit a shared Mongo database from .env.
const health = await fetch(`${base}/api/v1/health`).then(async (response) => {
  if (!response.ok) throw new Error(`TEST_API_NOT_READY: ${response.status}`);
  return response.json();
});
if ((health.data?.storage ?? health.storage) !== "file") {
  throw new Error(
    "ISOLATED_FILE_STORAGE_REQUIRED: start the test API with STORAGE_DRIVER=file and a fresh DATA_DIR in /tmp.",
  );
}
const profile = await mkdtemp(join(tmpdir(), "codecash-browser-"));
const chrome = spawn(
  process.env.CHROME_BIN ?? "google-chrome",
  [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      port = (
        await readFile(join(profile, "DevToolsActivePort"), "utf8")
      ).split("\n")[0];
      break;
    } catch {
      await pause(100);
    }
  }
  if (!port) throw new Error("CHROME_START_FAILED");
  const tab = await (
    await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
      method: "PUT",
    })
  ).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let next = 0;
  const pending = new Map(),
    errors = [];
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const handler = pending.get(message.id);
      pending.delete(message.id);
      message.error
        ? handler.reject(message.error)
        : handler.resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown")
      errors.push(
        message.params.exceptionDetails.exception?.description ??
          message.params.exceptionDetails.text,
      );
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  async function until(expression) {
    for (let i = 0; i < 150; i++) {
      if (await evaluate(expression)) return;
      await pause(100);
    }
    throw new Error(
      "Timed out: " +
        expression +
        " at " +
        (await evaluate(
          "location.pathname + ' ' + document.body.innerText.slice(0, 500)",
        )) +
        " errors=" +
        errors.slice(-2).join(";"),
    );
  }
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  // A temporary directory outage must not hide demo sign-in or cache an empty success forever.
  await send("Network.setBlockedURLs", { urls: ["*auth/demo-accounts*"] });
  await send("Page.navigate", { url: base + "/login" });
  await until("!!document.querySelector('[data-testid=demo-accounts-error]')");
  assert.ok(
    await evaluate(
      "document.querySelector('[data-testid=demo-accounts]').getBoundingClientRect().width > 0",
    ),
    "demo account entry remains visible while the API is unavailable",
  );
  await send("Network.setBlockedURLs", { urls: [] });
  await until(
    "!document.querySelector('[data-testid=demo-accounts-error]') && !!document.querySelector('[data-testid=demo-accounts]:not(.ant-btn-loading)')",
  );
  await evaluate(
    "document.querySelector('[data-testid=demo-accounts]').click()",
  );
  await until(
    "document.querySelectorAll('[data-testid=demo-account]').length >= 9",
  );
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape" });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  // Demo menu (top right): picking an account fills the form and signs in at once.
  async function loginAs(email) {
    await evaluate("localStorage.removeItem('codecash.accessToken')");
    await send("Page.navigate", { url: base + "/login" });
    await until("!!document.querySelector('[data-testid=demo-accounts]')");
    await pause(400);
    await evaluate(
      "document.querySelector('[data-testid=demo-accounts]').click()",
    );
    await until("!!document.querySelector('[data-testid=demo-account]')");
    await evaluate(
      `Array.from(document.querySelectorAll('[data-testid=demo-account]')).find((x) => x.innerText.includes(${JSON.stringify(email)})).click()`,
    );
    await until("location.pathname!='/login'");
  }
  // The welcome belongs to the main screen, so the login page shows none.
  await until("!!document.querySelector('[data-testid=demo-accounts]')");
  await pause(500);
  assert.equal(
    await evaluate("!!document.querySelector('[data-testid=welcome-start]')"),
    false,
  );
  // Login help is available before choosing an account, including screenshot zoom.
  await evaluate(
    "document.querySelector('[data-testid=header-guide]').click()",
  );
  await until("!!document.querySelector('.ant-drawer-body article h2')");
  await until("!!document.querySelector('.ant-drawer-body img')?.complete");
  assert.ok(
    await evaluate(
      "document.querySelector('.ant-drawer-body img').naturalWidth > 0",
    ),
  );
  await evaluate("document.querySelector('.ant-drawer-body img').click()");
  await until("!!document.querySelector('.ant-image-preview')");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape" });
  await pause(400);
  await evaluate("document.querySelector('.ant-drawer-close')?.click()");
  await until("!document.querySelector('.ant-drawer-open')");
  await loginAs("admin@codecash.vn");
  assert.equal(await evaluate("location.pathname"), "/exceptions");
  // First visit after login: language and theme must be chosen, then the header tips show once.
  await until("!!document.querySelector('[data-testid=welcome-start]')");
  assert.equal(
    await evaluate(
      "document.querySelector('[data-testid=welcome-start]').disabled",
    ),
    true,
  );
  await evaluate(
    "document.querySelector('[data-testid=welcome-language-en]').click()",
  );
  await evaluate(
    "document.querySelector('[data-testid=welcome-theme-light]').click()",
  );
  await evaluate(
    "document.querySelector('[data-testid=welcome-start]').click()",
  );
  await until("!!document.querySelector('.cc-tip [data-testid=tips-done]')");
  await evaluate("document.querySelector('[data-testid=tips-done]').click()");
  assert.equal(
    await evaluate("localStorage.getItem('codecash.onboarding')"),
    "done",
  );
  // The controllers' queue holds the six Data Pack milestones with an unauthorised event.
  await until("document.querySelectorAll('.ant-table-row').length === 6");
  const screens = [];
  const buttonAudit = [];
  await mkdir("artifacts/browser", { recursive: true });
  async function checkButtons() {
    const buttons = await evaluate(`(${inspectButtons.toString()})()`);
    const context = await evaluate(
      "({route:location.pathname,theme:document.documentElement.dataset.theme,width:innerWidth})",
    );
    buttonAudit.push({ ...context, buttons });
    await writeFile(
      "artifacts/browser/button-audit.json",
      JSON.stringify(buttonAudit, null, 2),
    );
    if (
      [
        "/platform/organizations",
        "/platform/contract-templates",
        "/platform/rule-versions",
        "/contracts/new",
      ].includes(context.route)
    ) {
      const capture = await send("Page.captureScreenshot", { format: "png" });
      await writeFile(
        `artifacts/browser/buttons-${context.route.slice(1).replaceAll("/", "-")}-${context.theme}-${buttonAudit.length}.png`,
        Buffer.from(capture.data, "base64"),
      );
    }
    assert.deepEqual(
      buttons.filter((b) => b.issue),
      [],
      JSON.stringify(context),
    );
  }
  async function checkBothThemes() {
    const initial = await evaluate("document.documentElement.dataset.theme");
    await checkButtons();
    await evaluate(
      "document.querySelector('[data-testid=header-theme]').click()",
    );
    await until(
      `document.documentElement.dataset.theme !== ${JSON.stringify(initial)}`,
    );
    await pause(250);
    await checkTableActions();
    await checkButtons();
    await evaluate(
      "document.querySelector('[data-testid=header-theme]').click()",
    );
    await until(
      `document.documentElement.dataset.theme === ${JSON.stringify(initial)}`,
    );
    await pause(250);
  }
  async function checkTableActions() {
    const layout = await evaluate(`(() => ({
      actions: [...document.querySelectorAll('[data-testid=table-row-actions]')].map(el => {
        const r = el.getBoundingClientRect(), buttons = [...el.querySelectorAll('button')];
        return { width:r.width, height:r.height, labelled:buttons.every(b => !!b.getAttribute('aria-label')?.trim()),
          aligned:buttons.every(b => Math.abs(b.getBoundingClientRect().top - buttons[0].getBoundingClientRect().top) < 1) };
      }),
      toolbar: [...document.querySelectorAll('.data-table-wrapper .codecash-btn, .data-table-wrapper button.ant-btn-primary')]
        .filter(b => !b.closest('td') && !b.disabled && b.getBoundingClientRect().width > 0)
        .map(b => ({label:b.innerText.trim(), color:getComputedStyle(b).color, background:getComputedStyle(b).backgroundColor})),
    }))()`);
    assert.ok(
      layout.actions.every(
        (a) => a.width <= 70 && a.height <= 34 && a.labelled && a.aligned,
      ),
      "compact labelled row actions stay on one line",
    );
    assert.ok(
      layout.toolbar.every((b) => b.label && b.color !== b.background),
      "toolbar buttons retain visible labels and distinct foreground/background",
    );
  }
  async function visit(route) {
    await send("Page.navigate", { url: base + route });
    await until("document.querySelectorAll('.ant-layout').length>0");
    await until(
      "!document.querySelector('.ant-spin-spinning, .ant-skeleton-active')",
    );
    if (route === "/contracts")
      await until("document.body.innerText.includes('CT0001')");
    if (route === "/contracts/CT0019/milestones/3/decision")
      await until("document.body.innerText.includes('PR00')");
    if (route === "/data")
      await until("document.body.innerText.includes('405')");
    await pause(200);
    const screen = await evaluate(
      "({route:location.pathname,text:document.body.innerText,overflow:document.documentElement.scrollWidth>innerWidth})",
    );
    assert.equal(
      screen.text.includes("Could not load this page"),
      false,
      route,
    );
    assert.equal(
      screen.text.includes("Unable to display this page"),
      false,
      route,
    );
    assert.equal(screen.overflow, false, route);
    await checkTableActions();
    await checkBothThemes();
    screens.push({ route: screen.route, overflow: screen.overflow });
    if (route === "/contracts") assert.ok(screen.text.includes("CT0001"));
    if (route === "/contracts/CT0019/milestones/3/decision")
      assert.ok(screen.text.includes("PR00"));
    const screenshot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(
      `artifacts/browser/${route.slice(1).replaceAll("/", "-")}.png`,
      Buffer.from(screenshot.data, "base64"),
    );
    if (route === "/data") assert.ok(screen.text.includes("405"));
  }
  async function visitMobile(routes) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: false,
    });
    for (const route of routes) {
      await send("Page.navigate", { url: base + route });
      await until("document.querySelectorAll('.ant-layout').length>0");
      await pause(700);
      await checkBothThemes();
      const overflow = await evaluate(
        "document.documentElement.scrollWidth>innerWidth",
      );
      assert.equal(overflow, false, `mobile: ${route}`);
      if (route.startsWith("/guide/"))
        assert.ok(
          await evaluate(
            "document.querySelector('[data-testid=guide-demo-contracts],article h2').getBoundingClientRect().top < 500",
          ),
          `mobile guide content visible without scrolling past navigation: ${route}`,
        );
      screens.push({ route, width: 390, overflow });
      const screenshot = await send("Page.captureScreenshot", {
        format: "png",
      });
      await writeFile(
        `artifacts/browser/mobile-${route.slice(1).replaceAll("/", "-")}.png`,
        Buffer.from(screenshot.data, "base64"),
      );
    }
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
  for (const route of [
    "/exceptions",
    "/tasks",
    "/contracts",
    "/contracts/CT0101/sign-positions",
    "/contracts/CT0101/digitize",
    "/contracts/CT0102/signing",
    "/verify/CT0103",
    "/contracts/CT0103",
    "/contracts/CT0019",
    "/approvals/CT0103/2",
    "/contracts/CT0019/milestones/3/decision",
    "/contracts/CT0090/milestones/3/decision",
    "/contracts/CT0019/milestones/3/dispute",
    "/activity-log",
    "/integrity",
    "/data",
  ])
    await visit(route);
  // Each language must load every guide, with real screenshot assets rather than broken images.
  const guideTopics = [
    "start",
    "roles",
    "tables",
    "tasks",
    "contracts",
    "decision",
    "evidence",
    "approval",
    "dispute",
    "signing",
    "exceptions",
    "integrity",
    "activity",
    "data",
    "admin",
  ];
  let guidesValidated = 0;
  for (const language of ["en", "vi"]) {
    await evaluate(`localStorage.setItem('scw.language', '${language}')`);
    for (const topic of guideTopics) {
      const markdown = await readFile(
        `apps/web/src/guide/${language}/${topic}.md`,
        "utf8",
      );
      const title = markdown.split("\n")[0].replace(/^# /, "");
      await send("Page.navigate", { url: `${base}/guide/${topic}` });
      await until(
        `document.querySelector('article h2')?.textContent === ${JSON.stringify(title)}`,
      );
      await until(
        "[...document.querySelectorAll('article img')].length > 0 && [...document.querySelectorAll('article img')].every(img => img.complete && img.naturalWidth > 0)",
      );
      assert.equal(
        await evaluate("document.documentElement.scrollWidth > innerWidth"),
        false,
        `${language}/${topic}`,
      );
      guidesValidated++;
    }
  }
  await visitMobile(["/guide/start", "/guide/decision"]);
  await send("Page.navigate", { url: base + "/contracts" });
  await until("document.querySelectorAll('.ant-table-row').length === 10");
  await until(
    "Array.from(document.querySelectorAll('.data-table-wrapper button')).some(button => button.innerText.trim() === 'Xuất')",
  );
  await evaluate("localStorage.setItem('scw.language', 'en')");
  // Integrity check: audit chain, sealed evidence and every decision re-run are intact.
  await send("Page.navigate", { url: base + "/integrity" });
  await until(
    "document.querySelectorAll('[data-testid=verdict-ok]').length === 4",
  );
  // Replay: the engine re-evaluates CT0019 milestone 3 after each of its four events.
  await send("Page.navigate", {
    url: base + "/contracts/CT0019/milestones/3/decision",
  });
  // The trace section is collapsed by default: open it first.
  await until("!!document.querySelector('[data-testid=trace-details]')");
  await evaluate(
    "document.querySelector('[data-testid=trace-details] .ant-collapse-header').click()",
  );
  await until("!!document.querySelector('[data-testid=replay-timeline]')");
  await evaluate(
    "document.querySelector('[data-testid=replay-timeline]').click()",
  );
  await until(
    "document.querySelectorAll('[data-testid=replay-table] .ant-table-row').length >= 4",
  );
  // Search without accents is sent to the API; the list shrinks to the one matching contract.
  await send("Page.navigate", { url: base + "/contracts" });
  await until("document.querySelectorAll('.ant-table-row').length === 10");
  await evaluate(
    "document.querySelector('.data-table-wrapper input.ant-input').focus()",
  );
  await send("Input.insertText", { text: "phong thuc hanh" });
  await until(
    "document.querySelectorAll('.ant-table-row').length === 1 && document.querySelector('.ant-table-row').innerText.includes('CT0101')",
  );
  // The export holds exactly what the table shows: here the one matching contract.
  const downloads = join(profile, "downloads");
  await mkdir(downloads, { recursive: true });
  await send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloads,
  });
  await evaluate(
    "document.querySelector('.data-table-wrapper button .anticon-download').closest('button').click()",
  );
  await until("!!document.querySelector('.ant-modal-footer')");
  await pause(300);
  await evaluate(
    "Array.from(document.querySelectorAll('.ant-modal-footer button')).at(-1).click()",
  );
  let exported = "";
  for (let i = 0; i < 50 && !exported; i++) {
    await pause(100);
    exported = await readFile(join(downloads, "contracts.csv"), "utf8").catch(
      () => "",
    );
  }
  const lines = exported.trim().split(/\r?\n/);
  assert.equal(lines.length, 2, exported);
  assert.ok(lines[1].includes("CT0101"));
  // Contract list: the code opens the record in a modal that can fill the screen.
  await send("Page.navigate", { url: base + "/contracts" });
  await until("document.querySelectorAll('.ant-table-row').length > 0");
  // Uploading is drafting (contracts:draft-write), which the admin does not hold.
  assert.equal(
    await evaluate(
      "!!document.querySelector('[data-testid=upload-contract-link]')",
    ),
    false,
  );
  await until(
    "Array.from(document.querySelectorAll('.ant-table-row div[style*=pointer]')).some((x) => x.innerText.includes('CT0001'))",
  );
  await evaluate(
    "Array.from(document.querySelectorAll('.ant-table-row div[style*=pointer]')).find((x) => x.innerText.includes('CT0001')).click()",
  );
  await until("!!document.querySelector('[data-testid=modal-fullscreen]')");
  await until("!!document.querySelector('.ant-modal .ant-tabs')");
  await evaluate(
    "document.querySelector('[data-testid=modal-fullscreen]').click()",
  );
  // The modal grows with an animation; wait for it instead of a fixed delay.
  await until(
    "Math.round(document.querySelector('.ant-modal').getBoundingClientRect().width) === innerWidth",
  );
  await evaluate("document.querySelector('.ant-modal-close').click()");
  await until(
    "!document.querySelector('.ant-modal-wrap:not([style*=none]) .ant-modal')",
  );
  // Data Pack from scratch: upload the five data files, run, see 405 rows.
  await send("Page.navigate", { url: base + "/data" });
  await until("!!document.querySelector('[data-testid=dataset-upload]')");
  await evaluate(
    "document.querySelector('[data-testid=dataset-upload]').click()",
  );
  await until("!!document.querySelector('.ant-modal input[type=file]')");
  const { root } = await send("DOM.getDocument");
  const { nodeId } = await send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: ".ant-modal input[type=file]",
  });
  await send("DOM.setFileInputFiles", {
    nodeId,
    files: [
      "contracts",
      "parties",
      "milestones",
      "events",
      "payment_rules",
    ].map((name) =>
      resolve(
        `BangD-Case4/DataPack-CASE4_SmartContractWorkflow/01_data/${name}.csv`,
      ),
    ),
  });
  await until(
    "document.querySelectorAll('.ant-upload-list-item').length === 5",
  );
  await evaluate(
    "Array.from(document.querySelectorAll('.ant-modal-footer button')).at(-1).click()",
  );
  await until("!!document.querySelector('[data-testid=dataset-checklist]')");
  await evaluate(
    "document.querySelector('[data-testid=data-evaluate]').click()",
  );
  await until(
    "document.body.innerText.includes('405') && !!document.querySelector('[data-testid=data-download]:not([disabled])')",
  );
  const removed = await evaluate(`(async () => {
    const headers = { Authorization: 'Bearer ' + localStorage.getItem('codecash.accessToken') };
    const list = await (await fetch('/api/v1/engine/datasets', { headers })).json();
    for (const d of list.data) await fetch('/api/v1/engine/datasets/' + d.id, { method: 'DELETE', headers });
    return list.data.length;
  })()`);
  assert.ok(removed >= 1);
  await visitMobile([
    "/exceptions",
    "/contracts",
    "/contracts/CT0103",
    "/approvals/CT0103/2",
    "/contracts/CT0019/milestones/3/decision",
    "/contracts/CT0019/milestones/3/dispute",
    "/activity-log",
    "/integrity",
    "/data",
  ]);
  // System administrator (SoD-1): accounts and configuration, no contract data.
  await loginAs("sysadmin@codecash.vn");
  assert.equal(await evaluate("location.pathname"), "/platform/organizations");
  for (const route of [
    "/platform/organizations",
    "/platform/users",
    "/platform/milestone-templates",
    "/platform/contract-templates",
    "/platform/rule-versions",
    "/platform/documents",
    "/platform/permissions",
  ])
    await visit(route);
  await send("Page.navigate", { url: base + "/platform/organizations" });
  await until("!!document.querySelector('.ant-tabs-tab[data-node-key=users]')");
  await evaluate(
    "window.__navigationProbe = true; document.querySelector('.ant-tabs-tab[data-node-key=users]').click()",
  );
  await until("location.pathname === '/platform/users'");
  assert.equal(await evaluate("window.__navigationProbe"), true);
  // Base CRUD: create through FormModal, find it in the table, delete through ConfirmModal.
  const orgName = `Smoke Org ${Date.now()}`;
  await send("Page.navigate", { url: base + "/platform/organizations" });
  await until(
    "!!document.querySelector('.data-table-wrapper .codecash-btn-primary')",
  );
  await pause(400);
  await evaluate(
    "document.querySelector('.data-table-wrapper .codecash-btn-primary').click()",
  );
  await until("!!document.querySelector('.ant-modal input#name')");
  await checkBothThemes();
  for (const [id, value] of [
    ["name", orgName],
    ["code", `SMK${Date.now() % 100000}`],
  ]) {
    await evaluate(`document.querySelector('.ant-modal input#${id}').focus()`);
    await send("Input.insertText", { text: value });
  }
  await evaluate(
    "document.querySelector('.ant-modal #kind').closest('.ant-select').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))",
  );
  await until("!!document.querySelector('.ant-select-item-option')");
  await evaluate("document.querySelector('.ant-select-item-option').click()");
  await evaluate(
    "Array.from(document.querySelectorAll('.ant-modal-footer button')).at(-1).click()",
  );
  await until(`document.body.innerText.includes(${JSON.stringify(orgName)})`);
  await evaluate(
    `(() => { const row = Array.from(document.querySelectorAll('.ant-table-row')).find((r) => r.innerText.includes(${JSON.stringify(orgName)})); row.querySelector('.ant-checkbox-input').click(); })()`,
  );
  await until(
    "!!document.querySelector('.data-table-wrapper .ant-badge .ant-btn')",
  );
  await evaluate(
    "document.querySelector('.data-table-wrapper .ant-badge .ant-btn').click()",
  );
  await until("!!document.querySelector('.ant-dropdown-menu-item-danger')");
  await evaluate(
    "document.querySelector('.ant-dropdown-menu-item-danger').click()",
  );
  // ConfirmModal is the last modal opened; its submit is the last footer button.
  await until("document.querySelectorAll('.ant-modal-footer').length > 1");
  await pause(300);
  await evaluate(
    "Array.from(Array.from(document.querySelectorAll('.ant-modal-footer')).at(-1).querySelectorAll('button')).at(-1).click()",
  );
  await until(`!document.body.innerText.includes(${JSON.stringify(orgName)})`);
  await visitMobile(["/platform/organizations", "/platform/permissions"]);
  // Auditor: reads everything, starts on the integrity check, has no create button anywhere.
  await loginAs("auditor@codecash.vn");
  assert.equal(await evaluate("location.pathname"), "/integrity");
  await until(
    "document.querySelectorAll('[data-testid=verdict-ok]').length === 4",
  );
  await send("Page.navigate", { url: base + "/platform/organizations" });
  await until("document.querySelectorAll('.ant-table-row').length > 0");
  assert.equal(
    await evaluate(
      "!!document.querySelector('.data-table-wrapper .codecash-btn-primary')",
    ),
    false,
  );
  // Finance approves CT0103 delivery on screen; the engine answers PENALTY (two days late).
  await loginAs("finance@novaan.vn");
  await send("Page.navigate", { url: base + "/tasks" });
  await until("document.body.innerText.includes('CT0103')");
  await send("Page.navigate", { url: base + "/approvals/CT0103/2" });
  await until(
    "!!document.querySelector('[data-testid=approve-payment]:not([disabled])')",
  );
  await evaluate(
    "document.querySelector('[data-testid=approve-payment]').click()",
  );
  await until("!!document.querySelector('.ant-modal-footer .ant-btn-primary')");
  await pause(300);
  await evaluate(
    "document.querySelector('.ant-modal-footer .ant-btn-primary').click()",
  );
  await until(
    "location.pathname === '/contracts/CT0103/milestones/2/decision'",
  );
  await until(
    "document.body.innerText.includes('PENALTY') && document.body.innerText.includes('PR00')",
  );
  // The buyer's contract officer: the upload form refuses an empty title.
  await loginAs("legal@novaan.vn");
  await send("Page.navigate", { url: base + "/contracts/new" });
  await until("!!document.querySelector('#contract-title')");
  assert.equal(
    await evaluate("document.body.innerText.includes('policyHint.undefined')"),
    false,
  );

  await evaluate(
    `(() => { const input = document.querySelector('#contract-title'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  );
  await pause(100);
  await evaluate(
    "Array.from(document.querySelectorAll('form button')).at(-1).click()",
  );
  await until("!!document.querySelector('.ant-form-item-explain-error')");
  assert.equal(await evaluate("location.pathname"), "/contracts/new");
  assert.ok(
    await evaluate(
      "document.querySelectorAll('[data-testid=signer-row]').length === 0",
    ),
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-testid=contract-document-body]').value",
    ),
    "",
  );
  await checkBothThemes();
  await evaluate("document.querySelector('#contract-title').focus()");
  await send("Input.insertText", { text: "Keep my manually entered title" });
  await evaluate(
    "document.querySelector('[data-testid=contract-fill-demo]').click()",
  );
  await until(
    "document.querySelectorAll('[data-testid=signer-row]').length === 2",
  );
  assert.equal(
    await evaluate("document.querySelector('#contract-title').value"),
    "Keep my manually entered title",
  );
  assert.equal(await evaluate("location.pathname"), "/contracts/new");
  assert.equal(
    await evaluate(
      "document.querySelector('form').querySelectorAll('[data-testid=contract-fill-demo], [data-testid=demo-fill]').length",
    ),
    1,
    "one sample action for the whole form",
  );
  // Four signers fit their row; direct actions reorder and remove the actual selected people.
  await evaluate(
    "document.querySelector('[data-testid=contract-template-picker] [role=combobox]').dispatchEvent(new MouseEvent('mousedown', {bubbles:true}))",
  );
  await until(
    "!!document.querySelector('[data-testid=template-option-THREE_PARTY]')",
  );
  await evaluate(
    "document.querySelector('.ant-select-dropdown [data-testid=template-option-THREE_PARTY]').click()",
  );
  await until(
    "document.querySelectorAll('[data-testid=signer-row]').length === 3",
  );
  await evaluate("document.querySelector('[data-testid=signer-add]').click()");
  await until(
    "document.querySelectorAll('[data-testid=signer-row]').length === 4",
  );
  await evaluate(
    "document.querySelector('[data-testid=contract-fill-demo]').click()",
  );
  await until(
    "document.querySelectorAll('[data-testid=signer-row] .ant-select-selection-placeholder').length === 0",
  );
  await checkBothThemes();
  const firstSigner = await evaluate(
    "document.querySelector('[data-testid=signer-row]') .querySelectorAll('.ant-select')[1].innerText",
  );
  await evaluate("document.querySelector('[data-testid=signer-down]').click()");
  await until(
    "document.querySelectorAll('[data-testid=signer-row]')[1].querySelectorAll('.ant-select')[1].innerText === " +
      JSON.stringify(firstSigner),
  );
  for (const width of [1440, 1280, 1024, 390]) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await pause(250);
    const layout = await evaluate(`(() => {
      const rows = [...document.querySelectorAll('[data-testid=signer-row]')];
      return { overflow: document.documentElement.scrollWidth > innerWidth + 1,
        rows: rows.map(row => { const r = row.getBoundingClientRect(); const items = [...row.children].map(x => x.getBoundingClientRect());
          return { width: r.width, height: r.height, inside: items.every(x => x.left >= r.left - 1 && x.right <= r.right + 1),
            aligned: items.every(x => Math.abs((x.top + x.bottom) / 2 - (r.top + r.bottom) / 2) < 2) }; }) };
    })()`);
    assert.equal(
      layout.overflow,
      false,
      `contract form has no horizontal overflow at ${width}`,
    );
    assert.ok(
      layout.rows.every(
        (row) => row.inside && (row.width <= 520 || row.aligned),
      ),
      `signer controls fit at ${width}`,
    );
    assert.ok(
      layout.rows.every((row) => row.height <= (row.width <= 520 ? 82 : 40)),
      `compact signer height at ${width}`,
    );
    if (width === 390 || width === 1440) {
      await evaluate(
        "document.querySelector('[data-testid=template-and-signers]').scrollIntoView({block: 'start'})",
      );
      const screen = await send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      await writeFile(
        `artifacts/browser/compact-signers-${width}.png`,
        Buffer.from(screen.data, "base64"),
      );
    }
  }
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(
    "document.querySelectorAll('[data-testid=signer-remove]')[1].click()",
  );
  await until(
    "document.querySelectorAll('[data-testid=signer-row]').length === 3",
  );
  await evaluate(
    "document.querySelector('[data-testid=contract-template-picker] [role=combobox]').dispatchEvent(new MouseEvent('mousedown', {bubbles:true}))",
  );
  await until(
    "!!document.querySelector('[data-testid=template-option-SINGLE_SIGNER]')",
  );
  await evaluate(
    "document.querySelector('.ant-select-dropdown [data-testid=template-option-SINGLE_SIGNER]').click()",
  );
  await until(
    "document.querySelectorAll('[data-testid=signer-row]').length === 1",
  );
  await evaluate(
    "document.querySelector('[data-testid=generate-contract-sample]').click()",
  );
  await until("document.body.innerText.includes('CodeCash-1-signers.docx')");
  assert.equal(
    await evaluate(
      "document.querySelector('#contract-title').value.length > 0",
    ),
    true,
  );
  // Generated bytes must not silently keep old terms after a form edit.
  await evaluate(
    "document.querySelector('[data-testid=contract-document-body]').focus()",
  );
  await send("Input.insertText", {
    text: "Browser-specific additional clause",
  });
  await until(
    "!!document.querySelector('[data-testid=contract-document-stale]')",
  );
  await evaluate(
    "Array.from(document.querySelectorAll('form button')).at(-1).click()",
  );
  assert.equal(await evaluate("location.pathname"), "/contracts/new");
  await loginAs("sysadmin@codecash.vn");
  await send("Page.navigate", { url: base + "/platform/contract-templates" });
  await until(
    "!!document.querySelector('.ant-table-row[data-row-key=SINGLE_SIGNER]')",
  );
  await evaluate(
    "document.querySelector('.ant-table-row[data-row-key=SINGLE_SIGNER] td:last-child button').click()",
  );
  await until("!!document.querySelector('.ant-modal textarea#documentBody')");
  await checkBothThemes();
  await evaluate(
    `(() => {const input = document.querySelector('.ant-modal input#name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Browser-managed template'); input.dispatchEvent(new Event('input', {bubbles:true}));})()`,
  );
  await evaluate(
    "document.querySelector('.ant-modal textarea#documentBody').focus()",
  );
  await send("Input.insertText", {
    text: "Scope for {{title}} supplied by {{supplier}}",
  });
  await evaluate(
    "Array.from(document.querySelectorAll('.ant-modal-footer button')).at(-1).click()",
  );
  await until("!document.querySelector('.ant-modal')");
  await until("document.body.innerText.includes('Browser-managed template')");
  await loginAs("legal@novaan.vn");
  await send("Page.navigate", { url: base + "/contracts/new" });
  await until(
    "!!document.querySelector('[data-testid=contract-template-picker]')",
  );
  await evaluate(
    "document.querySelector('[data-testid=contract-template-picker] [role=combobox]').dispatchEvent(new MouseEvent('mousedown', {bubbles:true}))",
  );
  await until(
    "!!document.querySelector('.ant-select-dropdown [data-testid=template-option-SINGLE_SIGNER]')",
  );
  assert.ok(
    await evaluate(
      "document.querySelector('.ant-select-dropdown [data-testid=template-option-SINGLE_SIGNER]').innerText.includes('Browser-managed template')",
    ),
  );
  await evaluate(
    "document.querySelector('.ant-select-dropdown [data-testid=template-option-SINGLE_SIGNER]').click()",
  );
  await until(
    "document.querySelector('[data-testid=contract-document-body]').value.includes('Scope for {{title}}')",
  );
  await loginAs("sysadmin@codecash.vn");
  await send("Page.navigate", { url: base + "/platform/rule-versions" });
  await until("!!document.querySelector('[data-testid=rule-version-create]')");
  await evaluate(
    "document.querySelector('[data-testid=rule-version-create]').click()",
  );
  await until("!!document.querySelector('.ant-modal input#name')");
  for (const [id, value] of [
    ["name", "Browser impact preview"],
    ["reason", "Verify a candidate without publishing"],
  ]) {
    await evaluate(`document.querySelector('.ant-modal #${id}').focus()`);
    await send("Input.insertText", { text: value });
  }
  await evaluate(
    "Array.from(document.querySelectorAll('.ant-modal-footer button')).at(-1).click()",
  );
  await until("!!document.querySelector('[data-testid=rule-version-preview]')");
  await checkBothThemes();
  await evaluate(
    "document.querySelector('[data-testid=rule-version-preview]').click()",
  );
  await until("!!document.querySelector('[data-testid=rule-preview-result]')");
  assert.ok(
    await evaluate(
      "document.querySelector('[data-testid=rule-preview-result]').innerText.includes('405')",
    ),
  );
  // The editor explains a single scope, uses the engine catalog and validates unsaved input.
  await evaluate(
    "Array.from(document.querySelectorAll('.ant-modal .ant-tabs-tab')).find(tab => /Rule expressions|Biểu thức quy tắc/.test(tab.innerText)).click()",
  );
  await until(
    "!!document.querySelector('[data-testid=rule-expression-editor]')",
  );
  await until("!!document.querySelector('[data-testid=rule-syntax-result]')");
  assert.ok(
    await evaluate(
      "document.querySelector('[data-testid=rule-syntax-result]').innerText.includes('384')",
    ),
  );
  await evaluate(
    "document.querySelector('[data-testid=rule-option-PR0006]').click()",
  );
  await until(
    "document.querySelector('[data-testid=rule-expression-penalty_amount_formula]').value.includes('MIN(')",
  );
  const expression = await evaluate(
    "document.querySelector('[data-testid=rule-expression-condition_expression]').value",
  );
  await evaluate(
    "document.querySelector('[data-testid=rule-expression-condition_expression]').focus(); document.querySelector('[data-testid=rule-expression-condition_expression]').select()",
  );
  await send("Input.insertText", { text: "open_dispute == 1" });
  await until(
    "document.querySelector('[data-testid=rule-expression-condition_expression]').value === 'open_dispute == 1'",
  );
  await until("!document.querySelector('[data-testid=rule-preview-result]')");
  assert.ok(
    await evaluate(
      "document.querySelector('[data-testid=rule-version-submit]').disabled",
    ),
  );
  await evaluate(
    "document.querySelector('[data-testid=rule-syntax-check]').click()",
  );
  await until(
    "document.querySelector('[data-testid=rule-syntax-result]')?.classList.contains('ant-alert-error')",
  );
  await until(
    "document.querySelector('[data-testid=rule-expression-condition_expression]').closest('.ant-form-item').querySelector('.ant-form-item-explain-error')?.innerText.includes('Type mismatch')",
  );
  await evaluate(
    "Array.from(document.querySelectorAll('.ant-modal button')).find(button => button.innerText.includes('Restore saved value')).click()",
  );
  await until(
    "document.querySelector('[data-testid=rule-expression-condition_expression]').value === " +
      JSON.stringify(expression),
  );
  await evaluate(
    "document.querySelector('[data-testid=rule-language-help]').click()",
  );
  await until(
    "!!document.querySelector('[data-testid=rule-variable-search] input')",
  );
  await evaluate(
    "document.querySelector('[data-testid=rule-variable-search] input').focus()",
  );
  await send("Input.insertText", { text: "penalty_amount_vnd_mn" });
  await until(
    "document.querySelectorAll('[data-testid=rule-variable-catalog] > div').length === 1",
  );
  assert.ok(
    await evaluate(
      "document.querySelector('[data-testid=rule-variable-catalog]').innerText.includes('Available only in the payable formula')",
    ),
  );
  await evaluate("document.querySelector('.ant-drawer-close').click()");
  await until("!document.querySelector('.ant-drawer-open')");
  await evaluate(
    "document.querySelector('[data-testid=rule-version-preview]').click()",
  );
  await until("!!document.querySelector('[data-testid=rule-preview-result]')");
  const ruleScreenshot = await send("Page.captureScreenshot", {
    format: "png",
  });
  await writeFile(
    "artifacts/browser/rule-preview.png",
    Buffer.from(ruleScreenshot.data, "base64"),
  );
  // The supplier sees its turn to sign CT0102 (three signers, the owner already signed).
  await loginAs("supplier@phuminh.vn");
  await until("document.body.innerText.includes('CT0102')");
  await send("Page.navigate", { url: base + "/guide/signing" });
  await until("document.querySelectorAll('article img').length > 0");
  await pause(500);
  const guideLayout = await evaluate(
    `(() => { const image = document.querySelector('article img'); const pane = document.querySelector('[role=region]'); return { maxHeight: image.getBoundingClientRect().height, viewport: innerHeight, overflow: getComputedStyle(pane).overflowY, scrollable: pane.scrollHeight > pane.clientHeight }; })()`,
  );
  assert.ok(guideLayout.maxHeight <= guideLayout.viewport);
  assert.equal(guideLayout.overflow, "auto");
  assert.equal(guideLayout.scrollable, true);
  await send("Page.navigate", { url: base + "/verify/CT0103" });
  await until("!!document.querySelector('input[type=file]')");
  await evaluate(`(() => {
    const input = document.querySelector('input[type=file]');
    const transfer = new DataTransfer();
    transfer.items.add(new File(['%PDF-1.4\\n/ByteRange [0 1 2 3]'], 'unsigned.pdf', {type:'application/pdf'}));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', {bubbles:true}));
  })()`);
  await until(
    "document.querySelector('[role=status]')?.innerText.includes('cryptographic signature and certificate have not been verified')",
  );
  const fake = { outcome: "UNVERIFIED" };
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/browser/button-audit.json",
    JSON.stringify(buttonAudit, null, 2),
  );
  await writeFile(
    "artifacts/browser/report.json",
    JSON.stringify(
      {
        screens,
        guidesValidated,
        screenshotZoom: true,
        errors,
        signatureCheck: fake,
      },
      null,
      2,
    ),
  );
  console.log(
    `Browser smoke passed: demo directory outage/recovery, demo login per role, onboarding after login, ${screens.length} screens, desktop/mobile layout, exception queue, server-side search, integrity check, replay, separated internal roles, approval → engine PENALTY, empty new contract, non-destructive demo fill, upload validation, single-signer DOCX generation, stale-document guard, admin template edit → upload catalog, rule impact preview, resource tabs, contract modal full screen, dataset upload/run, admin create/delete, unsigned PDF handling.`,
  );
} finally {
  ws?.close();
  chrome.kill("SIGTERM");
  await pause(300);
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
