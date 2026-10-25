import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** A self-contained role gallery plus machine-readable completeness results. */
export async function writeVisualReport(folder) {
  const read = async (name) =>
    JSON.parse(await readFile(join(folder, name), "utf8"));
  const [screenshots, inventory, failures] = await Promise.all([
    read("captured.json"),
    read("inventory.json"),
    read("failures.json"),
  ]);
  const ids = new Set(screenshots.map((s) => s.id));
  const missing = inventory.filter((s) => !ids.has(s.id));
  const results = {
    captured: screenshots.length,
    expected: inventory.length,
    missing,
    failures,
    screenshots,
  };
  await writeFile(
    join(folder, "results.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
  const html = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const roles = [...new Set(screenshots.map((s) => s.role))];
  await writeFile(
    join(folder, "index.html"),
    `<!doctype html>
<html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>CodeCash · Kiểm tra giao diện</title>
<style>body{font:15px/1.6 system-ui;background:#f8fafc;color:#0f172a;max-width:1500px;margin:auto;padding:24px}a{color:#2849bd}nav{display:flex;flex-wrap:wrap;gap:16px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}figure{margin:0;background:white;padding:12px;border:1px solid #e2e8f0;border-radius:8px}img{width:100%;height:250px;object-fit:contain;background:#f1f5f9}figcaption{margin-top:8px}pre{white-space:pre-wrap}</style>
<h1>CodeCash · Kiểm tra giao diện</h1>
<p>${screenshots.length}/${inventory.length} ảnh · ${missing.length} thiếu · ${failures.length} lỗi kiểm tra. Bấm ảnh để xem đúng kích thước.</p>
<p><a href="results.json">Kết quả JSON</a> · <a href="layout-audit.json">Số đo và kiểm tra nút</a></p>
<nav>${roles.map((role, i) => `<a href="#role-${i}">${html(role)}</a>`).join("")}</nav>
${roles
  .map(
    (role, i) =>
      `<h2 id="role-${i}">${html(role)}</h2><div class="grid">${screenshots
        .filter((s) => s.role === role)
        .map(
          (s) =>
            `<figure><a href="${html(s.file)}"><img loading="lazy" src="${html(s.file)}" alt="${html(s.title)}"></a><figcaption>${html(s.title)}<br>${html(s.path)}</figcaption></figure>`,
        )
        .join("")}</div>`,
  )
  .join("")}
${missing.length || failures.length ? `<h2>Chưa đạt</h2><pre>${html(JSON.stringify({ missing, failures }, null, 2))}</pre>` : ""}
</html>`,
  );
  return results;
}
