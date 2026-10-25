/** End-to-end checks of the review fixes. Never run against shared or production data. */
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  readFile,
  mkdir,
  writeFile,
  rm,
  copyFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
const base = process.env.WEB_URL ?? "http://127.0.0.1:3302";
const out = resolve("playwright-report/refinement");
await mkdir(out, { recursive: true });
const health = await fetch(base + "/api/v1/health").then((r) => r.json());
assert.equal(health.data.storage, "file", "ISOLATED_FILE_FIXTURE_REQUIRED");
const manifest = await fetch(base + "/guide/samples/manifest.json").then((r) =>
  r.json(),
);
for (const sample of manifest) {
  const r = await fetch(base + "/guide/samples/" + sample.pdf);
  assert.equal(r.status, 200);
  const bytes = Buffer.from(await r.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), sample.sha256);
}
const zip = await fetch(
  base + "/guide/samples/CodeCash-PDF-1-4-nguoi-ky.zip",
).then((r) => r.arrayBuffer());
assert.equal(Buffer.from(zip).subarray(0, 2).toString(), "PK");
const folder = await mkdtemp(join(tmpdir(), "codecash-refine-"));
const chrome = spawn(
  process.env.CHROME_BIN ?? "google-chrome",
  [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--user-data-dir=${folder}`,
    "--remote-debugging-port=0",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
const captures = [];
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try {
      port = (await readFile(join(folder, "DevToolsActivePort"), "utf8")).split(
        "\n",
      )[0];
      break;
    } catch {
      await pause(100);
    }
  }
  const tab = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
    method: "PUT",
  }).then((r) => r.json());
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const jobs = new Map();
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id) {
      const j = jobs.get(m.id);
      jobs.delete(m.id);
      m.error ? j.reject(m.error) : j.resolve(m.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      jobs.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const until = async (expression) => {
    for (let i = 0; i < 300; i++) {
      if (await evaluate(expression)) return;
      await pause(100);
    }
    throw Error(
      "TIMEOUT " +
        expression +
        " " +
        (await evaluate(
          'location.pathname+" "+document.body.innerText.slice(-1500)',
        )),
    );
  };
  const go = async (path, ready) => {
    await send("Page.navigate", { url: base + path });
    await until(ready);
    await pause(400);
  };
  const click = (selector) =>
    evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const login = async (email) => {
    await go("/login", '!!document.querySelector("#root")');
    await evaluate(
      `(async()=>{const r=await fetch('/api/v1/auth/demo-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:${JSON.stringify(email)}})});const j=await r.json();if(!r.ok)throw Error('LOGIN_FAILED');localStorage.setItem('codecash.accessToken',j.data.token);localStorage.setItem('scw.session.userId',j.data.user.id);localStorage.setItem('codecash.onboarding','done');localStorage.setItem('scw.language','vi');})()`,
    );
  };
  async function shot(id, role, title, marks = []) {
    await evaluate("document.activeElement?.blur()");
    await pause(300);
    const original = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(
      join(out, id + "-goc.png"),
      Buffer.from(original.data, "base64"),
    );
    await evaluate(
      `(()=>{const layer=document.createElement('div');layer.id='__review_marks';document.body.appendChild(layer);for(const [index,selector] of ${JSON.stringify(marks)}.entries()){const target=document.querySelector(selector);if(!target)throw Error('Missing mark '+selector);const r=target.getBoundingClientRect();if(r.width<1||r.height<1||r.top<0||r.bottom>innerHeight)throw Error('Clipped mark '+selector);const box=document.createElement('div');box.style.cssText='position:fixed;pointer-events:none;border:2.5px solid #f5222d;border-radius:8px;box-shadow:0 0 0 3px #f5222d2e;z-index:2147483000';Object.assign(box.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});const badge=document.createElement('span');badge.textContent=index+1;badge.style.cssText='position:absolute;left:-10px;top:-10px;width:24px;height:24px;border-radius:50%;background:#f5222d;color:white;text-align:center;font:bold 13px/24px system-ui';box.appendChild(badge);layer.appendChild(box);}})()`,
    );
    const image = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(join(out, id + ".png"), Buffer.from(image.data, "base64"));
    await evaluate('document.querySelector("#__review_marks")?.remove()');
    captures.push({
      id,
      role,
      title,
      file: id + ".png",
      original: id + "-goc.png",
      annotations: marks.map((target, index) => ({
        number: index + 1,
        label:
          {
            "review-signature-match": [
              "Trang PDF thật và vùng ký đúng người.",
              "Gợi ý vùng ký theo tên/bên ký in sẵn.",
            ],
            "review-signature-mismatch": [
              "Danh sách lệch tài liệu; sửa người ký hoặc tạo lại tệp.",
            ],
            "review-signed-hold": [
              "Mốc nghiệm thu còn thiếu chứng từ, hợp đồng đã ký đủ.",
            ],
            "review-guide-downloads": [
              "Tải PDF 1–4 người hoặc ZIP PDF/DOCX chưa ký.",
            ],
            "review-account-search": [
              "Tìm theo tên, email hoặc công ty.",
              "Chọn đúng tài khoản người ký.",
            ],
          }[id]?.[index] ?? target,
      })),
      path: await evaluate("location.pathname"),
    });
  }
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await login("legal@novaan.vn");
  await go(
    "/contracts/new",
    '!!document.querySelector("[data-testid=contract-fill-demo]")',
  );
  await click("[data-testid=contract-fill-demo]");
  await until(
    '!!document.querySelector("[data-testid=draft-live-preview] iframe")',
  );
  const old = await evaluate(
    'document.querySelector("[data-testid=draft-live-preview] iframe").src',
  );
  await evaluate(
    'document.querySelector("#contract-title").focus();document.querySelector("#contract-title").select()',
  );
  await send("Input.insertText", { text: "Hợp đồng đã cập nhật từ form" });
  await until(
    `!!document.querySelector('[data-testid=draft-live-preview] iframe') && document.querySelector('[data-testid=draft-live-preview] iframe').src !== ${JSON.stringify(old)}`,
  );
  const b64 = await evaluate(
    `(async()=>{const blob=await fetch(document.querySelector('[data-testid=draft-live-preview] iframe').src).then(r=>r.blob());return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);});})()`,
  );
  const pdfPath = join(folder, "live.pdf");
  await writeFile(pdfPath, Buffer.from(b64, "base64"));
  const text = await promisify(execFile)("pdftotext", [
    "-layout",
    pdfPath,
    "-",
  ]);
  assert.ok(text.stdout.includes("Hợp đồng đã cập nhật từ form"));
  await shot(
    "review-live-preview",
    "Cán bộ hợp đồng",
    "PDF nháp cập nhật theo form",
  );
  const token = await evaluate('localStorage.getItem("codecash.accessToken")');
  const request = async (path, body) => {
    const r = await fetch(base + "/api/v1" + path, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
    const j = await r.json();
    return { status: r.status, value: j.data, error: j.code ?? j.message };
  };
  const post = async (path, body) => {
    const r = await request(path, body);
    assert.ok(r.status < 300, path + " " + r.error);
    return r.value;
  };
  const call = (module, action, ...args) =>
    post(`/workflow/${module}/${action}`, { args });
  const options = await call("drafts", "getUploadFormOptions");
  const fresh = await call("drafts", "getContractDraft", undefined, true);
  const signers = [
    { party: "BUYER", userId: "u-owner" },
    { party: "SUPPLIER", userId: "u-supplier" },
    { party: "BUYER", userId: "u-finance" },
  ];
  const input = {
    ...fresh,
    title: "Đối chiếu vị trí ký",
    type: options.types[0],
    approvalPolicy: options.policies[0],
    supplierId: "S015",
    valueMillion: "1250.50",
    startDate: "2026-12-01",
    endDate: "2027-12-01",
    graceDays: 5,
    penaltyRatePct: "0.25",
    maxPenaltyPct: "8.00",
    signers,
  };
  const sample = await post("/contract-samples", {
    draft: input,
    language: "vi",
  });
  const bytes = Buffer.from(sample.base64, "base64");
  const saved = await call("drafts", "saveContractDraft", {
    ...input,
    signers: [...signers].reverse(),
    file: { name: sample.fileName, sizeBytes: bytes.length, kind: "DOCX" },
  });
  const body = new FormData();
  body.append(
    "file",
    new Blob([bytes], { type: sample.mimeType }),
    sample.fileName,
  );
  await post("/documents/" + saved.code, body);
  const config = await call("signing", "getSigningConfig", saved.code);
  const slots = await call("signing", "getDefaultSignatureSlots", saved.code);
  const area = config.previewPages
    .flatMap((p) => (p.anchors ?? []).map((a) => ({ ...a, page: p.pageNo })))
    .find((a) => a.signerName === "Lê Quốc Dũng");
  assert.equal(slots[1].page, area.page);
  assert.equal(slots[1].y, area.y);
  await go(
    "/contracts/" + saved.code + "/sign-positions",
    '!!document.querySelector("[data-testid=positions-suggest]")',
  );
  await click("[data-testid=positions-suggest]");
  await until(
    '!!document.querySelector("[data-testid=positions-save]") && !!document.querySelector("[data-testid=real-pdf-page]")?.naturalWidth',
  );
  assert.equal(
    await evaluate(
      `(()=>{const page=document.querySelector('[data-pagearea]').getBoundingClientRect(),canvas=document.querySelector('[data-pagearea]').parentElement.parentElement.getBoundingClientRect();return page.width<=canvas.width&&page.height<=canvas.height;})()`,
    ),
    true,
  );
  await shot(
    "review-signature-match",
    "Cán bộ hợp đồng",
    "Vùng ký khớp tên, kể cả khi đổi thứ tự",
    ["[data-testid=real-pdf-page]", "[data-testid=positions-suggest]"],
  );
  const bad = await call("drafts", "saveContractDraft", {
    ...(await call("drafts", "getContractDraft", saved.code)),
    signers: [{ party: "BUYER", userId: "u-legal" }, signers[1], signers[0]],
  });
  await go(
    "/contracts/" + saved.code + "/sign-positions",
    '!!document.querySelector("[data-testid=signer-document-mismatch]")',
  );
  assert.ok(
    (
      await evaluate(
        'document.querySelector("[data-testid=signer-document-mismatch]").innerText',
      )
    ).includes("Trần Thị Mai"),
  );
  assert.equal(
    await evaluate('!!document.querySelector("[data-testid=positions-save]")'),
    false,
  );
  const current = await call("signing", "getSigningConfig", bad.code);
  const rejected = await request("/workflow/signing/saveSignatureSlots", {
    args: [
      bad.code,
      slots,
      {
        documentSha256: current.documentSha256,
        version: current.layoutVersion,
      },
    ],
  });
  assert.equal(rejected.error, "SIGNER_DOCUMENT_MISMATCH");
  await shot(
    "review-signature-mismatch",
    "Cán bộ hợp đồng",
    "Chặn người ký không khớp tài liệu",
    ["[data-testid=signer-document-mismatch]"],
  );
  await go(
    "/contracts/CT0084",
    '!!document.querySelector("[data-testid=signed-pending-conditions]")',
  );
  const status = await evaluate(
    'document.querySelector("[data-testid=signed-pending-conditions]").innerText',
  );
  assert.ok(status.includes("MS0337"));
  assert.ok(!status.includes("detail.signedPending"));
  assert.ok(status.toLowerCase().includes("đã ký"));
  assert.ok(status.includes("nghiệm thu") || status.includes("ACCEPTANCE"));
  await shot(
    "review-signed-hold",
    "Chủ hợp đồng",
    "Đã ký hợp đồng; mốc nghiệm thu còn thiếu điều kiện",
    ["[data-testid=signed-pending-conditions]"],
  );
  await go(
    "/guide/signing",
    '!!document.querySelector("[data-testid=guide-demo-contracts]")',
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll("[data-testid=guide-demo-contracts] a[download]").length',
    ),
    5,
  );
  await click("[data-testid=guide-demo-contracts] .ant-collapse-header");
  await until(
    'document.querySelector("[data-testid=guide-demo-contracts]").innerText.includes("supplier@phuminh.vn")',
  );
  await click("[data-testid=guide-demo-contracts] .ant-collapse-header");
  await until(
    'document.querySelector("[data-testid=guide-demo-contracts] [aria-expanded]")?.getAttribute("aria-expanded") === "false"',
  );
  await shot(
    "review-guide-downloads",
    "Hướng dẫn",
    "Tải bộ hợp đồng demo chưa ký",
    ["[data-testid=guide-demo-contracts]"],
  );
  await go(
    "/contracts/new",
    '!!document.querySelector("[data-testid=page-guide]")',
  );
  await click("[data-testid=page-guide]");
  await until(
    '!!document.querySelector(".ant-drawer [data-testid=guide-demo-contracts]")',
  );
  assert.equal(
    await evaluate(
      '(()=>{const body=document.querySelector(".ant-drawer-body");return body.scrollHeight>body.clientHeight;})()',
    ),
    true,
  );
  await evaluate(
    'localStorage.removeItem("codecash.accessToken");localStorage.removeItem("scw.session.userId")',
  );
  await go("/login", '!!document.querySelector("[data-testid=demo-accounts]")');
  await click("[data-testid=demo-accounts]");
  await until('!!document.querySelector("[data-testid=demo-account-search]")');
  await evaluate(
    'document.querySelector("[data-testid=demo-account-search]").focus()',
  );
  await send("Input.insertText", { text: "Bui Van Khanh" });
  await until(
    'document.querySelectorAll("[data-testid=demo-account]").length===1',
  );
  assert.ok(
    (
      await evaluate(
        'document.querySelector("[data-testid=demo-account]").innerText',
      )
    ).includes("supplier@alphatech.vn"),
  );
  await shot(
    "review-account-search",
    "Đăng nhập",
    "Tìm đúng tài khoản người ký",
    ["[data-testid=demo-account-search]", "[data-testid=demo-account]"],
  );
  await click("[data-testid=demo-account]");
  await until('location.pathname!=="/login"');
  assert.ok(
    (await evaluate("document.body.innerText")).includes("Bùi Văn Khánh"),
  );
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await login("legal@novaan.vn");
  await go(
    "/contracts/" + saved.code + "/sign-positions",
    '!!document.querySelector("[data-testid=signer-document-mismatch]")',
  );
  assert.ok(
    await evaluate("document.documentElement.scrollWidth<=innerWidth+2"),
  );
  await shot(
    "review-mobile-signing",
    "Cán bộ hợp đồng",
    "Vị trí ký trên điện thoại",
  );
  await writeFile(
    join(out, "captured.json"),
    JSON.stringify(captures, null, 2) + "\n",
  );
  await writeFile(join(out, "failures.json"), "[]\n");
  await writeFile(
    join(out, "inventory.json"),
    JSON.stringify(
      captures.map(({ id, role, title }) => ({ id, role, title })),
      null,
      2,
    ) + "\n",
  );
  for (const shot of captures)
    if (!shot.id.includes("mobile"))
      await copyFile(
        join(out, shot.file),
        resolve("apps/web/public/guide/images", shot.file),
      );
  console.log(
    "Review refinement smoke passed: live PDF content, 4 downloads + ZIP, name/party mapping, mismatch rejection, CT0084 reason, demo-account search/login, guide drawer and mobile; " +
      captures.length +
      " captures.",
  );
} finally {
  ws?.close();
  chrome.kill();
  await pause(300);
  await rm(folder, { recursive: true, force: true });
}
