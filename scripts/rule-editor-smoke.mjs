/** Browser regression smoke using Chrome DevTools Protocol; no extra browser framework is required. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const base = process.env.WEB_URL ?? "http://127.0.0.1:5173";
// Workflow scripts must never write into a shared Mongo deployment.
const health = await fetch(`${base}/api/v1/health`).then((r) => r.json());
if ((health.data?.storage ?? health.storage) !== "file")
  throw new Error(
    "ISOLATED_FILE_STORAGE_REQUIRED: use STORAGE_DRIVER=file and a fresh DATA_DIR in /tmp",
  );
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
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: base + "/login" });
  await until("!!document.querySelector('[data-testid=demo-accounts]')");
  await evaluate(
    "localStorage.setItem('codecash.onboarding','done'); localStorage.setItem('scw.language','en')",
  );
  await evaluate(
    "document.querySelector('[data-testid=demo-accounts]').click()",
  );
  await until("!!document.querySelector('[data-testid=demo-account]')");
  await evaluate(
    "Array.from(document.querySelectorAll('[data-testid=demo-account]')).find(x => x.innerText.includes('sysadmin@codecash.vn')).click()",
  );
  await until("location.pathname !== '/login'");
  await send("Page.navigate", { url: base + "/platform/rule-versions" });
  await until("!!document.querySelector('[data-testid=rule-version-create]')");
  await evaluate(
    "document.querySelector('[data-testid=rule-version-create]').click()",
  );
  await until("!!document.querySelector('.ant-modal input#name')");
  for (const [selector, text] of [
    [".ant-modal input#name", "Rule editor UI smoke"],
    [
      ".ant-modal textarea#reason",
      "Validate expressions and preview without publishing",
    ],
  ]) {
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).focus()`,
    );
    await send("Input.insertText", { text });
  }
  await evaluate(
    "Array.from(document.querySelectorAll('.ant-modal-footer button')).at(-1).click()",
  );
  await until("!!document.querySelector('[data-testid=rule-option-PR0006]')");
  assert.ok(
    await evaluate(
      "document.querySelector('[data-testid=rule-version-submit]').disabled",
    ),
  );
  await evaluate(
    "document.querySelector('[data-testid=rule-option-PR0006]').click()",
  );
  await evaluate(
    "document.querySelector('[data-testid=rule-version-preview]').click()",
  );
  await until("!!document.querySelector('[data-testid=rule-preview-result]')");
  assert.ok(
    await evaluate(
      "document.querySelector('[data-testid=rule-preview-result]').innerText.includes('405')",
    ),
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-testid=rule-version-submit]').disabled",
    ),
    false,
  );
  const condition = await evaluate(
    "document.querySelector('[data-testid=rule-expression-condition_expression]').value",
  );
  await evaluate(
    "document.querySelector('[data-testid=rule-expression-condition_expression]').focus(); document.querySelector('[data-testid=rule-expression-condition_expression]').select()",
  );
  await send("Input.insertText", { text: "open_dispute == 1" });
  await until(
    "document.querySelector('[data-testid=rule-expression-condition_expression]')?.value === 'open_dispute == 1'",
  );
  assert.ok(
    await evaluate(
      "document.querySelector('[data-testid=rule-option-PR0006]').getAttribute('aria-pressed') === 'true'",
    ),
  );
  assert.ok(
    await evaluate(
      "!document.querySelector('[data-testid=rule-preview-result]')",
    ),
  );
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
  assert.ok(
    await evaluate(
      "document.querySelector('.ant-form-item-explain-error').innerText.includes('Type mismatch')",
    ),
  );
  await evaluate(
    "Array.from(document.querySelectorAll('.ant-modal button')).find(x => x.innerText.includes('Restore saved value')).click()",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-testid=rule-expression-condition_expression]').value",
    ),
    condition,
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
  const originalPenalty = await evaluate(
    "document.querySelector('[data-testid=rule-expression-penalty_amount_formula]').value",
  );
  for (const [expression, message] of [
    ["planned_payment_vnd_mn + grace_period_days", "Unit mismatch"],
    [
      "days_late_after_grace * penalty_rate_pct_per_day * planned_payment_vnd_mn",
      "Unconverted percent",
    ],
  ]) {
    await evaluate(
      "document.querySelector('[data-testid=rule-expression-penalty_amount_formula]').focus(); document.querySelector('[data-testid=rule-expression-penalty_amount_formula]').select()",
    );
    await send("Input.insertText", { text: expression });
    await evaluate(
      "document.querySelector('[data-testid=rule-syntax-check]').click()",
    );
    await until(
      "document.querySelector('[data-testid=rule-syntax-result]')?.classList.contains('ant-alert-error')",
    );
    assert.ok(
      await evaluate(
        `document.querySelector('.ant-form-item-explain-error').innerText.includes(${JSON.stringify(message)})`,
      ),
    );
    assert.ok(
      await evaluate(
        "document.querySelector('[data-testid=rule-version-submit]').disabled",
      ),
    );
  }
  await evaluate(
    "Array.from(document.querySelectorAll('.ant-modal button')).find(x => x.innerText.includes('Restore saved value')).click()",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-testid=rule-expression-penalty_amount_formula]').value",
    ),
    originalPenalty,
  );
  const payable = await evaluate(
    "document.querySelector('[data-testid=rule-expression-payable_amount_formula]').value",
  );
  await evaluate(
    "document.querySelector('[data-testid=rule-expression-payable_amount_formula]').focus(); document.querySelector('[data-testid=rule-expression-payable_amount_formula]').select()",
  );
  await send("Input.insertText", {
    text: "MAX(0, planned_payment_vnd_mn - penalty_amount_vnd_mn - 0.01)",
  });
  await evaluate(
    "document.querySelector('[data-testid=rule-version-preview]').click()",
  );
  await until(
    "document.querySelector('[data-testid=rule-preview-result]')?.classList.contains('ant-alert-warning')",
  );
  assert.ok(
    await evaluate(
      "document.querySelector('[data-testid=rule-version-submit]').disabled",
    ),
  );
  await evaluate(
    "document.querySelector('.ant-modal .ant-collapse-header').click()",
  );
  await until(
    "document.querySelector('[data-testid=rule-impact-table]')?.innerText.includes('Payable:')",
  );
  await evaluate(
    "Array.from(document.querySelectorAll('.ant-modal button')).find(x => x.innerText.includes('Restore saved value')).click()",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[data-testid=rule-expression-payable_amount_formula]').value",
    ),
    payable,
  );
  await evaluate(
    "document.querySelector('[data-testid=rule-version-preview]').click()",
  );
  await until(
    "document.querySelector('[data-testid=rule-preview-result]')?.classList.contains('ant-alert-success')",
  );
  const layout = await evaluate(
    "(() => { const body=document.querySelector('.ant-modal-body'); return {width:body.clientWidth,scroll:body.scrollWidth,overflow:getComputedStyle(body).overflowY}; })()",
  );
  assert.ok(layout.scroll <= layout.width + 1);
  assert.equal(layout.overflow, "auto");
  await mkdir("artifacts/browser", { recursive: true });
  await writeFile(
    "artifacts/browser/rule-editor.png",
    Buffer.from(
      (await send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await pause(400);
  assert.ok(
    await evaluate("document.documentElement.scrollWidth <= innerWidth"),
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Rule editor browser smoke passed: full preview, edit invalidation, typed errors, stable selection, restore, glossary, desktop/mobile layout; no publishing.",
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
