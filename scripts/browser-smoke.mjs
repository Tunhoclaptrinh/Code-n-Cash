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
    await fetch(`http://127.0.0.1:${port}/json/new?${base}/login`, {
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
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  // The welcome belongs to the main screen, so the login page shows none.
  await until("!!document.querySelector('[data-testid=demo-accounts]')");
  await pause(500);
  assert.equal(
    await evaluate("!!document.querySelector('[data-testid=welcome-start]')"),
    false,
  );
  // Demo menu (top right): picking an account fills the form and signs in at once.
  await evaluate(
    "document.querySelector('[data-testid=demo-accounts]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); document.querySelector('[data-testid=demo-accounts]').click()",
  );
  await until("!!document.querySelector('[data-testid=demo-account]')");
  await evaluate(
    "Array.from(document.querySelectorAll('[data-testid=demo-account]')).find((x) => x.innerText.includes('admin@novaan.vn')).click()",
  );
  await until("location.pathname!='/login'");
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
  const routes = [
    "/contracts",
    "/contracts/new",
    "/contracts/CT0101/sign-positions",
    "/contracts/CT0101/digitize",
    "/contracts/CT0101/signing",
    "/verify/CT0101",
    "/contracts/CT0101",
    "/submissions/CT0101/2",
    "/approvals/CT0101/2",
    "/contracts/CT0101/milestones/2/decision",
    "/contracts/CT0101/milestones/2/dispute",
    "/activity-log",
    "/platform/organizations",
    "/platform/users",
    "/platform/documents",
    "/platform/permissions",
    "/data",
  ];
  const screens = [];
  await mkdir("artifacts/browser", { recursive: true });
  for (const route of routes) {
    await send("Page.navigate", { url: base + route });
    await until("document.querySelectorAll('.ant-layout').length>0");
    await pause(route === "/data" ? 1200 : 550);
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
    if (route === "/contracts") assert.ok(screen.text.includes("CT0101"));
    const screenshot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(
      `artifacts/browser/${route.slice(1).replaceAll("/", "-")}.png`,
      Buffer.from(screenshot.data, "base64"),
    );
    if (route === "/data") assert.ok(screen.text.includes("405"));
  }
  // Exercise the replaced form and SPA resource tabs without mutating business data.
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
  await send("Page.navigate", { url: base + "/platform/organizations" });
  await until("!!document.querySelector('.ant-tabs-tab[data-node-key=users]')");
  await evaluate(
    "window.__navigationProbe = true; document.querySelector('.ant-tabs-tab[data-node-key=users]').click()",
  );
  await until("location.pathname === '/platform/users'");
  assert.equal(await evaluate("window.__navigationProbe"), true);
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
    "Array.from(document.querySelectorAll('.ant-table-row div[style*=pointer]')).some((x) => x.innerText.includes('CT0101'))",
  );
  await evaluate(
    "Array.from(document.querySelectorAll('.ant-table-row div[style*=pointer]')).find((x) => x.innerText.includes('CT0101')).click()",
  );
  await until("!!document.querySelector('[data-testid=modal-fullscreen]')");
  await until("!!document.querySelector('.ant-modal .ant-tabs')");
  await evaluate(
    "document.querySelector('[data-testid=modal-fullscreen]').click()",
  );
  await pause(300);
  assert.equal(
    await evaluate(
      "Math.round(document.querySelector('.ant-modal').getBoundingClientRect().width) === innerWidth",
    ),
    true,
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
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const route of [
    "/contracts",
    "/contracts/new",
    "/contracts/CT0101",
    "/submissions/CT0101/2",
    "/approvals/CT0101/2",
    "/contracts/CT0101/milestones/2/decision",
    "/activity-log",
    "/platform/organizations",
    "/platform/permissions",
    "/data",
  ]) {
    await send("Page.navigate", { url: base + route });
    await until("document.querySelectorAll('.ant-layout').length>0");
    await pause(700);
    const overflow = await evaluate(
      "document.documentElement.scrollWidth>innerWidth",
    );
    assert.equal(overflow, false, `mobile: ${route}`);
    screens.push({ route, width: 390, overflow });
    const screenshot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(
      `artifacts/browser/mobile-${route.slice(1).replaceAll("/", "-")}.png`,
      Buffer.from(screenshot.data, "base64"),
    );
  }
  const fake = await evaluate(
    `(async()=>{const {checkFile}=await import('/src/features/signing/api/verification.api.ts');return checkFile(null,new File(['%PDF-1.4\\n/ByteRange [0 1 2 3]'],'unsigned.pdf'));})()`,
  );
  assert.equal(fake.outcome, "UNVERIFIED");
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/browser/report.json",
    JSON.stringify({ screens, errors, signatureCheck: fake }, null, 2),
  );
  console.log(
    `Browser smoke passed: demo login, onboarding after login, ${screens.length} screens, desktop/mobile layout, upload validation, resource tabs, contract modal full screen, dataset upload/run, admin create/delete, unsigned PDF handling.`,
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
