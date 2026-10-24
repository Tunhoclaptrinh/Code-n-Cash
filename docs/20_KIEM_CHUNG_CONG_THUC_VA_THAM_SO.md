# Kiểm chứng công thức, biến và tham số — 25/10/2026

Đợt này siết kiểm tra thực thi sau commit `0a021f0`. Đặc tả/engine tăng MINOR lên **1.1**: không đổi quyết định, lý do, trạng thái hoặc số tiền của 405 mốc gốc.

## Đã kiểm chứng những gì

| Phạm vi | Cách kiểm độc lập | Kết quả |
| --- | --- | --- |
| 128 rule, 384 biểu thức | Kiểm AST, kiểu, đơn vị và quyền dùng biến theo bước | Bộ rule gốc hợp lệ |
| 17 biến × 405 mốc | Ghi nhận env engine thực dùng rồi đối chiếu kiểu và giá trị với milestone/fact; kiểm không thừa/thiếu biến | Khớp; tiền và số đều là Decimal, không phải float |
| 405 phép tính tiền | Tính lại từ P, ngày hoàn thành, due/grace, rate/cap trong milestone bằng công thức tham chiếu riêng | Khớp từng mốc |
| 16 phạm vi quy trình/loại mốc | Ca tổng hợp dùng required events và vai trò của từng phạm vi; approval đến sau required events | Đúng rule và tiền; approval không kéo ngày hoàn thành |
| 640 tổ hợp ngoài pack | P × rate × cap × grace × ngày trễ; có trễ đúng biên, trần phạt, tỷ lệ 0 và tiền rất nhỏ | Khớp công thức Decimal độc lập |
| Giao dịch có kết quả sai | Cố ý đưa công thức sai vào fixture rồi chạy domain action và dự kiến thanh toán | Bị từ chối; note, evaluation, history, run và audit thành công không bị ghi |

Các test ở [test_rule_execution_contract.py](../tests/test_rule_execution_contract.py), [test_rule_language.py](../tests/test_rule_language.py), [workflow.test.mjs](../tests/foundation/workflow.test.mjs) và [trust.test.mjs](../tests/foundation/trust.test.mjs). Không sửa CSV BTC hay dùng 20 sample để hard-code quyết định.

## Ba lỗi đã sửa và một lớp bảo vệ mới

1. **Kiểu số chưa đủ để bảo đảm đúng đơn vị.** Trước đây `planned_payment_vnd_mn + grace_period_days` vẫn hợp kiểu `number`. Validator nay phân biệt tiền, ngày, số lượng, phần trăm chưa quy đổi và tỷ lệ. Cộng/trừ, so sánh, MIN/MAX phải tương thích đơn vị; kết quả công thức tiền phải theo triệu VND.
2. **Ngày bị cắt phần lẻ.** `date + int(3 / 2)` từng âm thầm cộng 1 ngày. Nay biểu thức ngày cộng hằng số lẻ bị chặn tĩnh; nếu phần lẻ phụ thuộc dữ liệu thì runtime báo `RULE_NON_INTEGER_DAYS`, không tự làm tròn/cắt.
3. **Literal và phạt nhỏ.** AST Python lưu số thập phân thành float; runtime nay lấy token gốc để tạo Decimal trực tiếp (kể cả `1e-400`, không biến thành 0). Đồng thời kiểm tra cũ `PENALTY → F > 0` báo lỗi cho F thô nhỏ làm tròn về `0.00`. Nay cho F = 0 khi công thức chuẩn sau làm tròn cũng bằng 0; giữ quyết định first-match và không đổi sang RELEASE. Đây là suy ra từ công thức/làm tròn, có test tổng hợp; không phải nhãn BTC mới.
4. **Kết quả bất biến lỗi chưa bị chặn khi ghi.** Engine từng trả danh sách vi phạm nhưng `applyRun` vẫn có thể lưu. Nay `applyRun` và dry-run nghiệp vụ gọi `assertEngineOutcome`, từ chối `ENGINE_INVARIANT_VIOLATION` trước khi cập nhật. Repository transaction rollback cả dữ liệu nghiệp vụ; HTTP vẫn có thể lưu `REQUEST_FAILED` theo cơ chế audit hiện có. Trang kiểm tra rule vẫn được xem vi phạm để sửa cấu hình, nhưng không được gửi duyệt.

## Biến và trình tự tính được bảo đảm

- Tham số tiền, hạn, ân hạn, tỷ lệ/trần lấy từ **milestone**, không tự lấy giá trị hợp đồng thay thế. Catalog và env engine khớp đủ 17 tên.
- Điều kiện chưa có `penalty_amount_vnd_mn`. Tính công thức phạt → HALF_UP 2 chữ số → gán biến kết quả → tính tiền được trả. Biến tiền phạt chỉ được dùng ở công thức tiền trả.
- Ngày hoàn thành lấy required event hợp lệ cần thiết cuối cùng; không lấy APPROVAL/workflow event đến sau. Số phê duyệt là số vai trò bắt buộc được phủ, không phải số lượt bấm.
- Có tranh chấp/từ chối/sai quyền/thiếu chứng từ/thiếu quorum thì xét các rule chặn trước phạt và RELEASE. Kiểm dữ liệu bất thường của đặc tả vẫn giữ nguyên.
- Số tiền thực thi phải hữu hạn, không âm. Tiền phạt không vượt trần milestone đã làm tròn; payable đối soát với P và F. Không ghi kết quả lỗi thành quyết định thanh toán.

## Kiểm đơn vị hoạt động thế nào

| Biểu thức | Kết quả kiểm tra |
| --- | --- |
| `planned_payment_vnd_mn + grace_period_days` | UNIT_MISMATCH |
| `due_date + required_approval_quorum` | UNIT_MISMATCH |
| `due_date + 0.5` | INTEGER_DAYS_REQUIRED |
| `max_penalty_pct * planned_payment_vnd_mn` | PERCENT_CONVERSION_REQUIRED |
| `max_penalty_pct / 100 * planned_payment_vnd_mn` | Hợp đơn vị tiền |
| `0.01 * max_penalty_pct * planned_payment_vnd_mn` | Hợp đơn vị tiền |
| `days_late_after_grace * penalty_rate_pct_per_day / 100 * planned_payment_vnd_mn` | Ngày × %/ngày ÷ 100 × tiền → tiền |
| `MAX(0, planned_payment_vnd_mn - penalty_amount_vnd_mn)` | Hợp đơn vị tiền |
| `planned_payment_vnd_mn / (100 - 100)` | DIVISION_BY_ZERO khi kiểm tĩnh |
| `planned_payment_vnd_mn / (required_event_completion_rate - required_event_completion_rate)` | Hợp kiểu/đơn vị; runtime chặn chia 0, preview báo RULE_EVALUATION_FAILED |

Hằng số trong phép cộng/so sánh/MIN/MAX kế thừa đơn vị của vế có biến (như 0 trong MAX). Công thức chỉ có hằng số được hiểu theo triệu VND; công thức thuần hằng có kết quả âm bị chặn. Nhân/chia giữ và triệt tiêu đơn vị; tỷ lệ thuần là không thứ nguyên. Bộ kiểm nhận quy đổi phần trăm bằng `/ 100` hoặc `× 0.01`; không phải bộ đại số tự chứng minh mọi cách viết tương đương. Nên giữ biểu thức đơn giản và dùng biến tham số thay vì chèn số không rõ ý nghĩa.

## Giới hạn của xác nhận

Đã kiểm toàn pack và các ca ngoài pack nêu trên. Không có phép kiểm hữu hạn nào chứng minh mọi biểu thức tùy ý và mọi dữ liệu tương lai đều đúng nghiệp vụ. Đặc biệt: hằng số có thể hợp đơn vị nhưng sai ý định; mẫu số dùng biến có thể bằng 0; kết quả toán học vẫn có thể trái chính sách.

Vì vậy vẫn giữ luồng **kiểm tĩnh → chạy thử 405 mốc → so baseline/20 mẫu/bất biến → người thứ hai duyệt → kiểm runtime khi có dữ liệu mới**. Bản làm đổi baseline bị chặn; bản gây lỗi runtime không được lưu thành kết quả nghiệp vụ. Chưa xác minh được ground truth HIDDEN/HOLDOUT. Bổ sung vai trò/toán tử/biến/nghiệp vụ ngoài phạm vi này phải có review riêng và test mới.

Tái kiểm bằng `pnpm check`, `pnpm test:rules:browser` và HTTP smoke trên API `STORAGE_DRIVER=file`, DATA_DIR mới trong `/tmp`. Hướng dẫn quản trị Việt/Anh và ảnh chụp dùng ứng dụng thật; không sửa dữ liệu đang làm việc để dựng ví dụ.


## Kết quả xác minh cuối

- `pnpm check`: typecheck, lint, format, build và **122 test** (70 Python + 52 foundation/API) đạt.
- HTTP smoke: chặn sai đơn vị, thiếu quy đổi %, công thức tiền âm; lỗi mẫu số theo biến trả `RULE_EVALUATION_FAILED`. Lưu nháp/preview đúng quyền và các luồng cũ vẫn chạy.
- Browser rule: chặn nhập sai đơn vị/thiếu quy đổi %, vô hiệu kết quả cũ sau sửa, khôi phục, đối chiếu thay đổi tiền, tra biến và desktop/mobile đạt. Browser tổng thể **34 màn/kịch bản** đạt.
- [CSV spec 1.1](../artifacts/rules-units-review/submission_output.csv): 405 dòng × 22 cột; giữ nguyên decision/reason/status/payable/penalty so với bản trước. Khớp **20/20** mẫu, **0** bất biến lỗi; tiền trả **365785.87 triệu VND**, tiền phạt **102.13 triệu VND**. Metadata phiên bản/run thay đổi đúng theo spec 1.1.
- [Hồ sơ kiểm chứng](../artifacts/rules-units-review/verification.json), [metrics](../artifacts/rules-units-review/metrics.json), [gallery 6 ảnh theo vai trò](../playwright-report/rule-guide/roles/index.html), [kết quả capture](../playwright-report/rule-guide/capture-results.json). Có ảnh gốc và ảnh khoanh vùng; không lỗi bước hoặc thiếu mục.

Các lượt kiểm thử dùng `STORAGE_DRIVER=file` và DATA_DIR riêng trong `/tmp`. Không sửa kho đang làm việc hay CSV BTC để dựng ca kiểm thử. Bản xem thử cũ tại http://localhost:5330/platform/rule-versions được nạp lại API để dùng kiểm tra mới; tải lại trang trước khi thử. Các bổ sung sau commit `0a021f0` chưa được commit/push trong lượt này.
