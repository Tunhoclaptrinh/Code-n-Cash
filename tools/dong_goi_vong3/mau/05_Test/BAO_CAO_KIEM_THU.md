# Báo cáo kiểm thử

Sản phẩm CodeCash · Đội Code & Cash · Vòng 3.

Chạy ngày 15/11/2026 trên Windows 11, Python 3.14.3, Node.js 24.19.0, pnpm 12.14.0. CI (GitHub Actions) chạy cùng các bộ test này trên Linux mỗi lần push. Nhật ký nguyên văn nằm ở `nhat_ky_kiem_thu/`.

## 1. Tổng hợp

| Bộ kiểm thử | Lệnh (chạy trong `01_SourceCode`) | Số test | Kết quả | Nhật ký |
|---|---|---|---|---|
| Python: engine, đặc tả nghiệp vụ, golden output, công cụ kiểm chứng | `python -m unittest discover -s tests -v` | 211 | 211 đạt | `python.txt` |
| Node: API, workflow, quy tắc nghiệp vụ, nhật ký, ký số | `pnpm test:unit` | 199 (14 tệp) | 199 đạt | `node.txt` |
| Giao diện (Vitest) | `pnpm test:web` | 22 (7 tệp) | 22 đạt | `web.txt` |
| Kiểm kiểu TypeScript | `pnpm typecheck` | toàn bộ workspace | Đạt | `typecheck.txt` |
| Lint (0 cảnh báo) | `pnpm lint` | web, api, signer, packages | Đạt | `lint.txt` |
| **Tổng** | | **432 test** | **432 đạt, 0 lỗi** | |

Trên Windows cần đặt `PYTHONUTF8=1`, `LIBREOFFICE_BIN` trỏ tới `soffice.exe`, có `openssl` trong `PATH`, và chạy từ PowerShell (bản `pdftotext` của Git Bash thiếu tuỳ chọn cần cho test đọc PDF).

## 2. Kiểm thử Python (211)

| Tệp | Số test | Kiểm gì |
|---|---|---|
| `test_engine_stages.py` | 71 | Từng bước trong 9 bước của engine: cấu trúc, khử trùng lặp, thẩm quyền, tranh chấp, quorum theo vai trò, thời hạn, chọn luật, tính tiền, độ tin cậy |
| `test_dac_ta_nghiep_vu.py` | 42 | Các quy tắc nghiệp vụ BR-xx trong đặc tả, mỗi test mang mã T của bảng đặc tả |
| `test_policy_engine.py` | 22 | Policy pack: phiên bản, mã băm, công tắc diễn giải, kiểm cấu hình sai |
| `test_sample_contract.py` | 13 | Văn bản hợp đồng mô phỏng sinh từ điều khoản |
| `test_engine_dataset.py` | 10 | Đọc bộ dữ liệu khác (thư mục, ZIP), báo thiếu tệp, thiếu cột |
| `test_rule_language.py` | 10 | Ngôn ngữ biểu thức của bộ luật |
| `test_rule_safety.py` | 8 | Chứng minh an toàn bộ luật: không luật trả tiền nào thắng khi còn yếu tố chặn |
| `test_rule_execution_contract.py` | 7 | Hợp đồng thực thi luật giữa API và engine |
| `test_btc_clarifications.py` | 6 | Các điểm BTC đã trả lời và độ nhạy với điểm chưa chốt |
| `test_engine_adapter.py` | 5 | Đầu ra 22 cột, giữ 6 cột BTC điền sẵn, Decimal |
| `test_verify_audit.py` | 5 | Công cụ kiểm độc lập chuỗi nhật ký |
| `test_benchmark.py` | 4 | Bộ ca tổng hợp: phủ mọi mốc và mọi lớp, không chi khi thiếu điều kiện |
| `test_verify_decision.py` | 4 | Gói kiểm chứng: niêm phong, chạy lại, phát hiện quyết định bị sửa |
| `test_mutation.py` | 3 | Công cụ kiểm thử đột biến |
| `test_golden_output.py` | 1 | Toàn bộ 405 dòng đầu ra khớp bản golden đã duyệt |

## 3. Kiểm thử Node (199)

| Tệp | Số test | Kiểm gì |
|---|---|---|
| `business-rules.test.mjs` | 82 | Ma trận chặn của mọi hành động ghi: ai được làm, ở trạng thái nào, làm lặp hoặc sai thứ tự thì sao. Kỳ vọng lấy từ đề, đặc tả và câu trả lời BTC, không từ mã nguồn |
| `workflow.test.mjs` | 26 | Luồng nghiệp vụ đầu cuối qua API: nạp Data Pack, chỉ ghi được sự kiện của bên mình, phê duyệt rồi engine tính phạt, đóng tranh chấp có tham chiếu, ngoại lệ hai người, lệnh chi một lần, ký theo trình tự, phát hiện sửa nhật ký, khôi phục dữ liệu demo không xoá nhật ký |
| `trust.test.mjs` | 25 | Nhật ký chuỗi băm, neo Merkle, niêm phong quyết định, dấu thời gian RFC 3161, ma trận giả mạo |
| `engine-integration.test.mjs` | 18 | API gọi engine, kiểm 405 mốc, chặn ghi khi vi phạm bất biến |
| `resource.test.mjs` | 14 | CRUD tài nguyên và phạm vi tổ chức |
| `pdf-gemini.test.mjs` | 7 | PDF mẫu 1–4 người ký: toạ độ ô ký, chống chồng lấn; xử lý lỗi của Gemini. Chỉ gọi Gemini thật khi bật `RUN_GEMINI_LIVE` |
| `domain-types.test.mjs` | 6 | Kiểu dữ liệu dùng chung |
| `i18n.test.mjs` | 5 | Đủ chuỗi tiếng Việt và tiếng Anh |
| `listing.test.mjs` | 4 | Danh sách, lọc, phân trang |
| `demo-input.test.mjs` | 3 | Dữ liệu điền mẫu của form |
| `signer.test.mjs` | 3 | Dịch vụ ký từ xa mô phỏng: chỉ đúng người, đúng lượt mới ký được |
| `benchmark.test.mjs` | 3 | Bộ ca tổng hợp chạy qua API |
| `notifications.test.mjs` | 2 | Thông báo và hộp việc |
| `ui-tokens.test.mjs` | 1 | Thành phần dùng chung lấy màu từ token |

## 4. Đánh giá theo KPI của BTC

Tập đo, cách tính và giới hạn đầy đủ: `04_Document/NGHIEP_VU.md` mục 10. Tệp kết quả ở `03_Output/`.

| KPI | Tập đo | CodeCash | Baseline "luôn chi đủ" |
|---|---|---|---|
| Rule Execution Accuracy | 20 mẫu có nhãn | 20/20 | 8/20 |
| Scenario Accuracy (khớp 17 cột) | 20 mẫu có nhãn | 20/20 | — |
| Macro-F1 | 20 mẫu có nhãn | 1,00 | 0,14 |
| Unauthorized Payment Rate | 20 mẫu; bộ ca tổng hợp | 0/10; 0/4.044 | 10/10 |
| Payment / Penalty Amount | 20 mẫu có nhãn | 20/20, sai số 0,00 | — |
| Audit Trace | 405 mốc | 405/405 | — |
| Processing Time | 405 mốc | trung vị dưới 1 ms/mốc; cả 405 mốc dưới 1 giây (máy của đội, thay đổi theo tải máy; số đo của lần đóng gói nằm trong `metrics.json`, khối `processing`) | — |

Ma trận nhầm lẫn trên 20 mẫu: `03_Output/02_doi_chieu_20_mau/ma_tran_nham_lan.md`; trên bộ ca tổng hợp: `03_Output/03_bo_ca_tong_hop/metrics.json` (`confusion`).

## 5. Bộ kiểm thử có bắt được lỗi không

| Nguồn | Lỗi cài vào engine bị phát hiện (trên 16) |
|---|---|
| 20 mẫu công khai của BTC | 7 |
| Bộ ca tổng hợp, lần chạy đầu | 11 |
| Bộ ca tổng hợp, sau khi bổ sung 5 kịch bản | 16 |

16/16 đo trên chính bộ lỗi đã dùng để bổ sung kịch bản; con số khách quan là 11/16. Kết quả máy: `03_Output/04_kiem_thu_dot_bien/mutation_check.json`.

Bằng chứng khác:
- **An toàn bộ luật:** 16/16 phạm vi luật qua chứng minh tĩnh trên 9.216 tình huống (`metrics.json`, khối `ruleSafety`).
- **Giả mạo nhật ký:** sửa mục, xoá giữa, đảo thứ tự, cắt dưới mốc neo, viết lại cả chuỗi, cắt sau mốc neo cuối. Không neo phát hiện 3/6, có neo phát hiện 5/6 (`trust.test.mjs`).
- **Kịch bản kiểm chứng:** 13 thay đổi một dữ kiện, kết quả đúng kỳ vọng, không mốc nào khác bị ảnh hưởng (`06_Demo/kich_ban_kiem_chung/KET_QUA_KIEM_CHUNG.md`).

## 6. Giới hạn của kết quả kiểm thử

- 20 mẫu có nhãn là quá ít: khoảng tin cậy 95% của 20/20 là 83,9–100%, và engine được viết khi đã đọc 20 mẫu này.
- Bộ ca tổng hợp gồm 33 kịch bản, đáp án do đội viết theo cách hiểu đề của đội. Nếu đội hiểu sai một điều khoản, engine và đáp án sẽ sai giống nhau. Bộ ca đo độ phủ và lỗi cài đặt, không đo độ chính xác.
- Smoke test qua HTTP và trình duyệt (`pnpm test:e2e`, `pnpm test:browser`) cần web và API đang chạy, nên không nằm trong lần chạy này; CI chạy smoke qua nginx mỗi lần push.

## 7. Mã kiểm thử

`ma_kiem_thu/` là bản sao để đọc. Chạy từ `01_SourceCode`, vì test cần mã nguồn và Data Pack:

| Thư mục | Nội dung |
|---|---|
| `ma_kiem_thu/tests/` | Test Python (`test_*.py`), test Node (`foundation/*.test.mjs`), bản golden (`golden/`) |
| `ma_kiem_thu/tools/` | `kiem_chung_nghiep_vu.py` (bộ kiểm độc lập), `mutation_check.py`, `verify_decision.py`, `verify_audit.py`, `ra_soat_btc.py` |
| `ma_kiem_thu/benchmark.py` | Bộ sinh ca tổng hợp 33 kịch bản |
| `ma_kiem_thu/scripts/` | Smoke test HTTP (`smoke.mjs`) và trình duyệt (`browser-smoke.mjs`) |
