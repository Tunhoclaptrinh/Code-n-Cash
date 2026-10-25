/**
 * Screenshots of the user guide (apps/web/src/guide), taken from the running app with Chrome
 * DevTools Protocol, like scripts/browser-smoke.mjs. Each role signs in from the demo menu and does
 * the real actions, so every picture shows the state the guide describes. Red numbered boxes mark
 * the parts the guide text explains.
 *
 * Run against freshly imported data (the script approves, signs and resolves on the way):
 *   API: STORAGE_DRIVER=file API_PORT=3100 DATA_DIR=<empty folder> pnpm dev:api
 *   Web: VITE_API_PROXY=http://127.0.0.1:3100 pnpm --filter @codecash/web exec vite --port 5174 --strictPort
 *   WEB_URL=http://127.0.0.1:5174 pnpm guide:screenshots
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const base = process.env.WEB_URL ?? "http://127.0.0.1:5174";
const out = resolve(process.env.GUIDE_OUT ?? "apps/web/public/guide/images");
// Workflow scripts must never write into a shared Mongo deployment.
const health = await fetch(`${base}/api/v1/health`).then((r) => r.json());
if ((health.data?.storage ?? health.storage) !== "file")
  throw new Error(
    "ISOLATED_FILE_STORAGE_REQUIRED: use STORAGE_DRIVER=file and a fresh DATA_DIR in /tmp",
  );
const originalOut = resolve(
  process.env.GUIDE_ORIGINAL_OUT ?? "playwright-report/guide/originals",
);
const onlySteps = process.env.GUIDE_STEPS?.split(",");
const profile = await mkdtemp(join(tmpdir(), "codecash-guide-"));
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
const missing = [];
const taken = [];
let ws;

/* In the page: find an element by selector or visible text, and draw numbered boxes. */
const PAGE_HELPERS = String.raw`
window.__find = (spec) => {
  if (typeof spec === "string") return document.querySelector(spec);
  const scope = spec.scope ? document.querySelector(spec.scope) : document;
  if (!scope) return null;
  const nodes = [...scope.querySelectorAll(spec.tag || "*")].filter((n) => {
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && n.children.length <= (spec.children ?? 50);
  });
  const text = (n) => (n.innerText || "").trim();
  const hits = nodes.filter((n) =>
    spec.contains ? text(n).includes(spec.text) : text(n) === spec.text,
  );
  hits.sort((a, b) => {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return ra.width * ra.height - rb.width * rb.height;
  });
  const el = hits[spec.index ?? 0];
  return el && spec.up ? el.closest(spec.up) : el?.closest("button") || el;
};
window.__annotate = (items) => {
  document.getElementById("__guide_layer")?.remove();
  const layer = document.createElement("div");
  layer.id = "__guide_layer";
  layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483000";
  document.body.appendChild(layer);
  const lost = [];
  for (const item of items) {
    const el = window.__find(item.target);
    if (!el) { lost.push(JSON.stringify(item.target)); continue; }
    const r = el.getBoundingClientRect();
    const pad = item.pad ?? 4;
    const x = r.left + scrollX - pad, y = r.top + scrollY - pad;
    const box = document.createElement("div");
    box.style.cssText = "position:absolute;border:2.5px solid #f5222d;border-radius:8px;box-shadow:0 0 0 3px rgba(245,34,45,.18)";
    Object.assign(box.style, { left: x + "px", top: y + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
    const badge = document.createElement("div");
    badge.textContent = item.n;
    badge.style.cssText = "position:absolute;width:24px;height:24px;border-radius:50%;background:#f5222d;color:#fff;font:700 13px/24px system-ui,sans-serif;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.35)";
    const left = item.badge === "right" ? x + r.width + pad * 2 - 12 : x - 12;
    Object.assign(badge.style, { left: Math.max(2, left) + "px", top: Math.max(2, y - 12) + "px" });
    layer.append(box, badge);
  }
  return lost;
};
`;

try {
  let port;
  for (let attempt = 0; attempt < 100 && !port; attempt++) {
    port = await readFile(join(profile, "DevToolsActivePort"), "utf8")
      .then((text) => text.split("\n")[0])
      .catch(() => undefined);
    if (!port) await pause(100);
  }
  if (!port) throw new Error("CHROME_START_FAILED");
  const tab = await (
    await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
      method: "PUT",
    })
  ).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    ws.onopen = ok;
    ws.onerror = fail;
  });
  let next = 0;
  const pending = new Map();
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) return;
    const handler = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  };
  const send = (method, params = {}) =>
    new Promise((ok, fail) => {
      const id = ++next;
      pending.set(id, { resolve: ok, reject: fail });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        `${expression.slice(0, 120)} → ${JSON.stringify(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)}`,
      );
    return result.result.value;
  };
  async function until(expression, tries = 150) {
    for (let i = 0; i < tries; i++) {
      if (await evaluate(expression).catch(() => false)) return;
      await pause(100);
    }
    throw new Error("Timed out: " + expression);
  }
  const viewport = (width, height) =>
    send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  /** Navigates and waits until nothing is loading any more. */
  async function go(path, ready) {
    await send("Page.navigate", { url: base + path });
    await until("document.readyState === 'complete'");
    await until(
      "!document.querySelector('.ant-skeleton-active, .ant-spin-spinning, .ant-table-placeholder .ant-spin')",
    );
    if (ready) await until(ready);
    await pause(700);
  }
  const failures = [];
  /** Runs one capture step; a failure is reported and the next step still runs. */
  async function attempt(name, fn) {
    if (onlySteps && !onlySteps.includes(name)) return;
    try {
      await fn();
    } catch (error) {
      failures.push(`${name}: ${error.message.split("\n")[0].slice(0, 240)}`);
      await send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
      }).catch(() => {});
    }
  }
  async function click(target) {
    await evaluate(PAGE_HELPERS);
    await evaluate(`window.__find(${JSON.stringify(target)}).click()`);
  }
  /** A real mouse click at the element's centre (menus that open on pointer events). */
  async function press(target) {
    await evaluate(PAGE_HELPERS);
    const point = await evaluate(`(() => {
      const el = window.__find(${JSON.stringify(target)});
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"])
      await send("Input.dispatchMouseEvent", {
        type,
        x: point.x,
        y: point.y,
        button: "left",
        clickCount: 1,
      });
  }
  /**
   * Saves a WebP screenshot: the viewport, or one element (`clip`). `marks` are the numbered
   * boxes the guide refers to.
   */
  async function shot(name, { marks = [], clip, margin = 12 } = {}) {
    await evaluate(PAGE_HELPERS);
    if (clip)
      await evaluate(
        `window.__find(${JSON.stringify(clip)})?.scrollIntoView({block: "start"}); window.scrollBy(0, -80)`,
      );
    await pause(250);
    const params = { format: "webp", quality: 86 };
    if (clip) {
      const rect = await evaluate(`(() => {
        const r = window.__find(${JSON.stringify(clip)}).getBoundingClientRect();
        return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
      })()`);
      params.clip = {
        x: Math.max(0, rect.x - margin),
        y: Math.max(0, rect.y - margin),
        width: rect.width + margin * 2,
        height: rect.height + margin * 2,
        scale: 1,
      };
      params.captureBeyondViewport = true;
    }
    await mkdir(originalOut, { recursive: true });
    await evaluate("document.getElementById('__guide_layer')?.remove()");
    const original = await send("Page.captureScreenshot", params);
    await writeFile(
      join(originalOut, `${name}.webp`),
      Buffer.from(original.data, "base64"),
    );
    const lost = await evaluate(`window.__annotate(${JSON.stringify(marks)})`);
    for (const target of lost) missing.push(`${name}: ${target}`);
    const { data } = await send("Page.captureScreenshot", params);
    await writeFile(join(out, `${name}.webp`), Buffer.from(data, "base64"));
    await evaluate("document.getElementById('__guide_layer')?.remove()");
    taken.push(name);
  }
  async function loginAs(email) {
    await evaluate(
      "localStorage.removeItem('codecash.accessToken'); localStorage.removeItem('scw.session.userId')",
    );
    await go(
      "/login",
      "!!document.querySelector('[data-testid=demo-accounts]')",
    );
    await evaluate(
      "document.querySelector('[data-testid=demo-accounts]').click()",
    );
    await until("!!document.querySelector('[data-testid=demo-account]')");
    await evaluate(
      `Array.from(document.querySelectorAll('[data-testid=demo-account]')).find((x) => x.innerText.includes(${JSON.stringify(email)})).click()`,
    );
    await until("location.pathname !== '/login'");
    await until("!!document.querySelector('.ant-layout-sider')");
    await pause(800);
  }
  /** Expand wide trace tables so every column is readable when the guide image is zoomed. */
  async function wideShot(name, options) {
    const original = await evaluate(
      "({ width: innerWidth, height: innerHeight })",
    );
    try {
      await evaluate(`(() => {
        const page = document.querySelector('.ant-layout-content > div');
        if (page) {
          page.dataset.guideOriginalStyle = page.getAttribute('style') ?? '';
          page.style.maxWidth = 'none';
        }
      })()`);
      const growth = await evaluate(
        `Math.max(0, ...[...document.querySelectorAll('.ant-table-content, .ant-table-body')].map(el => el.scrollWidth - el.clientWidth))`,
      );
      await viewport(
        Math.max(3600, original.width + Math.ceil(growth) + 80),
        original.height,
      );
      await pause(400);
      await shot(name, options);
    } finally {
      await evaluate(`(() => {
        const page = document.querySelector('[data-guide-original-style]');
        if (page) {
          page.setAttribute('style', page.dataset.guideOriginalStyle);
          delete page.dataset.guideOriginalStyle;
        }
      })()`);
      await viewport(original.width, original.height);
    }
  }
  /** Calls a workflow action with the signed-in user's token (to set up a state, not to show it). */
  const api = (module, action, args) =>
    evaluate(`fetch('/api/v1/workflow/${module}/${action}', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + localStorage.getItem('codecash.accessToken') },
      body: JSON.stringify({ args: ${JSON.stringify(args)} }),
    }).then((r) => r.json())`);
  const sidebar = (role) =>
    shot(`nav-${role}`, { clip: ".ant-layout-sider", margin: 0 });

  await mkdir(out, { recursive: true });
  await mkdir(originalOut, { recursive: true });
  await send("Runtime.enable");
  await send("Page.enable");
  await viewport(1440, 900);
  await send("Page.navigate", { url: base + "/login" });
  await until("document.readyState === 'complete'");
  await evaluate(
    "localStorage.setItem('scw.language', 'vi'); localStorage.setItem('codecash.theme', 'light'); localStorage.removeItem('codecash.onboarding')",
  );

  /* ---------------------------- sign-in and first visit ---------------------------- */
  await attempt("login", async () => {
    await go(
      "/login",
      "!!document.querySelector('[data-testid=demo-accounts]')",
    );
    await shot("login", {
      marks: [
        { n: 1, target: "[data-testid=demo-accounts]" },
        { n: 2, target: "form" },
        { n: 3, target: "[data-testid=header-language]" },
      ],
    });
    await evaluate(
      "document.querySelector('[data-testid=demo-accounts]').click()",
    );
    await until("!!document.querySelector('[data-testid=demo-account]')");
    await pause(400);
    await shot("login-demo-menu", {
      marks: [
        { n: 1, target: ".ant-dropdown-menu-item-group" },
        { n: 2, target: { text: "Tất cả tổ chức trong Data Pack", up: "li" } },
      ],
    });
    await evaluate(
      `Array.from(document.querySelectorAll('[data-testid=demo-account]')).find((x) => x.innerText.includes('owner@novaan.vn')).click()`,
    );
    await until("!!document.querySelector('[data-testid=welcome-start]')");
    await pause(600);
    await shot("welcome", {
      marks: [
        { n: 1, target: "[data-testid=welcome-language-vi]" },
        { n: 2, target: "[data-testid=welcome-theme-light]" },
        { n: 3, target: "[data-testid=welcome-start]" },
      ],
    });
    await evaluate(
      "document.querySelector('[data-testid=welcome-language-vi]').click()",
    );
    await evaluate(
      "document.querySelector('[data-testid=welcome-theme-light]').click()",
    );
    await evaluate(
      "document.querySelector('[data-testid=welcome-start]').click()",
    );
    await until("!!document.querySelector('.cc-tip [data-testid=tips-done]')");
    await pause(500);
    await shot("header-tips", {
      marks: [
        { n: 1, target: "[data-testid=header-guide]" },
        { n: 2, target: "[data-testid=header-language]" },
        { n: 3, target: "[data-testid=header-theme]" },
        { n: 4, target: "[data-testid=header-notifications]" },
      ],
    });
    await evaluate("document.querySelector('[data-testid=tips-done]').click()");
    await pause(400);
  });

  /* -------------------------------- contract owner -------------------------------- */
  await attempt("owner lists", async () => {
    await go(
      "/tasks",
      "document.querySelectorAll('.ant-table-row').length > 0",
    );
    await shot("tasks-owner");
    await sidebar("owner");
    await go(
      "/contracts",
      "document.querySelectorAll('.ant-table-row').length > 0",
    );
    await shot("contracts", {
      marks: [
        { n: 1, target: ".data-table-wrapper .ant-row", pad: 2 },
        { n: 2, target: ".data-table-wrapper .ant-tabs-nav" },
        { n: 3, target: "[data-testid=upload-contract-link]" },
        { n: 4, target: ".data-table-wrapper .ant-input-affix-wrapper" },
        { n: 5, target: { text: "Bộ lọc" } },
        { n: 6, target: { text: "Làm mới" } },
        { n: 7, target: { text: "Xuất" } },
        {
          n: 8,
          target: ".ant-table-thead th:nth-child(5) .ant-table-filter-trigger",
          pad: 6,
        },
        { n: 9, target: ".ant-table-tbody .ant-table-row td:last-child" },
        { n: 10, target: "[data-testid=page-guide]" },
      ],
    });
  });
  // Shared table tools, shown once for every list.
  await attempt("filter builder", async () => {
    await go(
      "/contracts",
      "document.querySelectorAll('.ant-table-row').length > 0",
    );
    await click({ text: "Bộ lọc" });
    await until("!!document.querySelector('.filter-builder-container')");
    await pause(800);
    await press({ text: "Thêm điều kiện lọc", contains: true });
    await until(
      "!!document.querySelector('.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item')",
    );
    await pause(500);
    await evaluate(
      "document.querySelector('.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item').click()",
    );
    await until("!!document.querySelector('.filter-condition-item')");
    await pause(500);
    // Pick a value for the new condition so the picture shows a real filter.
    await press('.filter-condition-item div[style*="flex: 1"] .ant-select');
    await until(
      "!!document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')",
    );
    await press(
      ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option",
    );
    await pause(500);
    await shot("table-filter-builder", { clip: ".ant-modal" });
    await evaluate("document.querySelector('.ant-modal-close').click()");
    await pause(400);
  });
  await attempt("column filter", async () => {
    await go(
      "/contracts",
      "document.querySelectorAll('.ant-table-row').length > 0",
    );
    await evaluate(
      "document.querySelector('.ant-table-thead th:nth-child(5) .ant-table-filter-trigger').click()",
    );
    await until("!!document.querySelector('.ant-table-filter-dropdown')");
    await pause(300);
    await shot("table-column-filter");
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape" });
  });
  await attempt("export", async () => {
    await go(
      "/contracts",
      "document.querySelectorAll('.ant-table-row').length > 0",
    );
    await click({ text: "Xuất" });
    await until("!!document.querySelector('.ant-modal')");
    await pause(500);
    await shot("table-export", { clip: ".ant-modal" });
    await evaluate("document.querySelector('.ant-modal-close').click()");
    await pause(400);
  });
  await attempt("search", async () => {
    await go(
      "/contracts",
      "document.querySelectorAll('.ant-table-row').length === 10",
    );
    await evaluate(
      "document.querySelector('.data-table-wrapper input.ant-input').focus()",
    );
    await send("Input.insertText", { text: "thiet bi" });
    await until(
      "document.querySelectorAll('.ant-table-row').length > 0 && document.querySelectorAll('.ant-table-row').length < 10",
    );
    await pause(400);
    await shot("table-search", {
      marks: [
        { n: 1, target: ".data-table-wrapper .ant-input-affix-wrapper" },
        { n: 2, target: { text: "Tổng:", contains: true, children: 2 } },
      ],
    });
  });
  await attempt("contract modal", async () => {
    await go(
      "/contracts",
      "document.querySelectorAll('.ant-table-row').length > 0",
    );
    await evaluate(
      "Array.from(document.querySelectorAll('.ant-table-row div[style*=pointer]')).find((x) => x.innerText.includes('CT0019')).click()",
    );
    await until("!!document.querySelector('[data-testid=modal-fullscreen]')");
    await pause(600);
    await shot("contract-modal", {
      marks: [{ n: 1, target: "[data-testid=modal-fullscreen]" }],
    });
    await evaluate("document.querySelector('.ant-modal-close').click()");
  });
  await attempt("contract detail", async () => {
    await go(
      "/contracts/CT0103",
      "!!document.querySelector('[data-testid=milestone-item]')",
    );
    await shot("contract-detail", {
      marks: [
        { n: 1, target: "h1" },
        { n: 2, target: ".ant-layout-content [data-testid=origin-SEED]" },
        { n: 3, target: { text: "Nhật ký hợp đồng" } },
        { n: 4, target: ".ant-tabs-nav" },
        { n: 5, target: "[data-testid=milestone-item]" },
        {
          n: 6,
          target: {
            text: "Tổng quan thanh toán",
            up: "section, div[class*=panel], div[class*=Panel]",
          },
        },
      ],
    });
    await click({
      text: "Event",
      contains: true,
      scope: ".ant-tabs-nav",
      children: 3,
    });
    await pause(600);
    await shot("contract-detail-events");
  });
  await attempt("dispute", async () => {
    await go(
      "/contracts/CT0019/milestones/3/dispute",
      "!!document.querySelector('[data-testid=dispute-case]')",
    );
    await shot("dispute", {
      marks: [
        { n: 1, target: "[data-testid=dispute-case]" },
        { n: 2, target: "[data-testid=dispute-option-RESOLVE]" },
        { n: 3, target: "[data-testid=dispute-note]" },
        { n: 4, target: "[data-testid=dispute-confirm]" },
      ],
    });
    await evaluate(
      "document.querySelector('[data-testid=dispute-option-RESOLVE]').click()",
    );
    await evaluate(
      "document.querySelector('[data-testid=dispute-note]').focus()",
    );
    await send("Input.insertText", {
      text: "Hai bên đã thống nhất biên bản nghiệm thu bổ sung.",
    });
    await pause(300);
    await evaluate(
      "document.querySelector('[data-testid=dispute-confirm]').click()",
    );
    await pause(1500);
    await go(
      "/contracts/CT0019/milestones/3/decision",
      "document.body.innerText.includes('RELEASE')",
    );
    await shot("dispute-resolved");
  });

  /* ------------------------------- finance approver ------------------------------- */
  await attempt("finance sign-in", async () => {
    await loginAs("finance@novaan.vn");
    await sidebar("finance");
  });
  await attempt("approval", async () => {
    await go(
      "/approvals/CT0103/2",
      "!!document.querySelector('[data-testid=approve-payment]:not([disabled])')",
    );
    await shot("approval", {
      marks: [
        {
          n: 1,
          target: {
            text: "Chủ hợp đồng",
            contains: true,
            tag: "div",
            children: 6,
            index: 0,
          },
        },
        { n: 2, target: { text: "Kết quả nếu bạn phê duyệt", tag: "h2" } },
        { n: 3, target: "[data-testid=approve-payment]" },
      ],
    });
    await evaluate(
      "document.querySelector('[data-testid=approve-payment]').click()",
    );
    await until(
      "!!document.querySelector('.ant-modal-footer .ant-btn-primary')",
    );
    await pause(400);
    await shot("approval-confirm", { clip: ".ant-modal" });
    await evaluate(
      "document.querySelector('.ant-modal-footer .ant-btn-primary').click()",
    );
    await until(
      "location.pathname === '/contracts/CT0103/milestones/2/decision'",
    );
  });
  await attempt("decision", async () => {
    await go(
      "/contracts/CT0103/milestones/2/decision",
      "document.body.innerText.includes('PENALTY')",
    );
    await shot("decision");
    await shot("decision-amounts", {
      clip: { text: "Tính tiền", contains: true, up: "[class*=panel]" },
    });
    await wideShot("decision-rules", {
      clip: {
        text: "8 rule của phạm vi",
        contains: true,
        tag: "h2",
        up: "section",
      },
    });
    await wideShot("decision-events", {
      clip: {
        text: "event của mốc và cách engine phân loại",
        contains: true,
        tag: "h2",
        up: "section",
      },
    });
    await evaluate(
      "document.querySelector('[data-testid=replay-timeline]').click()",
    );
    await until(
      "document.querySelectorAll('[data-testid=replay-table] .ant-table-row').length > 0",
    );
    await pause(400);
    await wideShot("decision-replay", {
      clip: "[data-testid=replay-table]",
      margin: 80,
    });
    await shot("decision-history", {
      clip: { text: "Lịch sử chuyển trạng thái", tag: "h2", up: "section" },
    });
  });
  await attempt("transfer", async () => {
    await go(
      "/contracts/CT0103/milestones/1/decision",
      "!!document.querySelector('[data-testid=transfer-payment]')",
    );
    await shot("transfer", {
      marks: [{ n: 1, target: "[data-testid=transfer-payment]" }],
    });
  });
  await attempt("data", async () => {
    await go("/data", "document.body.innerText.includes('405')");
    await shot("data", {
      marks: [
        { n: 1, target: "[data-testid=data-evaluate]" },
        { n: 2, target: "[data-testid=data-download]" },
        { n: 3, target: "[data-testid=dataset-source]" },
        { n: 4, target: "[data-testid=dataset-upload]" },
      ],
    });
    await shot("data-kpi", {
      clip: { text: "Chỉ số KPI (đặc tả mục 15)", up: ".ant-card" },
    });
    await evaluate(
      "document.querySelector('[data-testid=dataset-upload]').click()",
    );
    await until("!!document.querySelector('.ant-modal input[type=file]')");
    await pause(500);
    await shot("data-upload", { clip: ".ant-modal" });
    await evaluate("document.querySelector('.ant-modal-close').click()");
    await pause(300);
    await evaluate(
      "document.querySelector('.ant-table-tbody .ant-table-row td:last-child button').click()",
    );
    await until("!!document.querySelector('.ant-modal')");
    await pause(500);
    await shot("data-trace", { clip: ".ant-modal" });
    await evaluate("document.querySelector('.ant-modal-close').click()");
  });

  /* ------------------------- buyer contract officer (legal) ------------------------- */
  await attempt("legal sign-in", async () => {
    await loginAs("legal@novaan.vn");
    await sidebar("legal");
  });
  await attempt("tasks", async () => {
    await go(
      "/tasks",
      "document.querySelectorAll('.ant-table-row').length > 0",
    );
    await shot("tasks", {
      marks: [
        { n: 1, target: ".data-table-wrapper .ant-row", pad: 2 },
        { n: 2, target: ".data-table-wrapper .ant-tabs-nav" },
        { n: 3, target: ".ant-table-tbody .ant-table-row td:first-child" },
        { n: 4, target: ".ant-table-tbody .ant-table-row td:nth-child(5)" },
        { n: 5, target: ".ant-table-tbody .ant-table-row td:last-child" },
      ],
    });
    await evaluate(
      "document.querySelector('.ant-table-tbody .ant-table-row td:first-child div[style*=pointer]').click()",
    );
    await until("!!document.querySelector('.ant-modal')");
    await pause(500);
    await shot("tasks-detail", { clip: ".ant-modal" });
    await evaluate("document.querySelector('.ant-modal-close').click()");
  });
  await attempt("upload", async () => {
    await go("/contracts/new", "!!document.querySelector('#contract-title')");
    await shot("upload-form", {
      marks: [{ n: 1, target: "[data-testid=contract-fill-demo]" }],
    });
    await click("[data-testid=contract-fill-demo]");
    await until(
      "document.querySelector('#contract-title').value.length > 0 && document.querySelectorAll('[data-testid=signer-row]').length > 0",
    );
    await shot("upload-demo-filled", {
      marks: [{ n: 1, target: "[data-testid=contract-fill-demo]" }],
    });
    await press("[data-testid=contract-template-picker] [role=combobox]");
    await until(
      "!!document.querySelector('[data-testid=template-option-THREE_PARTY]')",
    );
    await click(
      ".ant-select-dropdown [data-testid=template-option-THREE_PARTY]",
    );
    await until(
      "document.querySelectorAll('[data-testid=signer-row]').length === 3",
    );
    await click("[data-testid=signer-add]");
    await until(
      "document.querySelectorAll('[data-testid=signer-row]').length === 4",
    );
    await click("[data-testid=contract-fill-demo]");
    await until(
      "document.querySelectorAll('[data-testid=signer-row] .ant-select-selection-placeholder').length === 0",
    );
    await click("[data-testid=generate-contract-sample]");
    await until(
      "!!document.querySelector('[data-testid=real-document-preview]')",
    );
    await evaluate(
      "document.querySelector('[data-testid=real-document-preview]').scrollIntoView({block: 'center'})",
    );
    await shot("upload-real-preview", {
      marks: [{ n: 1, target: "[data-testid=real-document-preview]" }],
    });

    await shot("upload-document", {
      clip: "[data-testid=contract-document-section]",
      margin: 16,
      marks: [
        { n: 1, target: "[data-testid=contract-document-body]" },
        { n: 2, target: "[data-testid=contract-file-choose]", badge: "right" },
      ],
    });
    await shot("upload-signers", {
      clip: "[data-testid=template-and-signers]",
      margin: 16,
      marks: [
        { n: 1, target: "[data-testid=contract-template-picker]" },
        { n: 2, target: "[data-testid=signer-down]", pad: 0 },
        { n: 3, target: "[data-testid=signer-remove]", pad: 0, badge: "right" },
      ],
    });
  });
  await attempt("positions and digitize", async () => {
    // Attach a real document to this isolated fixture before capturing page geometry.
    await evaluate(`(async () => {
      const headers = {'Content-Type':'application/json', Authorization:'Bearer '+localStorage.getItem('codecash.accessToken')};
      const post = async(path, body) => {
        const response = await fetch('/api/v1'+path,{method:'POST',headers,body:JSON.stringify(body)});
        const json = await response.json(); if(!response.ok) throw new Error(json.code || json.message); return json.data;
      };
      const draft = await post('/workflow/drafts/getContractDraft',{args:['CT0101']});
      const sample = await post('/contract-samples',{draft,language:'vi'});
      const bytes = Uint8Array.from(atob(sample.base64),c=>c.charCodeAt(0));
      const body = new FormData(); body.append('file',new Blob([bytes],{type:sample.mimeType}),sample.fileName);
      const uploaded = await fetch('/api/v1/documents/CT0101',{method:'POST',headers:{Authorization:headers.Authorization},body});
      if(!uploaded.ok) throw new Error('GUIDE_REAL_UPLOAD_FAILED');
    })()`);
    await go(
      "/contracts/CT0101/sign-positions",
      "document.querySelectorAll('button[aria-pressed]').length >= 4",
    );
    await until(
      "!!document.querySelector('[data-testid=real-pdf-page]')?.naturalWidth",
    );
    await click("[data-testid=positions-suggest]");
    await until("!!document.querySelector('[data-testid=positions-save]')");
    await shot("upload-positions", {
      marks: [
        { n: 1, target: "[data-testid=signature-canvas]" },
        { n: 2, target: "[data-testid=positions-suggest]", badge: "right" },
      ],
    });
    await click("[data-testid=positions-save]");
    await until(
      "!!document.querySelector('[data-testid=extraction-read-document]')",
    );
    await click("[data-testid=extraction-read-document]");
    await until(
      "!!document.querySelector('[data-testid=extraction-read-ack]') && !document.querySelector('[data-testid=extraction-read-ack]').disabled",
    );
    await click("[data-testid=extraction-read-ack]");
    await until(
      "!document.querySelector('.ant-modal') && !document.querySelector('[data-testid=extract-terms]').disabled",
    );
    await click("[data-testid=extract-terms]");
    await until(
      "!!document.querySelector('[data-testid=extraction-load-suggestions]')",
    );
    await click("[data-testid=extraction-load-suggestions]");
    await until(
      "!!document.querySelector('[data-testid=extraction-review-ack]') && !document.querySelector('[data-testid=extraction-review-ack]').disabled",
    );
    await click("[data-testid=extraction-review-ack]");
    await until(
      "!document.querySelector('[data-testid=extraction-confirm]').disabled",
    );
    await click("[data-testid=extraction-confirm]");
    await until(
      "!document.querySelector('[data-testid=digitize-confirm]').disabled",
    );
    await shot("upload-digitize", {
      clip: "[data-testid=digitization-milestones]",
      marks: [
        { n: 1, target: "#milestone-deadline" },
        { n: 2, target: "[data-testid=digitize-confirm]" },
      ],
    });
    await evaluate(
      "(() => {const fill = document.querySelector('[data-testid=load-deadline-suggestion]'); if (fill) fill.click();})()",
    );
    await evaluate(
      "document.querySelector('[data-testid=digitize-confirm]').click()",
    );
    await until("location.pathname === '/contracts/CT0101/signing'");
    await pause(800);
    await shot("signing-flow");
  });

  /* ----------------------------------- supplier ----------------------------------- */
  await attempt("supplier sign-in", async () => {
    await loginAs("supplier@phuminh.vn");
    await sidebar("supplier");
    await go(
      "/contracts",
      "document.querySelectorAll('.ant-table-row').length > 0",
    );
    await shot("contracts-supplier");
  });
  await attempt("evidence", async () => {
    await go(
      "/submissions/CT0104/2",
      "!!document.querySelector('[data-testid=evidence-slot]')",
    );
    await shot("evidence", {
      marks: [
        { n: 1, target: "[data-testid=evidence-slot]" },
        { n: 2, target: "[data-testid=submit-evidence]" },
      ],
    });
    const pdf = join(profile, "BienBan.pdf");
    await writeFile(pdf, "%PDF-1.4\n% CodeCash guide sample\n");
    const { root } = await send("DOM.getDocument");
    for (const type of ["SERVICE_COMPLETED", "INVOICE"]) {
      const { nodeId } = await send("DOM.querySelector", {
        nodeId: root.nodeId,
        selector: `[data-testid=evidence-input-${type}]`,
      });
      await send("DOM.setFileInputFiles", { nodeId, files: [pdf] });
      await pause(1200);
    }
    await until(
      "!!document.querySelector('[data-testid=submit-evidence]:not([disabled])')",
    );
    await pause(800);
    await shot("evidence-ready", {
      marks: [
        { n: 1, target: "[data-testid=evidence-slot]" },
        { n: 2, target: { text: "Nếu nộp ngay bây giờ (engine chạy thử)" } },
        { n: 3, target: "[data-testid=submit-evidence]" },
      ],
    });
  });
  await attempt("supplier signing", async () => {
    await go(
      "/contracts/CT0102/signing",
      "document.body.innerText.includes('CT0102')",
    );
    await shot("signing-turn");
    await go(
      "/contracts/CT0102/signing/2",
      "document.body.innerText.includes('VNPT')",
    );
    await shot("signing-method");
    await go("/verify/CT0103", "document.body.innerText.includes('CT0103')");
    await shot("verify");
  });

  /* ---------------------------- controllers (BR-19) ---------------------------- */
  await attempt("admin sign-in", async () => {
    await loginAs("admin@codecash.vn");
    await sidebar("admin");
  });
  await attempt("exceptions", async () => {
    await go(
      "/exceptions",
      "document.querySelectorAll('.ant-table-row').length > 0",
    );
    await shot("exceptions", {
      marks: [
        { n: 1, target: ".ant-alert-info" },
        { n: 2, target: ".data-table-wrapper .ant-row", pad: 2 },
        {
          n: 3,
          target: ".ant-table-tbody .ant-table-row:last-child td:nth-child(3)",
        },
        {
          n: 4,
          target: ".ant-table-tbody .ant-table-row:last-child td:last-child",
        },
      ],
    });
  });
  await attempt("exception propose", async () => {
    await go(
      "/contracts/CT0090/milestones/3/decision",
      "!!document.querySelector('[data-testid=exception-propose]')",
    );
    await evaluate(
      "document.querySelector('[data-testid=exception-event]').closest('.ant-select').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))",
    );
    await until("!!document.querySelector('.ant-select-item-option')");
    await evaluate("document.querySelector('.ant-select-item-option').click()");
    await evaluate(
      "document.querySelector('[data-testid=exception-reason]').focus()",
    );
    await send("Input.insertText", {
      text: "Biên bản nghiệm thu do nhà cung cấp tự ghi, sai thẩm quyền",
    });
    await pause(400);
    await shot("exception-propose", {
      clip: "[data-testid=exception-propose]",
      margin: 260,
    });
    await evaluate(
      "document.querySelector('[data-testid=exception-propose]').click()",
    );
    await pause(1500);
  });
  await attempt("integrity", async () => {
    await go(
      "/integrity",
      "document.querySelectorAll('[data-testid=verdict-ok]').length === 4",
    );
    await shot("integrity", {
      marks: [
        { n: 1, target: { text: "Chuỗi nhật ký kiểm toán", up: ".ant-card" } },
        { n: 2, target: { text: "Chứng từ ghi trong app", up: ".ant-card" } },
        { n: 3, target: { text: "Dữ liệu gốc của BTC", up: ".ant-card" } },
        { n: 4, target: { text: "Đối soát quyết định", up: ".ant-card" } },
        { n: 5, target: "[data-testid=integrity-rerun]" },
      ],
    });
  });
  await attempt("activity", async () => {
    await go(
      "/activity-log",
      "document.querySelectorAll('.ant-table-row').length > 0",
    );
    await shot("activity", {
      marks: [
        { n: 1, target: ".ant-alert-info" },
        { n: 2, target: ".data-table-wrapper .ant-row", pad: 2 },
        {
          n: 3,
          target: ".ant-table-thead th:nth-child(4) .ant-table-filter-trigger",
          pad: 6,
        },
        { n: 4, target: ".ant-table-tbody .ant-table-row td:last-child" },
      ],
    });
  });
  await attempt("exception decide", async () => {
    await loginAs("controller@codecash.vn");
    await go(
      "/contracts/CT0090/milestones/3/decision",
      "!!document.querySelector('[data-testid=exception-approve]')",
    );
    await shot("exception-decide", {
      clip: "[data-testid=exception-approve]",
      margin: 220,
    });
    await evaluate(
      "document.querySelector('[data-testid=exception-approve]').click()",
    );
    await pause(1500);
  });

  /* ------------------------------ system administrator ------------------------------ */
  await attempt("sysadmin sign-in", async () => {
    await loginAs("sysadmin@codecash.vn");
    await sidebar("sysadmin");
  });
  await attempt("organizations", async () => {
    await go(
      "/platform/organizations",
      "document.querySelectorAll('.ant-table-row').length > 0",
    );
    await shot("admin-organizations", {
      marks: [
        { n: 1, target: ".ant-alert-info" },
        { n: 2, target: ".data-table-wrapper .ant-tabs-nav" },
        { n: 3, target: { text: "Thêm mới" } },
        { n: 4, target: { text: "Nhập" } },
        { n: 5, target: { text: "Xuất" } },
        {
          n: 6,
          target: ".ant-table-tbody .ant-table-row td:nth-child(6) .ant-tag",
        },
        { n: 7, target: "[data-testid=table-row-actions]" },
      ],
    });
    await click({ text: "Thêm mới" });
    await until("!!document.querySelector('.ant-modal input#name')");
    await pause(500);
    await shot("admin-create", { clip: ".ant-modal" });
    await evaluate("document.querySelector('.ant-modal-close').click()");
    await pause(400);
    await click({ text: "Nhập" });
    await until("!!document.querySelector('.ant-modal')");
    await pause(500);
    await shot("admin-import", { clip: ".ant-modal" });
    await evaluate("document.querySelector('.ant-modal-close').click()");
  });
  await attempt("contract templates", async () => {
    await go(
      "/platform/contract-templates",
      "document.querySelectorAll('.ant-table-row').length >= 4",
    );
    await shot("admin-contract-templates", {
      marks: [
        { n: 1, target: { text: "Thêm mới" } },
        { n: 2, target: ".ant-table-tbody .ant-table-row td:last-child" },
      ],
    });
    await evaluate(
      "document.querySelector('.ant-table-tbody .ant-table-row td:last-child button').click()",
    );
    await until("!!document.querySelector('.ant-modal textarea#documentBody')");
    await evaluate(
      "document.querySelector('.ant-modal #documentBody').scrollIntoView({block: 'end'})",
    );
    await shot("admin-template-editor", {
      clip: ".ant-modal",
      marks: [
        { n: 1, target: "#signerRoles" },
        { n: 2, target: "#documentBody" },
      ],
    });
    await evaluate("document.querySelector('.ant-modal-close').click()");
  });
  await attempt("users", async () => {
    await go(
      "/platform/users",
      "document.querySelectorAll('.ant-table-row').length > 0",
    );
    await evaluate(
      "document.querySelector('.ant-table-tbody .ant-table-row td:last-child .ant-dropdown-trigger').click()",
    );
    await until("!!document.querySelector('.ant-dropdown-menu')");
    await pause(400);
    await shot("admin-users", {
      marks: [{ n: 1, target: ".ant-dropdown-menu" }],
    });
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape" });
  });
  await attempt("permissions", async () => {
    await go(
      "/platform/permissions",
      "document.querySelectorAll('.ant-table-row').length > 0",
    );
    await shot("admin-permissions", {
      marks: [
        { n: 1, target: ".ant-alert-info" },
        { n: 2, target: ".data-table-wrapper .ant-row", pad: 2 },
      ],
    });
  });

  await attempt("rule language", async () => {
    await evaluate("localStorage.setItem('codecash.onboarding', 'done')");
    await loginAs("sysadmin@codecash.vn");
    await viewport(1440, 1000);
    await go(
      "/platform/rule-versions",
      "!!document.querySelector('[data-testid=rule-version-create]')",
    );
    await click("[data-testid=rule-version-create]");
    await until("!!document.querySelector('.ant-modal input#name')");
    for (const [selector, text] of [
      [".ant-modal input#name", "Giải thích bộ quy tắc"],
      [
        ".ant-modal textarea#reason",
        "Minh họa điều kiện, biến, cú pháp và tác động; chưa gửi duyệt.",
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
    await click("[data-testid=rule-option-PR0006]");
    await click("[data-testid=rule-syntax-check]");
    await until(
      "document.querySelector('[data-testid=rule-syntax-result]')?.classList.contains('ant-alert-success')",
    );
    await shot("rules-editor", {
      clip: ".ant-modal",
      marks: [
        { n: 1, target: "[data-testid=rule-scope-select]" },
        { n: 2, target: "[data-testid=rule-option-PR0006]" },
        { n: 3, target: "[data-testid=rule-expression-condition_expression]" },
      ],
    });
    await evaluate(
      "document.querySelector('[data-testid=rule-expression-penalty_amount_formula]').scrollIntoView({block:'center'})",
    );
    await shot("rules-formulas", {
      clip: ".ant-modal",
      marks: [
        {
          n: 1,
          target: "[data-testid=rule-expression-penalty_amount_formula]",
        },
        {
          n: 2,
          target: "[data-testid=rule-expression-payable_amount_formula]",
        },
      ],
    });
    await click("[data-testid=rule-language-help]");
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
    await evaluate(
      "document.querySelector('[data-testid=rule-variable-catalog]').scrollIntoView({block:'end'})",
    );
    await shot("rules-variables", {
      clip: ".ant-drawer-content-wrapper",
      marks: [
        { n: 1, target: "[data-testid=rule-variable-search]" },
        { n: 2, target: "[data-testid=rule-variable-catalog]" },
      ],
    });
    await evaluate("document.querySelector('.ant-drawer-close').click()");
    await until("!document.querySelector('.ant-drawer-open')");
    await evaluate(
      "document.querySelector('[data-testid=rule-expression-condition_expression]').focus(); document.querySelector('[data-testid=rule-expression-condition_expression]').select()",
    );
    await send("Input.insertText", { text: "open_dispute == 1" });
    await until(
      "document.querySelector('[data-testid=rule-expression-condition_expression]')?.value === 'open_dispute == 1'",
    );
    await click("[data-testid=rule-syntax-check]");
    await until(
      "document.querySelector('[data-testid=rule-syntax-result]')?.classList.contains('ant-alert-error')",
    );
    await evaluate("document.querySelector('.ant-modal-body').scrollTop = 0");
    await shot("rules-syntax-error", {
      clip: ".ant-modal",
      marks: [
        { n: 1, target: "[data-testid=rule-syntax-result]" },
        { n: 2, target: "[data-testid=rule-expression-condition_expression]" },
      ],
    });
    await evaluate(
      "Array.from(document.querySelectorAll('.ant-modal button')).find(x => x.innerText.includes('Khôi phục bản lưu')).click()",
    );
    await evaluate(
      "document.querySelector('[data-testid=rule-expression-penalty_amount_formula]').focus(); document.querySelector('[data-testid=rule-expression-penalty_amount_formula]').select()",
    );
    await send("Input.insertText", {
      text: "planned_payment_vnd_mn + grace_period_days",
    });
    await click("[data-testid=rule-syntax-check]");
    await until(
      "document.querySelector('.ant-form-item-explain-error')?.innerText.includes('Đơn vị không khớp')",
    );
    await evaluate(
      "document.querySelector('[data-testid=rule-expression-penalty_amount_formula]').closest('.ant-form-item').scrollIntoView({block:'center'})",
    );
    await until(
      "document.querySelector('.ant-form-item-explain-error')?.getBoundingClientRect().height > 20",
    );
    await evaluate(
      "document.querySelector('.ant-modal-body').scrollTop = document.querySelector('.ant-modal-body').scrollHeight",
    );
    await until(
      "(() => { const body = document.querySelector('.ant-modal-body'); body.scrollTop = body.scrollHeight; return document.querySelector('.ant-form-item-explain-error').getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom + 0.5; })()",
    );
    await shot("rules-unit-error", {
      clip: ".ant-modal",
      marks: [
        {
          n: 1,
          target: "[data-testid=rule-expression-penalty_amount_formula]",
        },
        { n: 2, target: ".ant-form-item-explain-error" },
      ],
    });
    await evaluate(
      "Array.from(document.querySelectorAll('.ant-modal button')).find(x => x.innerText.includes('Khôi phục bản lưu')).click()",
    );
    await click("[data-testid=rule-version-preview]");
    await until(
      "!!document.querySelector('[data-testid=rule-preview-result]')",
    );
    await evaluate("document.querySelector('.ant-modal-body').scrollTop = 0");
    await shot("rules-preview", {
      clip: ".ant-modal",
      marks: [
        { n: 1, target: "[data-testid=rule-preview-result]" },
        { n: 2, target: "[data-testid=rule-version-submit]" },
      ],
    });
    await viewport(1440, 900);
  });

  /* ------------------------------ auditor, secondary approver ------------------------------ */
  await attempt("auditor", async () => {
    await loginAs("auditor@codecash.vn");
    await sidebar("auditor");
  });
  await attempt("secondary", async () => {
    await loginAs("secondary@novaan.vn");
    await sidebar("secondary");
  });

  /* ------------------------------ the guide itself, phone ------------------------------ */
  await attempt("guide drawer", async () => {
    await loginAs("legal@novaan.vn");
    await go(
      "/tasks",
      "document.querySelectorAll('.ant-table-row').length > 0",
    );
    await evaluate(
      "document.querySelector('[data-testid=page-guide]').click()",
    );
    await until("!!document.querySelector('.ant-drawer-body article h2')");
    await pause(1200);
    await shot("guide-drawer");
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape" });
  });
  await attempt("phone", async () => {
    await viewport(390, 844);
    await go(
      "/tasks",
      "document.querySelectorAll('.ant-table-row').length > 0",
    );
    await shot("mobile-tasks");
  });
  await viewport(1440, 900);

  console.log(`Guide screenshots: ${taken.length} in ${out}`);
  const report = {
    capturedAt: new Date().toISOString(),
    base,
    screenshots: taken,
    missingMarks: missing,
    failures,
  };
  await writeFile(
    join(out, "manifest.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  const escapeHtml = (value) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  const reportDir = resolve(
    process.env.GUIDE_REPORT ?? "playwright-report/guide",
  );
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    join(reportDir, "results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  const reportImages = relative(reportDir, out).split("\\").join("/");
  await writeFile(
    join(reportDir, "index.html"),
    `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>CodeCash guide captures</title>
<style>body{font:16px/1.6 system-ui;max-width:1200px;margin:24px auto;padding:16px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}img{width:100%;border:1px solid #ddd}figure{margin:0}pre{white-space:pre-wrap}</style>
<h1>CodeCash guide captures</h1><p>${escapeHtml(report.capturedAt)} — ${taken.length} captures via Chrome DevTools Protocol.</p>
<p>Failed steps: ${failures.length}; missing annotations: ${missing.length}.</p>
<pre>${escapeHtml([...failures, ...missing].join("\n"))}</pre>
<section>${taken.map((name) => `<figure><a href="${escapeHtml(reportImages)}/${name}.webp"><img loading="lazy" src="${escapeHtml(reportImages)}/${name}.webp" alt="${name}"></a><figcaption>${name}</figcaption></figure>`).join("\n")}</section></html>`,
  );
  console.log(`Capture report: ${join(reportDir, "index.html")}`);
  if (missing.length)
    console.log("Marks not found:\n  " + missing.join("\n  "));
  if (failures.length) {
    console.log("Steps that failed:\n  " + failures.join("\n  "));
    process.exitCode = 1;
  }
  if (missing.length) process.exitCode = 1;
} finally {
  ws?.close();
  chrome.kill();
  await pause(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
