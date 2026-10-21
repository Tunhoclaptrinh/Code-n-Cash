"""Bộ test cho docs/04_DAC_TA_NGHIEP_VU.md (mục 16). Tên test mang mã T của bảng mục 16.

Ca "có trong pack" chạy trên Data Pack thật. Ca "tự tạo" dựng một hợp đồng + một milestone giả lập
nhưng dùng party và rule THẬT của Data Pack, nên kiểm được đúng logic đặc tả mà không sửa dữ liệu gốc.

Chạy từ thư mục gốc repo:  python3 -m unittest discover -s tests -v
"""

import re
import sys
import unittest
from collections import Counter
from decimal import ROUND_HALF_EVEN, Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import kiem_chung_nghiep_vu as spec  # noqa: E402

PACK = spec.Pack.load(spec.DEFAULT_DATA)
RESULTS = spec.evaluate_all(PACK)


def approver(buyer, role):
    return next(p["party_id"] for p in PACK.parties.values() if p["parent_party_id"] == buyer and p["approval_role"] == role)


class Case:
    """Một hợp đồng CT9001 (bên mua B009, NCC S021) với một milestone MS9001 dựng theo tham số."""

    BUYER, SUPPLIER, OTHER_BUYER, OTHER_SUPPLIER = "B009", "S021", "B001", "S001"

    def __init__(self, required="DELIVERY;INVOICE", mtype="DELIVERY", rule_set="R_GOODS_STD", roles="",
                 due="2026-06-10", grace=2, rate="0.10", cap="10.00", late_penalty=True, planned="1000.00",
                 invoice_required=None, quorum=None, scope=None, extra_parties=(), supplier=None):
        roles_list = [r for r in roles.split(";") if r]
        quorum = len(roles_list) if quorum is None else quorum
        tokens = [f"EVENT:{t}" for t in required.split(";")]
        if quorum:
            tokens.append(f"APPROVAL_QUORUM:{quorum}")
        tokens.append("NO_OPEN_DISPUTE")
        self.supplier = supplier or self.SUPPLIER
        self.contract = {"contract_id": "CT9001", "buyer_id": self.BUYER, "supplier_id": self.supplier,
                         "rule_set_id": rule_set}
        self.milestone = {
            "milestone_id": "MS9001", "contract_id": "CT9001", "milestone_sequence": "1", "milestone_type": mtype,
            "due_date": due, "planned_payment_vnd_mn": planned, "required_event_types": required,
            "required_condition": " AND ".join(tokens),
            "invoice_required": invoice_required or ("TRUE" if "INVOICE" in required else "FALSE"),
            "approval_required": "TRUE" if roles_list or quorum else "FALSE",
            "required_approval_quorum": str(quorum), "required_approval_roles": roles,
            "late_penalty_applicable": "TRUE" if late_penalty else "FALSE", "grace_period_days": str(grace),
            "penalty_rate_pct_per_day": rate if late_penalty else "0.00",
            "max_penalty_pct": cap if late_penalty else "0.00",
            "release_rule_code": scope or f"{rule_set}:{mtype}",
        }
        self.parties = list(PACK.parties.values()) + list(extra_parties)
        self.events = []

    def ev(self, etype, actor, ts, status=None, doc=None, ref="", declared_type=None):
        eid = f"EV9{len(self.events) + 1:04d}"
        p = next((x for x in self.parties if x["party_id"] == actor), None)
        self.events.append({
            "event_id": eid, "contract_id": "CT9001", "milestone_id": "MS9001", "event_timestamp": ts,
            "event_type": etype, "event_status": status or spec.VALID_STATUS.get(etype, "CONFIRMED"),
            "actor_party_id": actor, "actor_party_type": declared_type or (p["party_type"] if p else "UNKNOWN"),
            "actor_role": p["approval_role"] if p else "", "document_id": doc or f"DOC-{eid}",
            "reference_event_id": ref,
        })
        return eid

    def delivered(self, day="2026-06-05"):
        """Giao hàng + hoá đơn hợp lệ của đúng NCC."""
        self.ev("DELIVERY", self.supplier, f"{day}T09:00:00")
        self.ev("INVOICE", self.supplier, f"{day}T10:00:00")
        return self

    def run(self, **kw):
        pack = spec.Pack(list(PACK.contracts.values()) + [self.contract], self.parties,
                         [self.milestone], self.events, PACK.rules)
        return spec.evaluate(pack, "MS9001", **kw)


def synthetic_party(pid, ptype, role="NONE", parent="", can_approve="FALSE", allowed="", status="ACTIVE"):
    return {"party_id": pid, "party_type": ptype, "parent_party_id": parent, "approval_role": role,
            "approval_limit_vnd_mn": "", "allowed_event_types": allowed, "can_approve_payment": can_approve,
            "can_raise_dispute": "TRUE", "status": status}


class DataPackTests(unittest.TestCase):
    """Ca có sẵn trong Data Pack."""

    def test_T01_T33_sample_20_of_20_tren_17_cot(self):  # T01-T05, T08, T10, T13, T14, T18, T19, T22, T27, T33
        full, mismatches = spec.compare_samples(PACK, RESULTS)
        self.assertEqual(mismatches, [])
        self.assertEqual(full, 20)

    def test_T39_bat_bien_dau_ra_toan_pack(self):
        self.assertEqual(spec.check_invariants(PACK, RESULTS), [])

    def test_T48_phan_bo_quyet_dinh_hoi_quy(self):
        dist = Counter((r["decision"], r["reason_code"]) for r in RESULTS.values())
        self.assertEqual(dist, Counter({
            ("RELEASE", "ALL_CONDITIONS_MET"): 348, ("PENALTY", "LATE_COMPLETION"): 15,
            ("HOLD", "OPEN_DISPUTE"): 10, ("HOLD", "MISSING_REQUIRED_EVENT"): 10,
            ("HOLD", "APPROVAL_QUORUM_NOT_MET"): 10, ("HOLD", "UNAUTHORIZED_EVENT"): 6,
            ("REJECT", "REJECTION_PRESENT"): 6}))
        self.assertEqual(sum(r["payable"] for r in RESULTS.values()), Decimal("365785.87"))
        self.assertEqual(sum(r["penalty"] for r in RESULTS.values()), Decimal("102.13"))

    def test_T23_quorum_1_chua_co_approval(self):
        r = RESULTS["MS0095"]
        self.assertEqual((r["decision"], r["reason_code"], r["valid_approval_count"], r["quorum"]),
                         ("HOLD", "APPROVAL_QUORUM_NOT_MET", 0, 1))

    def test_T32_lam_tron_half_up_MS0396(self):
        r = RESULTS["MS0396"]
        self.assertEqual((r["penalty"], r["payable"]), (Decimal("10.61"), Decimal("1504.39")))
        self.assertEqual(spec.evaluate(PACK, "MS0396", rounding=ROUND_HALF_EVEN)["penalty"], Decimal("10.60"))

    def test_T35_invoice_required_khong_thay_required_event_types(self):
        activation = [k for k, m in PACK.milestones.items() if m["milestone_type"] == "ACTIVATION"]
        self.assertEqual(len(activation), 15)
        self.assertTrue(all(RESULTS[k]["decision"] == "RELEASE" for k in activation))
        self.assertTrue(all(spec.evaluate(PACK, k, enforce_invoice_flag=True)["reason_code"] == "MISSING_REQUIRED_EVENT"
                            for k in activation))

    def test_T37_chay_lai_cho_ket_qua_giong_het(self):
        self.assertEqual(spec.evaluate_all(PACK), RESULTS)

    def test_T38_moi_loai_moc_chua_co_sample_deu_co_ca_RELEASE(self):
        sampled = {PACK.milestones[d["milestone_id"]]["milestone_type"] for d in PACK.decisions}
        for t in {m["milestone_type"] for m in PACK.milestones.values()} - sampled:
            with self.subTest(milestone_type=t):
                self.assertTrue(any(r["decision"] == "RELEASE" for k, r in RESULTS.items()
                                    if PACK.milestones[k]["milestone_type"] == t))

    def test_T46_rule_doc_tu_csv_khong_hard_code(self):
        rules = [dict(r) for r in PACK.rules]
        for r in rules:
            if r["release_rule_code"] == "R_GOODS_STD:ACCEPTANCE" and r["priority"] == "70":
                r["payable_amount_formula"] = "0"
        pack = spec.Pack(PACK.contracts.values(), PACK.parties.values(), PACK.milestones.values(), PACK.events, rules)
        self.assertEqual(spec.evaluate(pack, "MS0003")["payable"], Decimal("0.00"))
        self.assertEqual(RESULTS["MS0003"]["payable"], Decimal("387.00"))

    def test_T47_rule_id_va_trang_thai(self):
        self.assertEqual((RESULTS["MS0020"]["rule_id"], RESULTS["MS0020"]["status"]), ("PR0062", "PAID_WITH_PENALTY"))
        self.assertEqual((RESULTS["MS0148"]["rule_id"], RESULTS["MS0148"]["status"]), ("PR0002", "REJECTED"))

    def test_T49_phien_ban_tai_lieu_khop_script(self):
        doc = (Path(__file__).resolve().parent.parent / "docs" / "04_DAC_TA_NGHIEP_VU.md").read_text(encoding="utf-8")
        match = re.search(r"^\| Phiên bản \| \*\*(\d+\.\d+)\*\*", doc, re.M)
        self.assertIsNotNone(match, "Không tìm thấy dòng phiên bản trong tài liệu")
        self.assertEqual(match.group(1), spec.SPEC_VERSION)


class SyntheticTests(unittest.TestCase):
    """Ca tự tạo cho những tình huống Data Pack chưa có."""

    def assertDecision(self, r, decision, reason):
        self.assertEqual((r["decision"], r["reason_code"]), (decision, reason), r["issues"] or r["notes"])

    def test_T00_luong_chuan(self):
        r = Case().delivered().run()
        self.assertDecision(r, "RELEASE", "ALL_CONDITIONS_MET")
        self.assertEqual((r["payable"], r["penalty"], r["rule_id"]), (Decimal("1000.00"), Decimal("0.00"), "PR0015"))

    def test_T06_cung_loai_mot_dung_mot_sai_quyen(self):
        c = Case().delivered()
        c.ev("DELIVERY", Case.BUYER, "2026-06-05T11:00:00")
        self.assertDecision(c.run(), "HOLD", "UNAUTHORIZED_EVENT")

    def test_T07_ben_cua_hop_dong_khac(self):
        c = Case()
        c.ev("DELIVERY", Case.OTHER_SUPPLIER, "2026-06-05T09:00:00")
        c.ev("INVOICE", Case.SUPPLIER, "2026-06-05T10:00:00")
        self.assertDecision(c.run(), "HOLD", "UNAUTHORIZED_EVENT")

    def test_T09_dung_quyen_sai_trang_thai(self):
        c = Case()
        c.ev("DELIVERY", Case.SUPPLIER, "2026-06-05T09:00:00", status="REJECTED")
        c.ev("INVOICE", Case.SUPPLIER, "2026-06-05T10:00:00")
        r = c.run()
        self.assertDecision(r, "HOLD", "MISSING_REQUIRED_EVENT")
        self.assertEqual((r["missing"], r["unauthorized"]), (["DELIVERY"], []))

    def test_T11_ban_lap_khong_bu_cho_loai_khac(self):
        c = Case()
        c.ev("DELIVERY", Case.SUPPLIER, "2026-06-05T09:00:00", doc="DN-1")
        c.ev("DELIVERY", Case.SUPPLIER, "2026-06-05T09:02:00", doc="DN-1")
        r = c.run()
        self.assertDecision(r, "HOLD", "MISSING_REQUIRED_EVENT")
        self.assertEqual((r["missing"], len(r["duplicates"])), (["INVOICE"], 1))

    def test_T12_cung_chung_tu_khac_nguoi_gui_khong_gop(self):
        c = Case().delivered()
        c.ev("DELIVERY", Case.BUYER, "2026-06-05T09:02:00", doc=c.events[0]["document_id"])
        r = c.run()
        self.assertDecision(r, "HOLD", "UNAUTHORIZED_EVENT")
        self.assertEqual(r["duplicates"], [])

    def test_T15_resolve_khong_hop_le_khong_dong_tranh_chap(self):
        variants = {
            "tham chiếu event không phải dispute": lambda c, d: c.ev("DISPUTE_RESOLVED", Case.BUYER, "2026-06-07T09:00:00", ref=c.events[0]["event_id"]),
            "trước lúc mở": lambda c, d: c.ev("DISPUTE_RESOLVED", Case.BUYER, "2026-06-05T08:00:00", ref=d),
            "do NCC đóng": lambda c, d: c.ev("DISPUTE_RESOLVED", Case.SUPPLIER, "2026-06-07T09:00:00", ref=d),
            "sai trạng thái": lambda c, d: c.ev("DISPUTE_RESOLVED", Case.BUYER, "2026-06-07T09:00:00", ref=d, status="OPEN"),
        }
        for name, add_resolve in variants.items():
            with self.subTest(name):
                c = Case().delivered()
                d = c.ev("DISPUTE_OPENED", Case.SUPPLIER, "2026-06-05T12:00:00")
                add_resolve(c, d)
                self.assertDecision(c.run(), "HOLD", "OPEN_DISPUTE")

    def test_T14b_resolve_hop_le_cua_approver_ben_mua(self):
        c = Case().delivered()
        d = c.ev("DISPUTE_OPENED", Case.SUPPLIER, "2026-06-05T12:00:00")
        c.ev("DISPUTE_RESOLVED", approver(Case.BUYER, "CONTRACT_OWNER"), "2026-06-06T12:00:00", ref=d)
        r = c.run()
        self.assertDecision(r, "RELEASE", "ALL_CONDITIONS_MET")
        self.assertNotIn(d, r["evidence"])

    def test_T16_hai_tranh_chap_mot_duoc_dong(self):
        c = Case().delivered()
        d1 = c.ev("DISPUTE_OPENED", Case.BUYER, "2026-06-05T12:00:00")
        d2 = c.ev("DISPUTE_OPENED", Case.SUPPLIER, "2026-06-05T13:00:00")
        c.ev("DISPUTE_RESOLVED", Case.BUYER, "2026-06-06T12:00:00", ref=d1)
        r = c.run()
        self.assertDecision(r, "HOLD", "OPEN_DISPUTE")
        self.assertEqual(r["open_dispute_ids"], [d2])

    def test_T17_tranh_chap_va_rejection(self):
        c = Case().delivered()
        c.ev("DISPUTE_OPENED", Case.BUYER, "2026-06-05T12:00:00")
        c.ev("REJECTION", approver(Case.BUYER, "CONTRACT_OWNER"), "2026-06-05T13:00:00")
        self.assertDecision(c.run(), "HOLD", "OPEN_DISPUTE")

    def test_T20_rejection_cua_finance_hoac_secondary(self):
        for role in ("FINANCE_APPROVER", "SECONDARY_APPROVER"):
            with self.subTest(role):
                c = Case().delivered()
                c.ev("REJECTION", approver(Case.BUYER, role), "2026-06-05T13:00:00")
                self.assertDecision(c.run(), "REJECT", "REJECTION_PRESENT")

    def test_T21_rejection_khong_hop_le_chan_tra_tien(self):
        c = Case().delivered()
        c.ev("REJECTION", Case.SUPPLIER, "2026-06-05T13:00:00")
        r = c.run()
        self.assertDecision(r, "HOLD", "UNRESOLVED_CONDITION")
        self.assertEqual(r["rule_id"], "PR0016")

    def test_T21b_bat_thuong_khong_doi_ly_do_chan(self):
        c = Case()
        c.ev("DELIVERY", Case.SUPPLIER, "2026-06-05T09:00:00")
        c.ev("REJECTION", Case.SUPPLIER, "2026-06-05T13:00:00")
        self.assertDecision(c.run(), "HOLD", "MISSING_REQUIRED_EVENT")

    def test_T24_mot_approver_duyet_hai_lan(self):
        c = Case(roles="CONTRACT_OWNER;SECONDARY_APPROVER").delivered()
        owner = approver(Case.BUYER, "CONTRACT_OWNER")
        c.ev("APPROVAL", owner, "2026-06-05T17:00:00")
        c.ev("APPROVAL", owner, "2026-06-05T17:10:00")
        r = c.run()
        self.assertDecision(r, "HOLD", "APPROVAL_QUORUM_NOT_MET")
        self.assertEqual(r["valid_approval_count"], 1)

    def test_T25_hai_nguoi_cung_vai_tro_khong_thay_hai_vai_tro(self):
        second_owner = synthetic_party("A9001", "APPROVER", "CONTRACT_OWNER", Case.BUYER, "TRUE", "APPROVAL;REJECTION")
        c = Case(roles="CONTRACT_OWNER;FINANCE_APPROVER", extra_parties=[second_owner]).delivered()
        c.ev("APPROVAL", approver(Case.BUYER, "CONTRACT_OWNER"), "2026-06-05T17:00:00")
        c.ev("APPROVAL", "A9001", "2026-06-05T17:10:00")
        self.assertDecision(c.run(), "HOLD", "APPROVAL_QUORUM_NOT_MET")

    def test_T26_approval_khong_hop_le_khong_duoc_tinh(self):
        no_right = synthetic_party("A9002", "APPROVER", "CONTRACT_OWNER", Case.BUYER, "FALSE", "APPROVAL;REJECTION")
        variants = {
            "sai vai trò": approver(Case.BUYER, "FINANCE_APPROVER"),
            "approver của bên mua khác": approver(Case.OTHER_BUYER, "CONTRACT_OWNER"),
            "can_approve_payment = FALSE": "A9002",
        }
        for name, actor in variants.items():
            with self.subTest(name):
                c = Case(roles="CONTRACT_OWNER", extra_parties=[no_right]).delivered()
                c.ev("APPROVAL", actor, "2026-06-05T17:00:00")
                r = c.run()
                self.assertDecision(r, "HOLD", "APPROVAL_QUORUM_NOT_MET")
                self.assertEqual(r["valid_approval_count"], 0)

    def test_T28_dung_bien_han_cong_an_han_khong_phat(self):
        r = Case(due="2026-06-10", grace=2).delivered(day="2026-06-12").run()
        self.assertDecision(r, "RELEASE", "ALL_CONDITIONS_MET")

    def test_T28b_qua_bien_mot_ngay_bi_phat(self):
        r = Case(due="2026-06-10", grace=2).delivered(day="2026-06-13").run()
        self.assertDecision(r, "PENALTY", "LATE_COMPLETION")
        self.assertEqual((r["days_late"], r["penalty"], r["payable"]), (1, Decimal("1.00"), Decimal("999.00")))

    def test_T29_tre_nhung_moc_khong_ap_phat(self):
        r = Case(late_penalty=False).delivered(day="2026-09-01").run()
        self.assertDecision(r, "RELEASE", "ALL_CONDITIONS_MET")

    def test_T30_phat_vuot_tran(self):
        r = Case(rate="0.20", cap="5.00").delivered(day="2026-12-31").run()
        self.assertDecision(r, "PENALTY", "LATE_COMPLETION")
        self.assertEqual((r["penalty"], r["payable"]), (Decimal("50.00"), Decimal("950.00")))

    def test_T31_tre_nhung_bi_chan(self):
        c = Case()
        c.ev("DELIVERY", Case.SUPPLIER, "2026-09-01T09:00:00")
        r = c.run()
        self.assertDecision(r, "HOLD", "MISSING_REQUIRED_EVENT")
        self.assertEqual((r["penalty"], r["days_late"]), (Decimal("0.00"), 0))
        c = Case(roles="CONTRACT_OWNER").delivered(day="2026-09-01")
        r = c.run()
        self.assertDecision(r, "HOLD", "APPROVAL_QUORUM_NOT_MET")
        self.assertEqual(r["penalty"], Decimal("0.00"))

    def test_T34_che_do_as_of(self):
        c = Case(due="2026-06-10").delivered(day="2026-06-05")
        self.assertEqual(c.run(as_of="2026-06-01T00:00:00")["status"], "PLANNED")
        c.ev("ACCEPTANCE", Case.BUYER, "2026-05-30T09:00:00")
        self.assertEqual(c.run(as_of="2026-06-01T00:00:00")["status"], "IN_PROGRESS")
        r = c.run(as_of="2026-06-20T00:00:00")
        self.assertDecision(r, "RELEASE", "ALL_CONDITIONS_MET")

    def test_T36_loi_cau_truc_ve_rule_80(self):
        r = Case(roles="CONTRACT_OWNER", quorum=2).delivered().run()
        self.assertDecision(r, "HOLD", "UNRESOLVED_CONDITION")
        self.assertEqual(r["rule_id"], "PR0016")
        r = Case(scope="R_GOODS_STD:KHONG_TON_TAI").delivered().run()
        self.assertDecision(r, "HOLD", "UNRESOLVED_CONDITION")
        self.assertEqual((r["rule_id"], r["payable"]), ("", Decimal("0.00")))

    def test_T40_vo_hieu_event_sai_quyen_go_chan(self):
        c = Case()
        bad = c.ev("DELIVERY", Case.BUYER, "2026-06-04T09:00:00")
        c.delivered()
        self.assertDecision(c.run(), "HOLD", "UNAUTHORIZED_EVENT")
        r = c.run(voided={bad})
        self.assertDecision(r, "RELEASE", "ALL_CONDITIONS_MET")
        self.assertEqual(r["voided"], [bad])
        self.assertNotIn(bad, r["evidence"])

    def test_T40b_vo_hieu_khong_tu_tao_bang_chung(self):
        c = Case()
        bad = c.ev("DELIVERY", Case.BUYER, "2026-06-04T09:00:00")
        c.ev("INVOICE", Case.SUPPLIER, "2026-06-05T10:00:00")
        self.assertDecision(c.run(voided={bad}), "HOLD", "MISSING_REQUIRED_EVENT")

    def test_T41_khong_vo_hieu_duoc_rejection_dispute_hay_event_hop_le(self):
        c = Case().delivered()
        rej = c.ev("REJECTION", approver(Case.BUYER, "CONTRACT_OWNER"), "2026-06-05T13:00:00")
        r = c.run(voided={rej})
        self.assertDecision(r, "REJECT", "REJECTION_PRESENT")
        self.assertTrue(r["notes"])
        c = Case().delivered()
        d = c.ev("DISPUTE_OPENED", Case.BUYER, "2026-06-05T12:00:00")
        self.assertDecision(c.run(voided={d}), "HOLD", "OPEN_DISPUTE")
        c = Case().delivered()
        self.assertEqual(c.run(voided={c.events[0]["event_id"]})["voided"], [])

    def test_T42_event_nghiep_vu_khong_lien_quan_bi_bo_qua(self):
        c = Case().delivered()
        x = c.ev("ACCEPTANCE", Case.SUPPLIER, "2026-06-05T11:00:00")
        r = c.run()
        self.assertDecision(r, "RELEASE", "ALL_CONDITIONS_MET")
        self.assertEqual((r["unrelated"], r["unauthorized"]), ([x], []))

    def test_T43_khong_tin_loai_ben_khai_trong_event(self):
        c = Case()
        c.ev("DELIVERY", Case.BUYER, "2026-06-05T09:00:00", declared_type="SUPPLIER")
        c.ev("INVOICE", Case.SUPPLIER, "2026-06-05T10:00:00")
        self.assertDecision(c.run(), "HOLD", "UNAUTHORIZED_EVENT")

    def test_T44_ncc_khong_active(self):
        inactive = synthetic_party("S9001", "SUPPLIER", status="INACTIVE")
        r = Case(supplier="S9001", extra_parties=[inactive]).delivered().run()
        self.assertDecision(r, "HOLD", "UNAUTHORIZED_EVENT")

    def test_T45_actor_khong_ton_tai_chan_tra_tien(self):
        c = Case().delivered()
        c.ev("APPROVAL", "A9999", "2026-06-05T17:00:00")
        self.assertDecision(c.run(), "HOLD", "UNRESOLVED_CONDITION")


if __name__ == "__main__":
    unittest.main()
