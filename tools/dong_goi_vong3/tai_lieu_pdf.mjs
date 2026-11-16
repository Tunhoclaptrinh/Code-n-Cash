#!/usr/bin/env node
// Render docs/TAI_LIEU_SAN_PHAM.md to a print-ready A4 PDF with headless Chrome.
// Usage: node tools/dong_goi_vong3/tai_lieu_pdf.mjs [output.pdf]
// Env: CHROME_BIN overrides the Chrome/Chromium executable.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = "docs/TAI_LIEU_SAN_PHAM.md";
const output = resolve(
  process.argv[2] ?? join(ROOT, "docs/TAI_LIEU_SAN_PHAM.pdf"),
);

// marked is a dependency of apps/web; resolve it from there instead of adding a root dependency.
const requireFromWeb = createRequire(join(ROOT, "apps/web/package.json"));
const { Marked } = await import(
  pathToFileURL(requireFromWeb.resolve("marked")).href
);

const escapeHtml = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Relative links become plain text plus the repository path: a PDF has no sibling files, and Chrome
// would otherwise print an absolute file:// URL that leaks the local folder.
const marked = new Marked({
  gfm: true,
  renderer: {
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (/^(https?:|mailto:)/.test(href))
        return `<a href="${escapeHtml(href)}">${text}</a>`;
      const repoPath = posix
        .normalize(posix.join(posix.dirname(SOURCE), href))
        .replace(/\/$/, "");
      return `${text} <span class="ref">(${escapeHtml(repoPath)})</span>`;
    },
  },
});

const markdown = readFileSync(join(ROOT, SOURCE), "utf8");
const [, title = "Tài liệu sản phẩm"] = markdown.match(/^#\s+(.+)$/m) ?? [];
let body = marked.parse(markdown);

// Status cells get the same colour coding as the pitch deck.
const STATUS = {
  "Đã triển khai": "done",
  "Đã có": "done",
  "Mô phỏng": "sim",
  "Tiếp theo": "next",
  "Định hướng": "idea",
};
body = body.replace(
  /<td>(Đã triển khai|Đã có|Mô phỏng|Tiếp theo|Định hướng)<\/td>/g,
  (_, s) => `<td><span class="chip ${STATUS[s]}">${s}</span></td>`,
);

const today = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
}).format(new Date());

const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --ink: #0f172a; --text: #1e293b; --muted: #475569; --faint: #64748b;
    --line: #e2e8f0; --surface: #f5f7fb;
    --brand: #315bea; --brand-ink: #1e3fae; --brand-soft: #e8eefe;
    --release: #047857; --release-soft: #e3f4ee;
    --hold: #b45309; --hold-soft: #fdf1e2;
    --font: "Be Vietnam Pro", "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif;
    --mono: "JetBrains Mono", Consolas, "Cascadia Mono", ui-monospace, monospace;
  }
  @page { size: A4; margin: 18mm 17mm 18mm 17mm;
    @bottom-right { content: counter(page) " / " counter(pages); font-family: "Segoe UI", Arial, sans-serif; font-size: 8pt; color: #64748b; }
    @bottom-left { content: "CodeCash · Tài liệu sản phẩm Vòng 3"; font-family: "Segoe UI", Arial, sans-serif; font-size: 8pt; color: #64748b; } }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: var(--font); font-size: 10.2pt; line-height: 1.55; color: var(--text); background: #fff; }

  .cover { border-bottom: 2px solid var(--brand); padding-bottom: 10pt; margin-bottom: 14pt; }
  .cover .kicker { display: inline-block; font-size: 8pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
    color: var(--brand-ink); background: var(--brand-soft); border-radius: 3pt; padding: 2pt 6pt; }
  .cover .meta { color: var(--faint); font-size: 8.5pt; margin-top: 4pt; }

  h1 { font-size: 21pt; line-height: 1.2; color: var(--ink); margin: 6pt 0 4pt; letter-spacing: -.01em; }
  h2 { font-size: 13.5pt; color: var(--ink); margin: 18pt 0 6pt; padding-top: 4pt; border-top: 1px solid var(--line);
    break-after: avoid; }
  h3 { font-size: 11.5pt; color: var(--brand-ink); margin: 14pt 0 5pt; break-after: avoid; }
  h2 + *, h3 + * { break-before: avoid; }
  /* A bold-only paragraph is a run-in heading ("Lộ trình:"); keep it with the table or list below. */
  p:has(> strong:only-child) { break-after: avoid; margin-top: 8pt; }
  p:has(> strong:only-child) + * { break-before: avoid; }
  p { margin: 0 0 6pt; }
  ul, ol { margin: 0 0 7pt; padding-left: 16pt; }
  li { margin: 1.5pt 0; }
  strong { color: var(--ink); }
  a { color: var(--brand-ink); text-decoration: none; }
  .ref { color: var(--faint); font-family: var(--mono); font-size: 7.6pt; }

  code { font-family: var(--mono); font-size: 8.4pt; background: var(--surface); border: 1px solid var(--line);
    border-radius: 3pt; padding: 0 3pt; color: var(--ink); }
  pre { background: var(--surface); border: 1px solid var(--line); border-radius: 5pt; padding: 8pt 10pt; margin: 4pt 0 8pt;
    break-inside: avoid; overflow: hidden; }
  pre code { border: 0; padding: 0; background: none; font-size: 8.6pt; line-height: 1.45; white-space: pre; }

  table { width: 100%; border-collapse: collapse; margin: 4pt 0 9pt; font-size: 8.8pt; line-height: 1.42; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { text-align: left; font-weight: 700; color: var(--ink); background: var(--surface); border-bottom: 1.5px solid var(--line); }
  th, td { padding: 4pt 6pt; vertical-align: top; border-bottom: 1px solid var(--line); }
  td code { font-size: 7.8pt; }

  .chip { display: inline-block; white-space: nowrap; font-size: 7.6pt; font-weight: 700; border-radius: 3pt; padding: 1pt 5pt; }
  .chip.done { color: var(--release); background: var(--release-soft); }
  .chip.sim { color: var(--hold); background: var(--hold-soft); }
  .chip.next { color: var(--brand-ink); background: var(--brand-soft); }
  .chip.idea { color: var(--muted); background: var(--surface); border: 1px dashed #94a3b8; }
</style>
</head>
<body>
<header class="cover">
  <span class="kicker">Festival Chuyển đổi số 2026 · Bảng D · Case 4</span>
  <div class="meta">Xuất từ ${escapeHtml(SOURCE)} ngày ${today}</div>
</header>
${body}
</body>
</html>
`;

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("Chrome/Chromium not found; set CHROME_BIN.");
  return found;
}

const work = mkdtempSync(join(tmpdir(), "codecash-pdf-"));
try {
  const page = join(work, "tai-lieu.html");
  writeFileSync(page, html, "utf8");
  execFileSync(
    findChrome(),
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${join(work, "profile")}`,
      "--no-pdf-header-footer",
      `--print-to-pdf=${output}`,
      pathToFileURL(page).href,
    ],
    { stdio: "ignore", timeout: 120_000 },
  );
  if (!existsSync(output)) throw new Error(`Chrome did not write ${output}`);
  console.log(`PDF: ${output}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
