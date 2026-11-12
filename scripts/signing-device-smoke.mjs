/**
 * Signing through the remote signing service, with two devices: a computer and a phone (two
 * browsers, both in the foreground) signed in as the same signer. The computer sends the request
 * and waits; the phone hears it on the service's event stream, refuses a wrong PIN, then signs;
 * the computer moves on to signature verification. Run against a stack in remote mode:
 *   signer: pnpm dev:signer
 *   API:    SIGNING_PROVIDER=remote STORAGE_DRIVER=file DATA_DIR=<empty folder> pnpm dev:api
 *   web:    pnpm dev:web
 *   WEB_URL=http://127.0.0.1:5173 pnpm test:signing:device
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.WEB_URL ?? "http://127.0.0.1:5173";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const browsers = [];

async function device(email, width, height) {
  const profile = await mkdtemp(join(tmpdir(), "codecash-device-"));
  const chrome = spawn(
    process.env.CHROME_BIN ?? "google-chrome",
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  browsers.push({ chrome, profile });
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try {
      port = (
        await readFile(join(profile, "DevToolsActivePort"), "utf8")
      ).split("\n")[0];
    } catch {
      await pause(100);
    }
  }
  const target = await (
    await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
      method: "PUT",
    })
  ).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let next = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id) {
      pending.get(m.id)?.(m);
      pending.delete(m.id);
    } else if (m.method === "Runtime.exceptionThrown")
      errors.push(
        m.params.exceptionDetails.exception?.description ??
          m.params.exceptionDetails.text,
      );
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      const id = ++next;
      pending.set(id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const ev = async (expression) =>
    (
      await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
    ).result?.result?.value;
  const until = async (expression, label, tries = 150) => {
    for (let i = 0; i < tries; i++) {
      if (await ev(expression)) return;
      await pause(100);
    }
    throw new Error(`Timed out: ${label}`);
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 500,
  });
  await send("Page.navigate", { url: base + "/login" });
  await until("!!document.querySelector('#root')", "login page");
  await ev(
    `(async()=>{const r=await fetch('/api/v1/auth/demo-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:${JSON.stringify(email)}})});const j=await r.json();if(!r.ok)throw Error('LOGIN_FAILED');localStorage.setItem('codecash.accessToken',j.data.token);localStorage.setItem('scw.session.userId',j.data.user.id);localStorage.setItem('codecash.onboarding','done');localStorage.setItem('scw.language','vi');})()`,
  );
  return { send, ev, until, errors };
}

try {
  const computer = await device("supplier@phuminh.vn", 1440, 900);
  const phone = await device("supplier@phuminh.vn", 390, 844);

  await phone.send("Page.navigate", { url: base + "/device" });
  await phone.until(
    "!!document.querySelector('[data-testid=device-idle]')",
    "phone device page",
  );

  await computer.send("Page.navigate", {
    url: base + "/contracts/CT0102/signing/2",
  });
  await computer.until(
    "!!document.querySelector('[data-testid=sign-now]')",
    "signing step",
  );
  await computer.ev("document.querySelector('[data-testid=sign-now]').click()");
  await computer.until(
    "!!document.querySelector('[data-testid=remote-waiting]') && /^\\d{4}$/.test(document.querySelector('[data-testid=remote-code]').innerText)",
    "waiting for the device, with a confirmation code",
  );
  const code = await computer.ev(
    "document.querySelector('[data-testid=remote-code]').innerText",
  );
  await computer.until(
    "!!document.querySelector('[data-testid=signing-dock-trigger][data-pending]')",
    "corner device lights up",
  );

  await phone.until(
    "!!document.querySelector('[data-testid=device-request]')",
    "phone receives the request",
  );
  assert.equal(
    await phone.ev(
      "document.querySelector('[data-testid=device-code]').innerText",
    ),
    code,
    "same confirmation code on both screens",
  );

  // A wrong PIN is refused and counted.
  await phone.ev(
    "document.querySelector('[data-testid=device-pin] input').focus()",
  );
  await phone.send("Input.insertText", { text: "111111" });
  await phone.ev(
    "document.querySelector('[data-testid=device-approve]').click()",
  );
  await phone.until(
    "document.querySelector('[data-testid=device-request]')?.innerText.includes('Sai PIN')",
    "wrong PIN reported",
  );

  await phone.ev(
    "document.querySelector('[data-testid=device-pin] input').focus()",
  );
  await phone.send("Input.insertText", { text: "123456" });
  await phone.ev(
    "document.querySelector('[data-testid=device-approve]').click()",
  );
  await phone.until(
    "!!document.querySelector('[data-testid=device-result]')",
    "phone signed",
  );

  await computer.until(
    "location.pathname === '/verify/CT0102'",
    "computer moves to verification",
    300,
  );
  await computer.until(
    "document.body.innerText.includes('Hợp lệ')",
    "the new signature verifies",
  );
  assert.deepEqual([...computer.errors, ...phone.errors], [], "no page errors");
  console.log(
    "Signing device smoke passed: request sent, phone and corner device notified, same code, wrong PIN refused, signed, verified.",
  );
} finally {
  for (const b of browsers) b.chrome.kill();
  await pause(300);
  for (const b of browsers)
    await rm(b.profile, { recursive: true, force: true });
}
