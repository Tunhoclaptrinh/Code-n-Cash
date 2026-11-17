"""BR-21: the acceptance review window of a contract created in the app.

The supplier asks for acceptance; the buyer must issue its documents within the contract's window or return
the request with a reason. A buyer document issued after the window counts at the window's end, so a late
acceptance by the buyer does not make the supplier late. Data Pack contracts set no window and keep BR-11.
"""
import sys
import unittest
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_dac_ta_nghiep_vu import Case, approver, spec  # noqa: E402


def acceptance_case(days="5", required="ACCEPTANCE", due="2026-10-10", grace=2):
    case = Case(required=required, mtype="ACCEPTANCE", roles="CONTRACT_OWNER", due=due, grace=grace, rate="0.10")
    if days is not None:
        case.contract["acceptance_review_days"] = days
    return case


def request(case, ts):
    return case.ev("ACCEPTANCE_REQUESTED", Case.SUPPLIER, ts, status="CONFIRMED")


def give_back(case, ts):
    return case.ev("ACCEPTANCE_RETURNED", Case.BUYER, ts, status="RETURNED")


def accept(case, ts):
    case.ev("ACCEPTANCE", Case.BUYER, ts)
    case.ev("APPROVAL", approver(Case.BUYER, "CONTRACT_OWNER"), ts)


class AcceptanceReviewWindowTests(unittest.TestCase):
    def test_without_a_window_the_buyer_date_counts_as_before(self):
        case = acceptance_case(days=None)
        request(case, "2026-10-01T09:00:00")
        accept(case, "2026-10-20T09:00:00")
        result = case.run()
        self.assertNotIn("review_window", result)
        self.assertEqual(result["completion_ts"], "2026-10-20T09:00:00")
        self.assertEqual(result["days_late"], 8)
        self.assertEqual(result["decision"], "PENALTY")

    def test_a_late_acceptance_counts_at_the_end_of_the_window(self):
        case = acceptance_case()
        req = request(case, "2026-10-01T09:00:00")
        accept(case, "2026-10-20T09:00:00")
        result = case.run()
        window = result["review_window"]
        self.assertEqual((window["request_id"], window["starts_at"], window["deadline"]),
                         (req, "2026-10-01T09:00:00", "2026-10-06T09:00:00"))
        self.assertEqual(window["deemed_types"], ["ACCEPTANCE"])
        self.assertEqual(result["completion_ts"], "2026-10-06T09:00:00")
        self.assertEqual((result["days_late"], result["decision"], result["penalty"]), (0, "RELEASE", Decimal("0.00")))

    def test_a_late_request_still_makes_the_supplier_late(self):
        case = acceptance_case()
        request(case, "2026-10-15T09:00:00")
        accept(case, "2026-10-25T09:00:00")
        result = case.run()
        self.assertEqual(result["completion_ts"], "2026-10-20T09:00:00")
        self.assertEqual(result["days_late"], 8)
        self.assertEqual((result["decision"], result["penalty"], result["payable"]),
                         ("PENALTY", Decimal("8.00"), Decimal("992.00")))

    def test_an_acceptance_inside_the_window_counts_at_its_own_date(self):
        case = acceptance_case()
        request(case, "2026-10-01T09:00:00")
        accept(case, "2026-10-04T15:00:00")
        result = case.run()
        self.assertEqual(result["completion_ts"], "2026-10-04T15:00:00")
        self.assertEqual(result["review_window"]["deemed_types"], [])

    def test_a_return_inside_the_window_cancels_the_request(self):
        case = acceptance_case()
        first = request(case, "2026-10-01T09:00:00")
        give_back(case, "2026-10-03T09:00:00")
        second = request(case, "2026-10-08T09:00:00")
        accept(case, "2026-10-20T09:00:00")
        result = case.run()
        window = result["review_window"]
        self.assertEqual((window["returned_ids"], window["request_id"]), ([first], second))
        self.assertEqual(result["completion_ts"], "2026-10-13T09:00:00")
        self.assertEqual(result["days_late"], 1)

    def test_a_request_in_the_same_second_as_a_return_opens_a_new_window(self):
        case = acceptance_case()
        first = request(case, "2026-10-01T09:00:00")
        give_back(case, "2026-10-03T09:00:00")
        second = request(case, "2026-10-03T09:00:00")
        accept(case, "2026-10-20T09:00:00")
        window = case.run()["review_window"]
        self.assertEqual((window["returned_ids"], window["request_id"]), ([first], second))
        self.assertEqual(window["deadline"], "2026-10-08T09:00:00")

    def test_a_repeated_request_keeps_the_first_window(self):
        case = acceptance_case()
        first = request(case, "2026-10-01T09:00:00")
        request(case, "2026-10-04T09:00:00")
        accept(case, "2026-10-20T09:00:00")
        result = case.run()
        self.assertEqual(result["review_window"]["request_id"], first)
        self.assertEqual(result["completion_ts"], "2026-10-06T09:00:00")

    def test_a_return_after_the_window_changes_nothing(self):
        case = acceptance_case()
        req = request(case, "2026-10-01T09:00:00")
        give_back(case, "2026-10-09T09:00:00")
        accept(case, "2026-10-20T09:00:00")
        result = case.run()
        self.assertEqual((result["review_window"]["request_id"], result["review_window"]["returned_ids"]), (req, []))
        self.assertEqual(result["completion_ts"], "2026-10-06T09:00:00")

    def test_the_window_starts_once_the_supplier_documents_are_complete(self):
        case = acceptance_case(required="DELIVERY;ACCEPTANCE")
        request(case, "2026-10-01T09:00:00")
        case.ev("DELIVERY", Case.SUPPLIER, "2026-10-04T10:00:00")
        accept(case, "2026-10-20T09:00:00")
        result = case.run()
        self.assertEqual(result["review_window"]["starts_at"], "2026-10-04T10:00:00")
        self.assertEqual(result["completion_ts"], "2026-10-09T10:00:00")
        self.assertEqual(result["days_late"], 0)

    def test_no_deadline_while_supplier_documents_are_missing(self):
        case = acceptance_case(required="DELIVERY;ACCEPTANCE")
        req = request(case, "2026-10-01T09:00:00")
        result = case.run()
        self.assertEqual(result["review_window"]["request_id"], req)
        self.assertIsNone(result["review_window"]["deadline"])

    def test_the_window_never_replaces_the_acceptance_itself(self):
        case = acceptance_case()
        request(case, "2026-10-01T09:00:00")
        case.ev("APPROVAL", approver(Case.BUYER, "CONTRACT_OWNER"), "2026-10-07T09:00:00")
        result = case.run()
        self.assertEqual(result["missing"], ["ACCEPTANCE"])
        self.assertIsNone(result["completion_ts"])
        self.assertEqual((result["decision"], result["payable"]), ("HOLD", Decimal("0.00")))

    def test_only_the_supplier_may_request_and_only_the_buyer_may_return(self):
        case = acceptance_case()
        case.ev("ACCEPTANCE_REQUESTED", Case.BUYER, "2026-10-01T09:00:00", status="CONFIRMED")
        accept(case, "2026-10-20T09:00:00")
        result = case.run()
        self.assertIsNone(result["review_window"]["request_id"])
        self.assertEqual(result["completion_ts"], "2026-10-20T09:00:00")

        case = acceptance_case()
        req = request(case, "2026-10-01T09:00:00")
        case.ev("ACCEPTANCE_RETURNED", Case.SUPPLIER, "2026-10-02T09:00:00", status="RETURNED")
        accept(case, "2026-10-20T09:00:00")
        result = case.run()
        self.assertEqual(result["review_window"]["request_id"], req)

    def test_an_unreadable_window_holds_the_milestone(self):
        for value in ("abc", "0", "61"):
            case = acceptance_case(days=value)
            request(case, "2026-10-01T09:00:00")
            accept(case, "2026-10-08T09:00:00")
            result = case.run()
            self.assertNotIn("review_window", result)
            self.assertIn("acceptance_review_days không đọc được", result["issues"])
            self.assertEqual((result["decision"], result["payable"]), ("HOLD", Decimal("0.00")))

    def test_review_events_are_not_unrelated_or_anomalies(self):
        case = acceptance_case()
        request(case, "2026-10-01T09:00:00")
        give_back(case, "2026-10-02T09:00:00")
        accept(case, "2026-10-04T09:00:00")
        result = case.run()
        self.assertEqual((result["unrelated"], result["issues"]), ([], []))


if __name__ == "__main__":
    unittest.main()
