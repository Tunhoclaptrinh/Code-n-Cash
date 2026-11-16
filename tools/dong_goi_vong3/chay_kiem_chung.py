"""Verification scenarios for the round 3 Q&A.

Each scenario copies the official Data Pack, changes one fact (remove or add an event, change a
parameter, change who recorded a document), runs the real engine CLI on the copy and compares the
target milestone before and after. Nothing here decides anything: the engine does.

Usage (from the repository root, or with --repo pointing at it):
    python chay_kiem_chung.py --out <folder>
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
import subprocess
import sys
from pathlib import Path

DATA_PACK = Path("BangD-Case4/DataPack-CASE4_SmartContractWorkflow")
FIELDS = [
    "predicted_decision",
    "reason_code",
    "payable_amount_vnd_mn",
    "penalty_amount_vnd_mn",
    "rule_id_applied",
    "missing_conditions",
    "evidence_event_ids",
    "confidence_score",
]


def event(event_id, contract, milestone, seq, ts, etype, status, actor, actor_type, role, doc, ref=""):
    return {
        "event_id": event_id,
        "contract_id": contract,
        "milestone_id": milestone,
        "contract_event_sequence": str(seq),
        "event_timestamp": ts,
        "event_type": etype,
        "event_status": status,
        "actor_party_id": actor,
        "actor_party_type": actor_type,
        "actor_role": role,
        "event_source": "PORTAL",
        "document_id": doc,
        "amount_vnd_mn": "",
        "reference_event_id": ref,
        "event_note": "Kich ban kiem chung.",
        "data_is_synthetic": "TRUE",
    }


def drop(ids):
    return lambda events, milestones: ([e for e in events if e["event_id"] not in ids], milestones)


def add(*rows):
    return lambda events, milestones: (events + list(rows), milestones)


def edit_event(event_id, **changes):
    def apply(events, milestones):
        for e in events:
            if e["event_id"] == event_id:
                e.update(changes)
        return events, milestones

    return apply


def edit_milestone(milestone_id, **changes):
    def apply(events, milestones):
        for m in milestones:
            if m["milestone_id"] == milestone_id:
                m.update(changes)
        return events, milestones

    return apply


# MS0029 (CT0007, go-live acceptance, 4,220 million): needs GO_LIVE, ACCEPTANCE and INVOICE, and
# approvals from CONTRACT_OWNER and SECONDARY_APPROVER. Baseline: RELEASE in full.
# MS0020 (CT0005, final acceptance, 900 million): due 02/11/2026, grace 5 days, 0.15%/day, cap 8%;
# completed 13/11/2026 (latest required document). Baseline: PENALTY 8.10, pays 891.90.
SCENARIOS = [
    {
        "id": "K01_XOA_NGHIEM_THU",
        "milestone": "MS0029",
        "title": "Xoá biên bản nghiệm thu (EV00065)",
        "ask": "Bổ sung/xoá một dữ kiện",
        "expect": "HOLD, lý do MISSING_REQUIRED_EVENT, thiếu ACCEPTANCE, không chi",
        "why": "Thiếu một chứng từ bắt buộc là đủ để giữ tiền (luật ưu tiên 40), dù vẫn có go-live, hoá đơn và đủ phê duyệt.",
        "change": drop({"EV00065"}),
    },
    {
        "id": "K02_XOA_PHE_DUYET_CAP_2",
        "milestone": "MS0029",
        "title": "Xoá phê duyệt của người duyệt cấp 2 (EV00068)",
        "ask": "Bổ sung/xoá một dữ kiện",
        "expect": "HOLD, lý do APPROVAL_QUORUM_NOT_MET",
        "why": "Mốc cần 2 vai trò (chủ hợp đồng và duyệt cấp 2); còn 1 vai trò thì chưa đủ quorum (luật ưu tiên 50).",
        "change": drop({"EV00068"}),
    },
    {
        "id": "K03_HAI_PHIEU_CUNG_VAI_TRO",
        "milestone": "MS0029",
        "title": "Phiếu thứ hai cũng là CONTRACT_OWNER thay vì SECONDARY_APPROVER",
        "ask": "Thay đổi một điều kiện",
        "expect": "HOLD, lý do APPROVAL_QUORUM_NOT_MET",
        "why": "Phê duyệt đếm theo vai trò, không đếm theo số phiếu: hai phiếu cùng vai trò chỉ tính một (Lỗi 4 trong README BTC).",
        "change": edit_event("EV00068", actor_party_id="A025", actor_role="CONTRACT_OWNER", document_id="APR-CT0007-42"),
    },
    {
        "id": "K04_MO_TRANH_CHAP",
        "milestone": "MS0029",
        "title": "Nhà cung cấp mở tranh chấp ở mốc này",
        "ask": "Bổ sung/xoá một dữ kiện",
        "expect": "HOLD, lý do OPEN_DISPUTE",
        "why": "Tranh chấp đang mở luôn được xét trước (luật ưu tiên 10); tranh chấp tính theo mốc nên các mốc khác của CT0007 không đổi.",
        "change": add(event("EV90001", "CT0007", "MS0029", 90, "2026-12-03T09:00:00", "DISPUTE_OPENED", "OPEN", "S011", "SUPPLIER", "SUPPLIER", "DSP-CT0007-90")),
    },
    {
        "id": "K05_MO_VA_DONG_TRANH_CHAP",
        "milestone": "MS0029",
        "title": "Mở tranh chấp, rồi bên mua đóng có tham chiếu đúng",
        "ask": "Chạy lại một trường hợp",
        "expect": "RELEASE như ban đầu, 4.220",
        "why": "Bản đóng tham chiếu đúng lần mở thì tranh chấp hết hiệu lực; đóng tranh chấp không đẩy ngày hoàn thành.",
        "change": add(
            event("EV90001", "CT0007", "MS0029", 90, "2026-12-03T09:00:00", "DISPUTE_OPENED", "OPEN", "S011", "SUPPLIER", "SUPPLIER", "DSP-CT0007-90"),
            event("EV90002", "CT0007", "MS0029", 91, "2026-12-04T15:00:00", "DISPUTE_RESOLVED", "RESOLVED", "B009", "BUYER", "BUYER", "DSR-CT0007-90", "EV90001"),
        ),
    },
    {
        "id": "K06_HOA_DON_SAI_THAM_QUYEN",
        "milestone": "MS0029",
        "title": "Hoá đơn (EV00066) ghi là do bên mua B009 lập",
        "ask": "Thay đổi một điều kiện",
        "expect": "HOLD, lý do UNAUTHORIZED_EVENT",
        "why": "Hoá đơn phải do nhà cung cấp lập; thẩm quyền tra theo danh sách các bên, không tin loại bên ghi trên sự kiện (luật ưu tiên 30).",
        "change": edit_event("EV00066", actor_party_id="B009", actor_party_type="BUYER", actor_role="BUYER"),
    },
    {
        "id": "K07_PHIEU_TU_CHOI",
        "milestone": "MS0029",
        "title": "Chủ hợp đồng gửi phiếu từ chối",
        "ask": "Bổ sung/xoá một dữ kiện",
        "expect": "REJECT, lý do REJECTION_PRESENT, không chi",
        "why": "Phiếu từ chối hợp lệ của bên mua thắng mọi luật trả tiền (luật ưu tiên 20).",
        "change": add(event("EV90003", "CT0007", "MS0029", 92, "2026-12-03T10:00:00", "REJECTION", "REJECTED", "A025", "APPROVER", "CONTRACT_OWNER", "REJ-CT0007-90")),
    },
    {
        "id": "K08_HOA_DON_GUI_LAP",
        "milestone": "MS0029",
        "title": "Hoá đơn gửi lặp: cùng số chứng từ, 2 phút sau",
        "ask": "Dữ liệu bất thường",
        "expect": "RELEASE 4.220 như cũ, độ tin cậy hạ còn 0,97",
        "why": "Engine khử trùng lặp, giữ bản sớm nhất; quyết định không đổi nhưng hạ điểm để người duyệt biết hồ sơ có bản gửi lại.",
        "change": add(event("EV90004", "CT0007", "MS0029", 93, "2026-12-02T11:22:00", "INVOICE", "CONFIRMED", "S011", "SUPPLIER", "SUPPLIER", "INV-CT0007-04")),
    },
    {
        "id": "K09_TANG_AN_HAN",
        "milestone": "MS0020",
        "title": "Tăng ân hạn của MS0020 từ 5 lên 11 ngày",
        "ask": "Thay đổi một tham số",
        "expect": "RELEASE 900, không phạt",
        "why": "Hạn cuối = 02/11 + 11 ngày = 13/11, đúng ngày hoàn thành, nên trễ = 0.",
        "change": edit_milestone("MS0020", grace_period_days="11"),
    },
    {
        "id": "K10_TANG_MUC_PHAT",
        "milestone": "MS0020",
        "title": "Tăng mức phạt của MS0020 từ 0,15% lên 2%/ngày",
        "ask": "Thay đổi một tham số",
        "expect": "PENALTY, phạt chạm trần 8% = 72,00, chi 828,00",
        "why": "6 ngày × 2% = 12% vượt trần 8%, nên phạt = 8% × 900 = 72,00.",
        "change": edit_milestone("MS0020", penalty_rate_pct_per_day="2.00"),
    },
    {
        "id": "K11_PHE_DUYET_MUON",
        "milestone": "MS0020",
        "title": "Chủ hợp đồng phê duyệt muộn hơn 17 ngày (30/11)",
        "ask": "Thay đổi một điều kiện",
        "expect": "PENALTY 8,10 như cũ",
        "why": "Ngày hoàn thành lấy theo chứng từ bắt buộc muộn nhất, không theo lúc duyệt: người duyệt bấm muộn không làm nhà cung cấp bị phạt thêm.",
        "change": edit_event("EV00039", event_timestamp="2026-11-30T17:10:00"),
    },
    # MS0362 (CT0090, buyer B003): the ACCEPTANCE EV01006 was recorded by the supplier S008, so the
    # engine holds the milestone (UNAUTHORIZED_EVENT). In the app this is the two-person exception.
    {
        "id": "K12_VO_HIEU_CHUNG_TU_SAI_THAM_QUYEN",
        "milestone": "MS0362",
        "title": "Vô hiệu biên bản nghiệm thu do nhà cung cấp lập (EV01006)",
        "ask": "Trường hợp cần human-in-the-loop",
        "expect": "Vẫn HOLD, nhưng lý do chuyển từ UNAUTHORIZED_EVENT sang MISSING_REQUIRED_EVENT (thiếu ACCEPTANCE)",
        "why": "Vô hiệu chỉ loại chứng từ sai khỏi hồ sơ, không tự tạo căn cứ chi; mốc vẫn chờ bên mua lập nghiệm thu.",
        "change": drop({"EV01006"}),
    },
    {
        "id": "K13_VO_HIEU_ROI_BEN_MUA_NGHIEM_THU",
        "milestone": "MS0362",
        "title": "Vô hiệu EV01006, rồi bên mua B003 lập biên bản nghiệm thu",
        "ask": "Trường hợp cần human-in-the-loop",
        "expect": "RELEASE 255,00",
        "why": "Đủ chứng từ do đúng bên lập và đủ phê duyệt. Độ tin cậy 0,90 vì phiếu duyệt có trước chứng từ mới (cảnh báo thứ tự).",
        "change": lambda events, milestones: add(
            event("EV90010", "CT0090", "MS0362", 90, "2026-04-22T09:00:00", "ACCEPTANCE", "CONFIRMED", "B003", "BUYER", "BUYER", "ACC-CT0090-90")
        )(*drop({"EV01006"})(events, milestones)),
    },
]


def read(path):
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return reader.fieldnames, list(reader)


def write(path, fields, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def run_engine(repo, data_dir, out_dir):
    cmd = [sys.executable, str(repo / "apps/engine/cli.py"), "--output", str(out_dir)]
    if data_dir is not None:
        cmd[2:2] = ["--data", str(data_dir)]
    done = subprocess.run(cmd, cwd=repo, capture_output=True, text=True, encoding="utf-8")
    if done.returncode != 0:
        raise SystemExit(f"Engine failed for {data_dir}:\n{done.stdout}\n{done.stderr}")
    _, rows = read(out_dir / "submission_output.csv")
    return {r["milestone_id"]: r for r in rows}


def summary(row):
    return {k: row[k] for k in FIELDS}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=".", help="repository root (contains apps/ and BangD-Case4/)")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    repo = Path(args.repo).resolve()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    source = repo / DATA_PACK

    baseline = run_engine(repo, source, out / "_goc")
    results = []
    for sc in SCENARIOS:
        folder = out / sc["id"]
        data = folder / "du_lieu"
        if folder.exists():
            shutil.rmtree(folder)
        shutil.copytree(source, data)
        ev_fields, events = read(data / "01_data/events.csv")
        ms_fields, milestones = read(data / "01_data/milestones.csv")
        events, milestones = sc["change"](events, milestones)
        write(data / "01_data/events.csv", ev_fields, events)
        write(data / "01_data/milestones.csv", ms_fields, milestones)
        after = run_engine(repo, data, folder / "ket_qua")
        target = sc["milestone"]
        # Keep the trace of the target milestone only; the full audit.json is ~2 MB per run.
        audit_path = folder / "ket_qua" / "audit.json"
        traces = json.loads(audit_path.read_text(encoding="utf-8"))
        trace = next(t for t in traces if t["result"]["milestone_id"] == target)
        (folder / "ket_qua" / f"trace_{target}.json").write_text(json.dumps(trace, ensure_ascii=False, indent=1), encoding="utf-8")
        audit_path.unlink()
        others = sorted(
            mid
            for mid in baseline
            if mid != target
            and any(baseline[mid][k] != after[mid][k] for k in FIELDS if k != "confidence_score")
        )
        results.append(
            {
                "id": sc["id"],
                "milestone": target,
                "title": sc["title"],
                "ask": sc["ask"],
                "expect": sc["expect"],
                "why": sc["why"],
                "before": summary(baseline[target]),
                "after": summary(after[target]),
                "otherMilestonesChanged": others,
            }
        )
        print(f"{sc['id']}: {baseline[target]['predicted_decision']} -> {after[target]['predicted_decision']}"
              f" {after[target]['reason_code']} payable {after[target]['payable_amount_vnd_mn']}"
              f" confidence {after[target]['confidence_score']} others changed {len(others)}")

    (out / "ket_qua_kiem_chung.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    shutil.rmtree(out / "_goc")


if __name__ == "__main__":
    main()
