"""Builds the round 3 submission package CodeAndCash_VONG3/ from the repository.

    python tools/dong_goi_vong3/dong_goi.py [--test-logs DIR] [--skip-slow]

- 01_SourceCode: every tracked or new (not ignored) file, minus internal notes, AI tooling, deploy
  config and secrets. The Data Pack is taken from HEAD so local edits never reach the package.
- 03_Output, 06_Demo/kich_ban_kiem_chung: produced by running the engine from 01_SourceCode, which
  also proves the packaged source runs on its own.
- 04_Document/Huong_dan_su_dung, 06_Demo/Anh_man_hinh: the in-app guide and its screenshots.
- Folders the team fills by hand (slides, video, own screenshots, reports) survive a rebuild.
- The build fails if a key, a .env file or a deploy URL ends up in the package.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
TEMPLATES = HERE / "mau"
PKG = ROOT / "CodeAndCash_VONG3"
GUIDE_DIR = ROOT / "apps/web/src/guide"
GUIDE_IMAGES = ROOT / "apps/web/public/guide/images"
GUIDE_IMAGE_LINK = "../../../public/guide/images/"

# Demo screenshots: (package name, guide image, demo step, what it shows).
DEMO_SHOTS = [
    ("01_dang_nhap_tai_khoan_demo", "login-demo-menu.webp", "Đăng nhập", "Menu **Tài khoản demo**: chọn tài khoản là đăng nhập ngay"),
    ("02_viec_can_lam", "tasks.webp", "Demo CT0103, bước 1", "Hộp **Việc cần làm**: thống kê, tab, mở thao tác"),
    ("03_CT0103_phe_duyet_chay_thu", "approval.webp", "Demo CT0103, bước 1–2", "Phê duyệt chi CT0103 mốc 2: chủ hợp đồng đã duyệt; **kết quả nếu bạn phê duyệt**: phạt 2,22, chi 737,78"),
    ("04_CT0103_chung_tu", "approval-evidence.webp", "Demo CT0103, bước 2", "Chứng từ làm căn cứ: hoá đơn, đối chiếu tổng tiền với giá trị mốc"),
    ("05_CT0103_xac_nhan_phe_duyet", "approval-confirm.webp", "Demo CT0103, bước 3", "Hộp xác nhận phê duyệt"),
    ("06_CT0103_quyet_dinh", "decision.webp", "Demo CT0103, bước 3–4", "Quyết định CT0103 mốc 2 sau khi tài chính phê duyệt"),
    ("07_CT0103_bang_tinh_tien", "decision-amounts.webp", "Demo CT0103, bước 4", "Bảng tính tiền: giá trị mốc, ngày trễ, phạt, được chi"),
    ("08_CT0103_luat_ap_dung", "decision-rules.webp", "Demo CT0103, bước 4", "Các luật, điều kiện và trạng thái khớp"),
    ("09_CT0103_su_kien_duoc_phan_loai", "decision-events.webp", "Demo CT0103, bước 4", "Sự kiện được engine phân loại: căn cứ, bản lặp, sai thẩm quyền"),
    ("10_duyet_lenh_chi", "transfer.webp", "Demo CT0103, bước 5", "Nút **Duyệt lệnh chi** trên mốc đủ điều kiện"),
    ("11_nhat_ky_hoat_dong", "activity.webp", "Demo CT0103, bước 6", "**Nhật ký hoạt động**: ai làm gì, lúc nào"),
    ("12_kiem_tra_toan_ven", "integrity.webp", "Demo CT0103, bước 7", "**Kiểm tra toàn vẹn**: chuỗi nhật ký, dữ liệu BTC, đối soát quyết định"),
    ("13_ket_qua_data_pack", "data.webp", "Demo CT0103, bước 8", "**Kết quả Data Pack**: tổng tiền, KPI, phân bố 4 quyết định trên 405 mốc"),
    ("14_data_pack_kpi", "data-kpi.webp", "Hỏi đáp: kiểm tra một KPI", "KPI và phạm vi nhãn đối chiếu"),
    ("15_data_pack_mot_moc", "data-trace.webp", "Hỏi đáp: mở một bản ghi", "Chi tiết kết quả và dấu vết của một mốc"),
    ("16_CT0019_tranh_chap", "dispute.webp", "Tình huống khó: tranh chấp", "Hồ sơ tranh chấp CT0019 mốc 3: phương án đóng, ghi chú, xác nhận"),
    ("17_CT0019_sau_khi_dong", "dispute-resolved.webp", "Tình huống khó: tranh chấp", "Quyết định sau khi đóng tranh chấp"),
    ("18_ngoai_le_hang_doi", "exceptions.webp", "Tình huống khó: ngoại lệ hai người", "Hàng đợi **Ngoại lệ chứng từ**: quy tắc hai người"),
    ("19_ngoai_le_de_xuat", "exception-propose.webp", "Ngoại lệ hai người, bước 2", "Chủ hợp đồng đề xuất vô hiệu EV01006 (CT0090) kèm lý do"),
    ("20_ngoai_le_duyet", "exception-decide.webp", "Ngoại lệ hai người, bước 3", "Kiểm soát viên bên mua duyệt đề xuất"),
    ("21_CT0102_den_luot_ky", "signing-turn.webp", "Ký theo trình tự, bước 1", "CT0102 đang chờ nhà cung cấp ký"),
    ("22_kiem_tra_chu_ky", "verify.webp", "Ký theo trình tự, bước 2", "Thông tin chữ ký đã ghi trong hợp đồng"),
    ("23_phien_ban_luat_chay_thu", "rules-preview.webp", "Hỏi đáp: thay đổi một tham số", "Chạy thử tác động của phiên bản luật trên 405 mốc"),
]
DATA_PACK = "BangD-Case4/DataPack-CASE4_SmartContractWorkflow"

# Not part of the submission: internal notes and plans, AI tooling, the live deploy config (it
# carries the demo password of the running instance), the organiser's own notice, and old docs.
EXCLUDE_PREFIX = (
    ".claude/",
    ".vscode/",
    ".impeccable/",
    "docs/archive/",
    "tools/dong_goi_vong3/",
    "artifacts/",
    "node_modules/",
    "CodeAndCash_VONG3/",
)
EXCLUDE_EXACT = {
    "CLAUDE.md",
    "render.yaml",
    "Smart Contract Tải và ký số hợp đồng.html",
    "Đề xuất chỉnh sửa web.md",
    "ChiTietVeTrinhBayVaNopSP-Vong3.pdf",
    "docs/DINH_HUONG_TONG_THE.md",
    "docs/KE_HOACH_HOAN_THIEN.md",
    "docs/TONG_HOP_ENGINE_RBAC.md",
    "docs/THIET_KE_HAI_CHIEU.md",
    "docs/30_HUONG_DAN_TIEP_QUAN_VA_PHAT_TRIEN_TIEP.md",
    "docs/pitch/GIAI_THICH_SO_LIEU_PITCH.md",
    # Rehearsal material for the team, not part of the submission.
    "docs/KICH_BAN_DEMO.md",
    "docs/pitch/KICH_BAN_THUYET_TRINH.md",
}

# Filled by the team; kept across rebuilds. Each gets a CAN_BO_SUNG.md while it is empty.
USER_DROP = {
    "04_Document/Slide": (
        "Bắt buộc",
        "Slide pitch lưu cả `.pptx` và `.pdf` (mục 7 thông báo BTC), ví dụ `CodeCash_Vong3_Pitch.pptx`, `CodeCash_Vong3_Pitch.pdf`. "
        "Bản HTML đã duyệt nằm ở `04_Document/pitch/CodeCash_Vong3_Pitch.html`.",
    ),
    "06_Demo/Video": (
        "Bắt buộc",
        "Video demo dự phòng (`.mp4`, khuyến nghị 1080p, 2–3 phút) quay luồng demo CT0103 (ảnh 01–12 trong `06_Demo/Anh_man_hinh/`). "
        "Nếu tệp lớn, đặt thêm `LINK_VIDEO.txt` chứa đường dẫn tải (không kèm khoá truy cập).",
    ),
    "06_Demo/Anh_man_hinh/Tu_chup": (
        "Tuỳ chọn",
        "Ảnh đội tự chụp thêm (PNG), ví dụ chụp trên chính máy thi sau lần tập cuối. "
        "Ảnh từng bước demo đã có sẵn ở thư mục cha, lấy từ hướng dẫn sử dụng trong ứng dụng.",
    ),
    "04_Document/Bao_cao": (
        "Tuỳ chọn",
        "Hồ sơ vòng trước hoặc báo cáo khác nếu đội muốn đính kèm. "
        "Bản PDF của tài liệu sản phẩm được tạo tự động ở `04_Document/TAI_LIEU_SAN_PHAM.pdf`, không cần đặt ở đây.",
    ),
}

TEXT_EXT = {".md", ".txt", ".json", ".csv", ".ts", ".tsx", ".js", ".mjs", ".py", ".yaml", ".yml", ".html", ".css", ".env", ".example", ".toml", ".xml", ".svg", ".drawio"}


def git(*args, binary=False):
    done = subprocess.run(["git", "-c", "core.quotepath=off", *args], cwd=ROOT, capture_output=True, check=True)
    return done.stdout if binary else done.stdout.decode("utf-8")


def excluded(path: str) -> bool:
    name = path.rsplit("/", 1)[-1]
    if path in EXCLUDE_EXACT or path.startswith(EXCLUDE_PREFIX):
        return True
    if "__pycache__/" in path or name.endswith(".pyc"):
        return True
    if name.lower().endswith((".mp4", ".mov", ".webm", ".mkv")):
        return True  # demo videos go to 06_Demo/Video, not into the source tree
    if path.startswith("docs/pitch/") and "_ppt169_" in path:
        return True  # ppt-master working folder; the final deck is dropped into 04_Document/Slide
    if re.match(r"^(CLAUDE|AGENTS|GEMINI)(\.[a-z]+)?\.md$", name, re.IGNORECASE):
        return True  # instructions for AI coding assistants, not product documentation
    if name == ".env" or (name.startswith(".env.") and not name.endswith(".example")):
        return True
    return name.endswith((".pem", ".key", ".p12", ".pfx"))


def source_files():
    tracked = [p for p in git("ls-files", "-z").split("\0") if p]
    new = [p for p in git("ls-files", "-z", "--others", "--exclude-standard").split("\0") if p]
    return sorted(p for p in set(tracked + new) if not excluded(p) and (ROOT / p).is_file()), set(tracked)


def run(cmd, cwd, log=None, check=True):
    env = dict(os.environ, PYTHONUTF8="1", PYTHONDONTWRITEBYTECODE="1")
    done = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
    if log:
        Path(log).write_text(done.stdout + (("\n" + done.stderr) if done.stderr.strip() else ""), encoding="utf-8")
    if check and done.returncode != 0:
        raise SystemExit(f"FAILED: {' '.join(map(str, cmd))}\n{done.stdout[-3000:]}\n{done.stderr[-3000:]}")
    return done


def copy_template(rel: str, dest: Path):
    src = TEMPLATES / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)


# --------------------------------------------------------------------------- steps


def is_user_file(p: Path) -> bool:
    # Office lock files (~$x.pptx) and OS clutter appear while the team has a file open.
    return p.is_file() and not p.name.startswith("~$") and p.name not in {"CAN_BO_SUNG.md", "desktop.ini", "Thumbs.db", ".DS_Store"}


def clear_generated(folder: Path, keep: set[Path]):
    """Delete everything under folder except the team's folders; their files are never moved or touched."""
    for entry in folder.iterdir():
        if entry in keep:
            continue
        if any(k.is_relative_to(entry) for k in keep):
            clear_generated(entry, keep)
        elif entry.is_dir():
            shutil.rmtree(entry)
        else:
            entry.unlink()


def prepare():
    keep = {PKG / rel for rel in USER_DROP}
    if PKG.exists():
        clear_generated(PKG, keep)
    PKG.mkdir(exist_ok=True)
    for rel, (level, what) in USER_DROP.items():
        dest = PKG / rel
        dest.mkdir(parents=True, exist_ok=True)
        placeholder = dest / "CAN_BO_SUNG.md"
        if any(is_user_file(p) for p in dest.rglob("*")):
            placeholder.unlink(missing_ok=True)
        else:
            placeholder.write_text(f"# Cần bổ sung ({level})\n\n{what}\n\nXoá tệp này sau khi đã đặt tài liệu vào thư mục.\n", encoding="utf-8")


def build_source():
    files, tracked = source_files()
    dest = PKG / "01_SourceCode"
    for rel in files:
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        if rel.startswith("BangD-Case4/") and rel in tracked:
            target.write_bytes(git("show", f"HEAD:{rel}", binary=True))
        elif rel.startswith("docs/") and rel.endswith(".md"):
            text = drop_excluded_rows((ROOT / rel).read_text(encoding="utf-8"), os.path.dirname(rel))
            target.write_text(text, encoding="utf-8", newline="")
        else:
            shutil.copy2(ROOT / rel, target)
    return files


def build_data():
    dest = PKG / "02_Data"
    shutil.copytree(PKG / "01_SourceCode/BangD-Case4", dest / "BangD-Case4")
    copy_template("02_Data/README.md", dest / "README.md")
    copy_template("06_Demo/tai_khoan_demo.csv", dest / "du_lieu_bo_sung/tai_khoan_demo.csv")


def sample_comparison(out_csv: Path, folder: Path):
    labels_path = PKG / "01_SourceCode" / DATA_PACK / "03_labels_sample/decision_sample.csv"
    with labels_path.open(encoding="utf-8-sig") as f:
        labels = list(csv.DictReader(f))
    with out_csv.open(encoding="utf-8-sig") as f:
        output = {r["milestone_id"]: r for r in csv.DictReader(f)}
    rows, confusion = [], Counter()
    for lab in labels:
        got = output[lab["milestone_id"]]
        ok = {
            "quyet_dinh": lab["expected_decision"] == got["predicted_decision"],
            "ma_ly_do": lab["reason_code"] == got["reason_code"],
            "tien_chi": f"{float(lab['payable_amount_vnd_mn']):.2f}" == got["payable_amount_vnd_mn"],
            "tien_phat": f"{float(lab['penalty_amount_vnd_mn']):.2f}" == got["penalty_amount_vnd_mn"],
        }
        confusion[(lab["expected_decision"], got["predicted_decision"])] += 1
        rows.append(
            {
                "scenario_id": lab["scenario_id"],
                "milestone_id": lab["milestone_id"],
                "scenario_type": lab["scenario_type"],
                "nhan_quyet_dinh": lab["expected_decision"],
                "engine_quyet_dinh": got["predicted_decision"],
                "nhan_ly_do": lab["reason_code"],
                "engine_ly_do": got["reason_code"],
                "nhan_tien_chi": lab["payable_amount_vnd_mn"],
                "engine_tien_chi": got["payable_amount_vnd_mn"],
                "nhan_tien_phat": lab["penalty_amount_vnd_mn"],
                "engine_tien_phat": got["penalty_amount_vnd_mn"],
                "khop_ca_4": "CO" if all(ok.values()) else "KHONG",
            }
        )
    folder.mkdir(parents=True, exist_ok=True)
    with (folder / "doi_chieu_20_mau.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    classes = ["RELEASE", "PENALTY", "HOLD", "REJECT"]
    lines = [
        "# Ma trận nhầm lẫn trên 20 mẫu có nhãn",
        "",
        "Hàng là nhãn của BTC, cột là quyết định của engine. Sinh từ `doi_chieu_20_mau.csv`.",
        "",
        "| Nhãn \\ Engine | " + " | ".join(classes) + " |",
        "|---|" + "---|" * len(classes),
    ]
    for c in classes:
        lines.append(f"| **{c}** | " + " | ".join(str(confusion[(c, p)]) for p in classes) + " |")
    matched = sum(r["khop_ca_4"] == "CO" for r in rows)
    lines += ["", f"Khớp cả quyết định, mã lý do, tiền chi và tiền phạt: **{matched}/{len(rows)}**.", ""]
    (folder / "ma_tran_nham_lan.md").write_text("\n".join(lines), encoding="utf-8")


def build_output(skip_slow: bool):
    src = PKG / "01_SourceCode"
    out = PKG / "03_Output"
    py = sys.executable
    run([py, "apps/engine/cli.py", "--output", str(out / "01_ket_qua_data_pack")], src, out / "01_ket_qua_data_pack.log")
    (out / "01_ket_qua_data_pack.log").replace(out / "01_ket_qua_data_pack" / "nhat_ky_chay.txt")
    sample_comparison(out / "01_ket_qua_data_pack/submission_output.csv", out / "02_doi_chieu_20_mau")
    folder = out / "03_bo_ca_tong_hop"
    folder.mkdir()
    run([py, "apps/engine/benchmark.py", "--report", str(folder)], src, folder / "nhat_ky_chay.txt")
    folder = out / "04_kiem_thu_dot_bien"
    folder.mkdir()
    if skip_slow:
        (folder / "CHUA_CHAY.txt").write_text("Bỏ qua khi đóng gói với --skip-slow. Chạy: python tools/mutation_check.py\n", encoding="utf-8")
    else:
        run([py, "tools/mutation_check.py"], src, folder / "mutation_check.json")
    folder = out / "05_kiem_chung_nghiep_vu"
    folder.mkdir()
    run([py, "tools/kiem_chung_nghiep_vu.py", "--check", "--export", str(folder / "ket_qua_tung_moc.csv")], src, folder / "nhat_ky_chay.txt")
    folder = out / "06_ra_soat_btc"
    folder.mkdir()
    run([py, "tools/ra_soat_btc.py", "--output", str(folder / "review.json")], src, folder / "nhat_ky_chay.txt")
    folder = out / "07_goi_kiem_chung_mau"
    folder.mkdir()
    shutil.copy2(src / "tests/golden/verification_CT0005.json", folder / "verification_CT0005.json")
    copy_template("03_Output/README.md", out / "README.md")


def rewrite_links(text: str, rel_dir: str, docs_base: str | None = None) -> str:
    """Re-points links of a docs/ file copied elsewhere: docs links stay (or move to docs_base),
    links into the rest of the repository go to 01_SourceCode."""
    depth = len([p for p in rel_dir.split("/") if p])

    def fix(match):
        target, anchor = match.group(1), match.group(2) or ""
        if re.match(r"^(https?:|mailto:|#)", target):
            return match.group(0)
        resolved = os.path.normpath(os.path.join("docs", rel_dir, target)).replace("\\", "/")
        if resolved.startswith("docs/") or resolved == "docs":
            return f"]({docs_base}{resolved[5:]}{anchor})" if docs_base else match.group(0)
        return f"]({'../' * (depth + 1)}01_SourceCode/{resolved}{anchor})"

    return re.sub(r"\]\(([^)#\s]+)(#[^)\s]*)?\)", fix, text)


def drop_excluded_rows(text: str, rel_dir: str) -> str:
    """Remove table rows whose links point at a file the package leaves out (team-only documents)."""
    def gone(line: str) -> bool:
        if not line.startswith("|"):
            return False
        for target in re.findall(r"\]\(([^)#\s]+)", line):
            if re.match(r"^(https?:|mailto:)", target):
                continue
            if excluded(os.path.normpath(os.path.join(rel_dir, target)).replace("\\", "/")):
                return True
        return False

    return "\n".join(line for line in text.split("\n") if not gone(line))


def build_documents(files):
    dest = PKG / "04_Document"
    for rel in files:
        if not rel.startswith("docs/"):
            continue
        inner = rel[len("docs/"):]
        target = dest / inner
        target.parent.mkdir(parents=True, exist_ok=True)
        if rel.endswith(".md"):
            text = drop_excluded_rows((ROOT / rel).read_text(encoding="utf-8"), os.path.dirname(rel))
            target.write_text(rewrite_links(text, os.path.dirname(inner).replace("\\", "/")), encoding="utf-8", newline="")
        else:
            shutil.copy2(ROOT / rel, target)
    shutil.copy2(ROOT / "README.md", dest / "README_SAN_PHAM.md")
    text = (dest / "README_SAN_PHAM.md").read_text(encoding="utf-8")
    text = re.sub(r"\]\((?!https?:|#|docs/)([^)\s]+)\)", r"](../01_SourceCode/\1)", text)
    (dest / "README_SAN_PHAM.md").write_text(text.replace("](docs/", "]("), encoding="utf-8", newline="")


def build_product_pdf():
    """Print TAI_LIEU_SAN_PHAM.md to PDF so reviewers can read it without a Markdown viewer."""
    out = PKG / "04_Document" / "TAI_LIEU_SAN_PHAM.pdf"
    run(["node", str(ROOT / "tools/dong_goi_vong3/tai_lieu_pdf.mjs"), str(out)], ROOT)


def guide_topics() -> list[str]:
    """Topic order of the in-app guide, read from apps/web/src/guide/topics.ts."""
    source = (GUIDE_DIR / "topics.ts").read_text(encoding="utf-8")
    block = re.search(r"GUIDE_TOPICS = \[(.*?)\]", source, re.S).group(1)
    return re.findall(r'"([a-z-]+)"', block)


def build_guide():
    """04_Document/Huong_dan_su_dung: the Vietnamese in-app guide as Markdown with its screenshots."""
    dest = PKG / "04_Document/Huong_dan_su_dung"
    images = dest / "anh"
    images.mkdir(parents=True, exist_ok=True)
    topics = guide_topics()
    names = {t: f"{i:02d}_{t}.md" for i, t in enumerate(topics, 1)}
    index = [
        "# Hướng dẫn sử dụng CodeCash",
        "",
        "Bản Markdown của hướng dẫn có sẵn trong ứng dụng (nút **Hướng dẫn** trên mỗi màn, hoặc menu **Hướng dẫn sử dụng**). "
        "Ảnh chụp từ ứng dụng đang chạy trên dữ liệu mẫu; ô đỏ đánh số là phần lời hướng dẫn giải thích. "
        "Nguồn: `01_SourceCode/apps/web/src/guide/vi/` và `01_SourceCode/apps/web/public/guide/images/`.",
        "",
        "| # | Chủ đề | Tệp |",
        "|---|---|---|",
    ]
    used = set()
    for i, topic in enumerate(topics, 1):
        text = (GUIDE_DIR / "vi" / f"{topic}.md").read_text(encoding="utf-8")
        used.update(re.findall(re.escape(GUIDE_IMAGE_LINK) + r"([\w.-]+)", text))
        text = text.replace(GUIDE_IMAGE_LINK, "anh/")
        text = re.sub(r"\]\(/guide/([a-z-]+)\)", lambda m: f"]({names.get(m.group(1), m.group(1) + '.md')})", text)
        (dest / names[topic]).write_text(text, encoding="utf-8")
        title = text.splitlines()[0].lstrip("# ").strip()
        index.append(f"| {i} | {title} | [{names[topic]}]({names[topic]}) |")
    for name in sorted(used):
        shutil.copy2(GUIDE_IMAGES / name, images / name)
    index += ["", f"{len(topics)} chủ đề, {len(used)} ảnh. Ảnh theo từng bước demo: `06_Demo/Anh_man_hinh/`.", ""]
    (dest / "README.md").write_text("\n".join(index), encoding="utf-8")


def build_screenshots():
    """06_Demo/Anh_man_hinh: guide screenshots renamed in the order of the demo flow."""
    dest = PKG / "06_Demo/Anh_man_hinh"
    dest.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Ảnh màn hình các bước demo",
        "",
        "Ảnh lấy từ hướng dẫn sử dụng trong ứng dụng (`04_Document/Huong_dan_su_dung/`), đặt lại tên theo thứ tự luồng demo. "
        "Chụp từ ứng dụng chạy trên dữ liệu mẫu; ô đỏ đánh số đánh dấu phần cần chỉ cho BGK. "
        "Ngày giờ, thời gian xử lý và mã lượt chạy trên ảnh là của lần chụp, khác với lúc demo. Ảnh đội tự chụp thêm đặt ở `Tu_chup/`.",
        "",
        "| Ảnh | Bước | Nội dung |",
        "|---|---|---|",
    ]
    for name, source, step, what in DEMO_SHOTS:
        target = name + Path(source).suffix
        shutil.copy2(GUIDE_IMAGES / source, dest / target)
        lines.append(f"| [{target}]({target}) | {step} | {what} |")
    lines.append("")
    (dest / "README.md").write_text("\n".join(lines), encoding="utf-8")


def sanitise_log(text: str) -> str:
    for path in {str(ROOT), str(ROOT).replace("\\", "/"), str(Path.home()), str(Path.home()).replace("\\", "/")}:
        text = text.replace(path, "<repo>" if "Code-n-Cash" in path else "<home>")
    return re.sub(r"[A-Za-z]:\\Users\\[^\\\s]+", "<home>", text)


def build_tests(test_logs: Path | None):
    src = PKG / "01_SourceCode"
    dest = PKG / "05_Test"
    copy_template("05_Test/BAO_CAO_KIEM_THU.md", dest / "BAO_CAO_KIEM_THU.md")
    code = dest / "ma_kiem_thu"
    shutil.copytree(src / "tests", code / "tests", ignore=shutil.ignore_patterns("__pycache__"))
    (code / "tools").mkdir(parents=True)
    for f in (src / "tools").glob("*.py"):
        shutil.copy2(f, code / "tools" / f.name)
    shutil.copy2(src / "apps/engine/benchmark.py", code / "benchmark.py")
    (code / "scripts").mkdir()
    for name in ("smoke.mjs", "browser-smoke.mjs"):
        shutil.copy2(src / "scripts" / name, code / "scripts" / name)
    logs = dest / "nhat_ky_kiem_thu"
    logs.mkdir()
    if test_logs and test_logs.is_dir():
        for f in sorted(test_logs.glob("*.txt")):
            (logs / f.name).write_text(sanitise_log(f.read_text(encoding="utf-8", errors="replace")), encoding="utf-8")
    else:
        (logs / "CHUA_DINH_KEM.txt").write_text("Chưa đính kèm nhật ký. Chạy pnpm check và lưu đầu ra vào thư mục này.\n", encoding="utf-8")


def build_demo():
    dest = PKG / "06_Demo"
    copy_template("06_Demo/README.md", dest / "README.md")
    copy_template("06_Demo/tai_khoan_demo.csv", dest / "tai_khoan_demo.csv")
    folder = dest / "kich_ban_kiem_chung"
    run([sys.executable, str(HERE / "chay_kiem_chung.py"), "--repo", str(PKG / "01_SourceCode"), "--out", str(folder)], ROOT, folder.parent / "_kc.log")
    (folder.parent / "_kc.log").unlink()
    shutil.copy2(HERE / "chay_kiem_chung.py", folder / "chay_kiem_chung.py")
    results = json.loads((folder / "ket_qua_kiem_chung.json").read_text(encoding="utf-8"))
    lines = [
        "# Kết quả các kịch bản kiểm chứng",
        "",
        "Mỗi kịch bản sửa đúng một dữ kiện trên bản sao Data Pack (thư mục `du_lieu/`), chạy lại engine thật và so mốc mục tiêu trước và sau. "
        "Cột \"Mốc khác đổi\" đếm số mốc khác có quyết định, lý do hoặc số tiền thay đổi: luôn phải là 0, vì mỗi mốc được chấm độc lập.",
        "",
        "Chạy lại toàn bộ (từ thư mục `01_SourceCode`):",
        "",
        "```bash",
        "python ../06_Demo/kich_ban_kiem_chung/chay_kiem_chung.py --out ../06_Demo/kich_ban_kiem_chung",
        "```",
        "",
        "Chạy lại một kịch bản (ví dụ K01):",
        "",
        "```bash",
        "python apps/engine/cli.py --data ../06_Demo/kich_ban_kiem_chung/K01_XOA_NGHIEM_THU/du_lieu --output out-k01",
        "```",
        "",
        "| Mã | Mốc | Thay đổi | BGK có thể yêu cầu | Trước | Sau | Độ tin cậy sau | Mốc khác đổi |",
        "|---|---|---|---|---|---|---|---|",
    ]

    def cell(s):
        amount = s["payable_amount_vnd_mn"]
        penalty = s["penalty_amount_vnd_mn"]
        text = f"{s['predicted_decision']} · {s['reason_code']} · chi {amount}"
        return text + (f" · phạt {penalty}" if penalty not in ("0.00", "") else "")

    for r in results:
        lines.append(
            f"| {r['id'].split('_')[0]} | {r['milestone']} | {r['title']} | {r['ask']} | {cell(r['before'])} | {cell(r['after'])} | {r['after']['confidence_score']} | {len(r['otherMilestonesChanged'])} |"
        )
    lines += ["", "## Giải thích từng kịch bản", ""]
    for r in results:
        lines += [
            f"### {r['id']}",
            "",
            f"- **Thay đổi:** {r['title']} (mốc {r['milestone']}).",
            f"- **Kỳ vọng:** {r['expect']}.",
            f"- **Engine trả:** {cell(r['after'])}; luật `{r['after']['rule_id_applied']}`; thiếu `{r['after']['missing_conditions'] or '—'}`; căn cứ `{r['after']['evidence_event_ids'] or '—'}`.",
            f"- **Vì sao:** {r['why']}",
            f"- **Trace:** `{r['id']}/ket_qua/trace_{r['milestone']}.json` (giá trị mọi biến luật và kết cục từng luật).",
            "",
        ]
    lines += [
        "## Ghi chú",
        "",
        "- K09, K10, K11 sửa MS0020, là một trong 20 mẫu công khai, nên `metrics.json` của ba kịch bản này báo 19/20 mẫu khớp. Đây là chủ đích: nhãn của BTC ứng với dữ liệu gốc.",
        "- Độ tin cậy thay đổi ở K03 (0,90: hai phiếu cùng loại gần nhau, nghi gửi trùng), K08 (0,97: bản lặp đã khử), K09 (0,95: hoàn thành đúng ngày cuối ân hạn, sát ranh giới), K13 (0,90: phiếu duyệt có trước chứng từ). Độ tin cậy không bao giờ đổi quyết định.",
        "- K12, K13 tái hiện bằng dữ liệu luồng ngoại lệ hai người trên web: chủ hợp đồng `owner@cuulong.vn` đề xuất vô hiệu, kiểm soát viên `controller@cuulong.vn` duyệt (ảnh 18–20 trong `../Anh_man_hinh/`).",
        "",
    ]
    (folder / "KET_QUA_KIEM_CHUNG.md").write_text("\n".join(lines), encoding="utf-8")
    build_screenshots()


def strip_local_paths():
    """Generated logs and JSON carry absolute paths of this machine; make them package-relative."""
    replacements = []
    for base, label in ((PKG, "<goi_nop>"), (PKG.parent, "<repo>"), (Path(os.environ.get("TEMP", "/nonexistent")), "<temp>")):
        raw = str(base)
        for form in (raw, raw.replace("\\", "/"), raw.replace("\\", "\\\\")):
            replacements.append((form, label))
    replacements.sort(key=lambda pair: len(pair[0]), reverse=True)
    for folder in ("03_Output", "05_Test/nhat_ky_kiem_thu", "06_Demo/kich_ban_kiem_chung"):
        for p in (PKG / folder).rglob("*"):
            if p.is_file() and p.suffix in (".txt", ".json", ".csv", ".md"):
                text = p.read_text(encoding="utf-8", errors="replace")
                new = text
                for form, label in replacements:
                    new = new.replace(form, label)
                new = sanitise_log(new)
                if new != text:
                    p.write_text(new, encoding="utf-8")


def scan():
    problems = []
    for p in PKG.rglob("*"):
        rel = p.relative_to(PKG).as_posix()
        name = p.name
        if p.is_dir():
            if name in ("node_modules", "__pycache__", ".data", ".data-trust", ".data-test", ".data-test-trust", ".claude"):
                problems.append(f"thư mục cấm: {rel}")
            continue
        if name.endswith((".pem", ".key", ".p12", ".pfx")) or name in ("render.yaml", "CLAUDE.md", "AGENTS.md"):
            problems.append(f"tệp cấm: {rel}")
        if name == ".env" or (name.startswith(".env.") and not name.endswith(".example")):
            problems.append(f"tệp môi trường: {rel}")
        if p.suffix.lower() in TEXT_EXT and p.stat().st_size < 8_000_000:
            text = p.read_text(encoding="utf-8", errors="ignore")
            for label, pattern in (
                ("khoá riêng", r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
                ("Google API key", r"AIza[0-9A-Za-z_\-]{35}"),
                ("OpenAI-style key", r"\bsk-[A-Za-z0-9]{32,}"),
                ("URL bản deploy", r"onrender\.com"),
            ):
                if re.search(pattern, text):
                    problems.append(f"{label} trong {rel}")
    return problems


def status_file(files, problems):
    head = git("rev-parse", "--short", "HEAD").strip()
    dirty = [l for l in git("status", "--porcelain").splitlines() if l.strip()]
    size = sum(p.stat().st_size for p in PKG.rglob("*") if p.is_file())
    count = sum(1 for p in PKG.rglob("*") if p.is_file())
    lines = [
        "# Tình trạng gói nộp",
        "",
        f"- Đóng gói lúc: {datetime.now().strftime('%d/%m/%Y %H:%M')}",
        f"- Mã nguồn từ commit `{head}`" + (f", kèm {len(dirty)} thay đổi chưa commit trong thư mục làm việc" if dirty else ""),
        f"- Số tệp: {count:,}".replace(",", ".") + f" · Dung lượng: {size / 1_048_576:.1f} MB",
        f"- Tệp mã nguồn: {len(files):,}".replace(",", "."),
        f"- Quét bảo mật (khoá riêng, .env, API key, URL bản deploy): {'ĐẠT' if not problems else 'KHÔNG ĐẠT'}",
        "",
        "## Tài liệu đội cần bổ sung",
        "",
        "| Thư mục | Mức | Trạng thái | Cần đặt vào |",
        "|---|---|---|---|",
    ]
    for rel, (level, what) in USER_DROP.items():
        has = any(is_user_file(p) for p in (PKG / rel).rglob("*"))
        lines.append(f"| `{rel}/` | {level} | {'Đã có' if has else '**Còn thiếu**'} | {what} |")
    lines += ["", "Đóng gói lại sau khi sửa mã nguồn: `python tools/dong_goi_vong3/dong_goi.py --test-logs <thư mục nhật ký>`. Các thư mục trên không bị xoá khi đóng gói lại.", ""]
    if problems:
        lines += ["## Vấn đề bảo mật", ""] + [f"- {p}" for p in problems] + [""]
    (PKG / "TINH_TRANG_GOI_NOP.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--test-logs", type=Path, help="folder of test log .txt files to attach")
    parser.add_argument("--skip-slow", action="store_true", help="skip the mutation check (~1-2 minutes)")
    args = parser.parse_args()
    steps = [
        ("Chuẩn bị thư mục", prepare),
        ("01_SourceCode", None),
        ("02_Data", build_data),
        ("03_Output", lambda: build_output(args.skip_slow)),
        ("04_Document", None),
        ("05_Test", lambda: build_tests(args.test_logs)),
        ("06_Demo", build_demo),
    ]
    files = []
    for name, step in steps:
        print(f"- {name}", flush=True)
        if name == "01_SourceCode":
            files = build_source()
        elif name == "04_Document":
            build_documents(files)
            build_product_pdf()
            build_guide()
        else:
            step()
    copy_template("README.md", PKG / "README.md")
    strip_local_paths()
    problems = scan()
    status_file(files, problems)
    print(f"Xong: {PKG}")
    if problems:
        print("QUÉT BẢO MẬT KHÔNG ĐẠT:\n  " + "\n  ".join(problems))
        sys.exit(1)


if __name__ == "__main__":
    main()
