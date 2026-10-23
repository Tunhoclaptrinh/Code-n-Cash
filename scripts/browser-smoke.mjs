/** Browser regression smoke using Chrome DevTools Protocol; no extra browser framework is required. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const base = process.env.WEB_URL ?? "http://127.0.0.1:5173";
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
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await pause(100);
    }
    throw new Error("Timed out: " + expression);
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
  await until("!document.querySelector('[data-testid=demo-accounts-error]')");
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
  await mkdir("artifacts/browser", { recursive: true });
  async function visit(route) {
    await send("Page.navigate", { url: base + route });
    await until("document.querySelectorAll('.ant-layout').length>0");
    await pause(route === "/data" || route === "/integrity" ? 1200 : 700);
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
      const overflow = await evaluate(
        "document.documentElement.scrollWidth>innerWidth",
      );
      assert.equal(overflow, false, `mobile: ${route}`);
      if (route.startsWith("/guide/"))
        assert.ok(
          await evaluate(
            "document.querySelector('article h2').getBoundingClientRect().top < 500",
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
    "Array.from(document.querySelectorAll('.data-table-wrapper button')).find((b) => b.innerText.trim() === 'Export').click()",
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
      "document.querySelectorAll('[data-testid=signer-list] .ant-row').length >= 2",
    ),
  );
  // The supplier sees its turn to sign CT0102 (three signers, the owner already signed).
  await loginAs("supplier@phuminh.vn");
  await until("document.body.innerText.includes('CT0102')");
  const fake = await evaluate(
    `(async()=>{const {checkFile}=await import('/src/features/signing/api/verification.api.ts');return checkFile(null,new File(['%PDF-1.4\\n/ByteRange [0 1 2 3]'],'unsigned.pdf'));})()`,
  );
  assert.equal(fake.outcome, "UNVERIFIED");
  assert.deepEqual(errors, []);
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
    `Browser smoke passed: demo directory outage/recovery, demo login per role, onboarding after login, ${screens.length} screens, desktop/mobile layout, exception queue, server-side search, integrity check, replay, separated internal roles, approval → engine PENALTY, upload validation, resource tabs, contract modal full screen, dataset upload/run, admin create/delete, unsigned PDF handling.`,
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
