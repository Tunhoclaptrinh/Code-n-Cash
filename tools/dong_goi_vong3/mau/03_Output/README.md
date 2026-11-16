# 03_Output: Đầu ra hệ thống và kết quả thực nghiệm

Mọi tệp ở đây được sinh khi đóng gói, bằng cách chạy chính mã nguồn trong `01_SourceCode` trên Data Pack nguyên bản. Không có số nào nhập tay. Chạy lại từ `01_SourceCode` bằng các lệnh ghi ở từng mục. Đường dẫn máy đóng gói trong nhật ký được thay bằng `<goi_nop>` hoặc `<repo>`.

## 01_ket_qua_data_pack: bài nộp theo mẫu BTC

Lệnh: `python apps/engine/cli.py --output out` (profile `BTC_SUBMISSION`, policy `CASE4_BTC` 2.1.0).

| Tệp | Nội dung |
|---|---|
| `submission_output.csv` | Đúng 405 dòng × 22 cột theo `submission_output_template.csv`. Giữ nguyên 6 cột BTC điền sẵn; engine điền 16 cột còn lại |
| `audit.json` | Trace của từng dòng: dấu vân tay đầu vào, mã băm engine và policy, tham số mốc, các bên liên quan, giá trị mọi biến luật, kết cục từng luật (khớp, không khớp, không xét) |
| `metrics.json` | KPI, phân bố quyết định, tổng tiền, kết quả chứng minh an toàn bộ luật (16 phạm vi, 9.216 tình huống), thời gian xử lý |
| `nhat_ky_chay.txt` | Đầu ra màn hình của lệnh chạy |

Các cột engine điền:

| Cột | Ý nghĩa |
|---|---|
| `predicted_decision` | `RELEASE` chi đủ · `PENALTY` chi sau trừ phạt · `HOLD` tạm giữ · `REJECT` từ chối |
| `predicted_milestone_status` | Trạng thái mốc sau quyết định, trên Data Pack: `ELIGIBLE_FOR_PAYMENT` 348, `ON_HOLD` 16, `PAID_WITH_PENALTY` 15, `WAITING_APPROVAL` 10, `WAITING_EVIDENCE` 10, `REJECTED` 6 |
| `conditions_met`, `missing_conditions` | Điều kiện đạt và còn thiếu, theo token của `required_condition` |
| `payable_amount_vnd_mn`, `penalty_amount_vnd_mn` | Tiền được chi và tiền phạt (triệu VND, 2 chữ số thập phân; được chi + phạt = giá trị mốc với PENALTY) |
| `reason_code`, `decision_reason` | Mã lý do của luật thắng và câu giải thích tiếng Việt |
| `evidence_event_ids` | Chứng từ làm căn cứ (không gồm bản lặp, chứng từ sai thẩm quyền) |
| `rule_id_applied` | Luật thắng trong `payment_rules.csv` |
| `confidence_score` | Độ chắc chắn có giải thích, không phải xác suất đúng, không bao giờ đổi quyết định |
| `processing_time_ms`, `evaluated_at`, `engine_name`, `audit_trace_id` | Thời gian xử lý, thời điểm, phiên bản engine, khoá nối sang `audit.json` |
| `notes` | Mã hạ độ tin cậy (`confidence:A08`, `confidence:DUPLICATE`) và chế độ dữ liệu (`offline_full_history`) |

Kết quả: RELEASE 348 · HOLD 36 · PENALTY 15 · REJECT 6; chi 365.785,87 triệu; phạt 102,13 triệu. Độ tin cậy: 385 mốc 1,00; 15 mốc 0,80 (phụ thuộc điểm BTC chưa chốt về hoá đơn); 5 mốc 0,97 (có bản lặp chứng từ).

Khi chạy lại, chỉ `processing_time_ms`, `evaluated_at` và `audit_trace_id` khác; mọi cột quyết định và tiền trùng khớp.

## 02_doi_chieu_20_mau: đối chiếu với nhãn của BTC

| Tệp | Nội dung |
|---|---|
| `doi_chieu_20_mau.csv` | Từng mẫu: nhãn BTC và kết quả engine cho quyết định, mã lý do, tiền chi, tiền phạt; cột `khop_ca_4` |
| `ma_tran_nham_lan.md` | Ma trận nhầm lẫn 4 lớp |

Baseline so sánh: hệ "luôn chi đủ" trên cùng 20 mẫu đúng 8/20, Macro-F1 0,14, chi sai 10/10 mốc chưa đủ điều kiện (tính từ phân bố nhãn 8 RELEASE · 8 HOLD · 2 REJECT · 2 PENALTY).

## 03_bo_ca_tong_hop: bộ ca tổng hợp (scenario test)

Lệnh: `python apps/engine/benchmark.py --report <thư mục>`.

33 kịch bản áp lên từng mốc trong 405 mốc: bộ sinh viết lại lịch sử sự kiện từ chính tham số của mốc. Ca được chia theo hợp đồng thành nửa `dev` và nửa `test`.

| Tệp | Nội dung |
|---|---|
| `cases.csv` | 12.511 ca: kịch bản, mốc, nửa, đáp án (quyết định, lý do, tiền) và kết quả engine |
| `metrics.json` | Độ chính xác, Macro-F1, ma trận nhầm lẫn, chi sai, giữ thừa cho từng nửa |

Nửa `test`: 6.237/6.237 ca khớp cả 4 trường; chi sai 0/4.044.

Cách đọc đúng: hai nửa dùng chung 33 kịch bản, và đáp án do đội viết theo cách hiểu đề của đội. Bộ ca đo **độ phủ và lỗi cài đặt**, không đo độ chính xác so với đáp án ẩn. Vì các ca không độc lập, đội không tính khoảng tin cậy trên 6.237 ca.

## 04_kiem_thu_dot_bien: bộ kiểm thử có bắt được lỗi không

Lệnh: `python tools/mutation_check.py`. Cài lần lượt 16 lỗi thật vào engine (bỏ khử trùng lặp, bỏ kiểm thẩm quyền, bỏ qua tranh chấp, đếm phê duyệt theo người, tính trễ trước ân hạn, bỏ trần phạt, đảo thứ tự luật…), đếm nguồn nào phát hiện.

`mutation_check.json`:
- 20 mẫu BTC phát hiện 7/16 (`killedBySamples`);
- bộ ca tổng hợp hiện tại phát hiện 16/16 (`killedByBenchmark`);
- danh sách lỗi lọt qua 20 mẫu nằm ở `survivors.samples`.

Lần chạy đầu, bộ ca tổng hợp phát hiện 11/16; đội bổ sung 5 kịch bản cho các lỗi lọt. Vì vậy 16/16 đo trên chính bộ lỗi đã biết, còn con số khách quan là 11/16.

## 05_kiem_chung_nghiep_vu: kiểm mẫu, bất biến và độ nhạy

Lệnh: `python tools/kiem_chung_nghiep_vu.py --check --export <tệp>`. Đây là bộ kiểm độc lập với engine.

| Tệp | Nội dung |
|---|---|
| `ket_qua_tung_moc.csv` | Kết quả từng mốc của bộ kiểm |
| `nhat_ky_chay.txt` | Khớp 20 mẫu, 0 vi phạm bất biến, và độ nhạy với các cách hiểu khác |

Độ nhạy ghi: cắt theo snapshot, tính ngày hoàn thành gồm phê duyệt, làm tròn HALF_EVEN, bắt buộc hoá đơn theo cờ, chặn tuần tự theo thứ tự mốc.

## 06_ra_soat_btc: rà soát theo câu trả lời của BTC

Lệnh: `python tools/ra_soat_btc.py --output <tệp>`. `review.json` gồm:
- dấu vân tay dữ liệu;
- các phép kiểm và kết quả;
- độ phủ (13 loại mốc, 16 phạm vi luật; 5 loại và 5 phạm vi có mẫu công khai);
- độ nhạy;
- giới hạn kết luận.

## 07_goi_kiem_chung_mau: kiểm chứng độc lập một hợp đồng

`verification_CT0005.json` là gói kiểm chứng của hợp đồng CT0005, tải được trên web: trang chi tiết hợp đồng, thẻ "Hợp đồng thông minh", khung "Bộ máy thực thi", nút "Tải gói kiểm chứng". Gói gồm dữ liệu đầu vào, các quyết định và dấu niêm phong của từng quyết định. Kiểm bằng công cụ viết riêng, không dùng mã của API:

```bash
python tools/verify_decision.py ../03_Output/07_goi_kiem_chung_mau/verification_CT0005.json
```

Mỗi mốc phải báo `"seal": "MATCH"` (quyết định không bị sửa sau khi niêm phong) và `"rerun": "MATCH"` (chạy lại từ dữ liệu đầu vào ra đúng quyết định).
