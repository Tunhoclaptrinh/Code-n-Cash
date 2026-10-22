/** Browser regression smoke using Chrome DevTools Protocol; no extra browser framework is required. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  await until("!!document.querySelector('input[autocomplete=username]')");
  await evaluate(
    "document.querySelector('input[autocomplete=username]').focus()",
  );
  await send("Input.insertText", { text: "admin@novaan.vn" });
  await evaluate(
    "document.querySelector('input[autocomplete=current-password]').focus()",
  );
  await send("Input.insertText", { text: "Passw0rd!" });
  await evaluate("document.querySelector('button[type=submit]').click()");
  await until("location.pathname!='/login'");
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
    `Browser smoke passed: login, ${screens.length} screens, desktop/mobile layout, upload validation, resource tabs, unsigned PDF handling.`,
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
