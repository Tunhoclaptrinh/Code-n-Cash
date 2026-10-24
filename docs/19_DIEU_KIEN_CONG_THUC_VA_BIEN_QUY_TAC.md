# Điều kiện, công thức và từ điển biến quy tắc — 25/10/2026

## Hiện trạng và lý do thay đổi

Bản trước có đủ 128 rule nhưng trải 384 textarea trên bảng phân trang/ngang, thiếu tra cứu ý nghĩa/kiểu/đơn vị. Kiểm tra AST đã chặn thực thi mã tùy ý nhưng chưa chặn so sánh sai kiểu (`open_dispute == 1`) hay tự tham chiếu tiền phạt. Gửi duyệt chỉ so mẫu công khai và bất biến: một sửa đổi vẫn khớp 20 mẫu có thể làm lệch mốc khác. Request cấu hình đầy đủ khoảng 129 kB còn vượt giới hạn JSON mặc định 100 kB của Express.

Bản này chọn một trong 16 phạm vi quy trình/loại mốc, hiển thị 8 rule theo ưu tiên và chỉ sửa ba biểu thức của rule đang chọn. Có diễn giải tham chiếu, từ điển 17 biến, chèn tại con trỏ, khôi phục từng ô, báo lỗi từng trường và cuộn trong modal. Nhãn nút có chữ; không sửa `packages/ui`. Có cả Việt/Anh; mô tả nghiệp vụ gốc `rule_description_vi` vẫn là nội dung tham chiếu tiếng Việt từ pack.

## Cách engine áp dụng

| Ưu tiên | Điều kiện chuẩn | Quyết định |
| --- | --- | --- |
| 10 | Tranh chấp mở | HOLD |
| 20 | Có từ chối hợp lệ | REJECT |
| 30 | Required event sai thẩm quyền | HOLD |
| 40 | Chưa đủ required events | HOLD |
| 50 | Chưa đủ vai trò duyệt nếu yêu cầu | HOLD |
| 60 | Hoàn thành trễ và áp dụng phạt | PENALTY |
| 70 | Đủ điều kiện, không tranh chấp/từ chối | RELEASE |
| 80 | ELSE, không rule trước khớp | HOLD |

Đây là thứ tự first-match trong từng phạm vi, không phải cộng dồn quyết định. Engine vẫn có lớp phát hiện bất thường/cấu trúc và chặn chi theo đặc tả. Không bỏ qua lớp đó khi soạn rule. Phạm vi, ưu tiên, decision và reason code không được sửa qua API phiên bản; mô tả UI không tự suy diễn lại khi đổi biểu thức.

Sau khi chọn rule: tính `penalty_amount_formula` → Decimal ROUND_HALF_UP 2 chữ số → gán `penalty_amount_vnd_mn` → tính `payable_amount_formula`. Điều kiện và công thức phạt chưa được dùng biến tiền phạt kết quả. Các quyết định và phép tính tiền nằm ở API/Python, trình duyệt chỉ soạn và hiển thị.

## Từ điển 17 biến

Docker runtime cũng sao chép catalog cùng validator, tránh lỗi thiếu tệp khi deploy. Nguồn dùng chung cho UI và bộ kiểm tra: [rule_language.json](../apps/engine/rule_language.json). Dữ liệu gốc từ Data Pack; ví dụ trong từ điển chỉ giải thích đơn vị, không ghi vào hợp đồng.

| Biến | Kiểu · đơn vị | Ý nghĩa |
| --- | --- | --- |
| `open_dispute` | boolean · TRUE/FALSE | Có DISPUTE_OPENED chưa được DISPUTE_RESOLVED hợp lệ tham chiếu đóng. |
| `valid_rejection_event_count` | number · Số lượng | Số REJECTION hợp lệ từ bên có quyền từ chối. |
| `unauthorized_required_event_count` | number · Số lượng | Sự kiện thuộc loại bắt buộc nhưng actor sai bên hoặc không được phép. |
| `required_event_completion_rate` | number · Tỷ lệ 0–1 | Số loại required event hợp lệ / tổng loại bắt buộc. Từ 0 đến 1; 1.0 là 100%, không nhập 100. |
| `approval_required` | boolean · TRUE/FALSE | Mốc có yêu cầu phê duyệt trước khi thanh toán. |
| `valid_approval_count` | number · Số lượng | Đếm vai trò bắt buộc được phủ bởi phê duyệt hợp lệ; không đếm lượt bấm hay tổng event APPROVAL. |
| `required_approval_quorum` | number · Số lượng | Số vai trò phê duyệt phải được phủ theo cấu hình mốc. |
| `late_penalty_applicable` | boolean · TRUE/FALSE | Chỉ xét phạt khi cờ TRUE và không có rule ưu tiên trước chặn. |
| `actual_completion_date` | date · Ngày | Ngày muộn nhất của required event hợp lệ cần để hoàn thành mốc. Không lấy event cuối như APPROVAL. Chưa đủ required events thì chưa có ngày; so sánh trả FALSE. |
| `due_date` | date · Ngày | Hạn nghiệp vụ của mốc; cộng grace_period_days để lấy hết hạn ân hạn. |
| `grace_period_days` | number · Ngày lịch | Số ngày lịch cộng vào due_date. |
| `all_required_conditions_met` | boolean · TRUE/FALSE | Đủ required events, không có required event sai thẩm quyền, đủ quorum nếu cần. Vẫn phải kiểm tranh chấp và từ chối riêng. |
| `planned_payment_vnd_mn` | number · Triệu VND | Đơn vị triệu VND; 1000.00 là một nghìn triệu VND, không phải 1000 đồng. |
| `penalty_amount_vnd_mn` | number · Triệu VND | Kết quả công thức phạt đã làm tròn 2 chữ số. Chỉ dùng trong công thức tiền được trả; không tự tham chiếu trong điều kiện hoặc công thức phạt. |
| `days_late_after_grace` | number · Ngày lịch | MAX(0, ngày hoàn thành − (due_date + grace_period_days)); engine tính sẵn. Không tự trừ ngày trong DSL. |
| `penalty_rate_pct_per_day` | number · %/ngày | 0.10 nghĩa là 0,10%/ngày; chia 100 trong công thức. |
| `max_penalty_pct` | number · % | Phần trăm tối đa trên giá trị dự kiến của mốc; chia 100 trong công thức. |

`actual_completion_date` theo BTC là thời điểm required event hợp lệ cần thiết hoàn tất cuối cùng; APPROVAL hoặc DISPUTE_RESOLVED đến sau không mặc nhiên đổi ngày hoàn thành. `valid_approval_count` đếm vai trò bắt buộc được phủ, không đếm sự kiện duyệt trùng.

## Cú pháp và giới hạn kiểm tra

- Điều kiện trả boolean; công thức tiền trả number. Dùng `TRUE`, `FALSE`, `AND`, `== != < <= > >=`, `+ - * /`, ngoặc và `MIN/MAX` (1–8 đối số). AND có khoảng trắng hai bên; số thập phân dùng dấu chấm. ELSE đứng riêng ở priority 80.
- Không thực thi JavaScript/Python/Excel tự do; không `eval`, OR/NOT/IF, chuỗi, truy cập thuộc tính, import, hàm tùy ý, so sánh chuỗi `a < b < c` hay lũy thừa. Dùng `a < b AND b < c`.
- Chỉ cộng số ngày nguyên vào ngày để so sánh; dùng `days_late_after_grace` tính sẵn thay vì trừ hai ngày. Công thức tiền không nhận date/boolean. So sánh cùng kiểu; boolean chỉ ==/!=.
- 2.000 ký tự/trường, tối đa 512 AST nodes, số hữu hạn tối đa 16 ký tự. Chặn chia cho mẫu số hằng bằng 0, kể cả biểu thức hằng như (100 - 100); lỗi có rule, trường, mã lỗi, dòng/cột. Kiểm tất cả nhánh kể cả nhánh không chạy.
- Bổ sung kiểm đơn vị tiền/ngày/số lượng/phần trăm: `planned_payment_vnd_mn + grace_period_days` bị chặn UNIT_MISMATCH. Phần trăm phải quy đổi `/ 100` hoặc `× 0.01` để ra tiền. Hằng số kế thừa đơn vị của vế còn lại; công thức thuần hằng hiểu là triệu VND. Kiểm đơn vị chưa chứng minh mọi mẫu số luôn khác 0 hoặc công thức đúng nghiệp vụ trên dữ liệu chưa thấy; xem [20 — Kiểm chứng thực thi](20_KIEM_CHUNG_CONG_THUC_VA_THAM_SO.md).
- Mỗi request chẩn đoán tối đa 128 rule. Kiểm tra engine không áp giới hạn này vì lịch sử có thể chứa nhiều phiên bản, mỗi phiên bản thêm 128 rule. JSON API tối đa 4 MB để lưu/gửi cả cấu hình; giới hạn trường/kiểu vẫn kiểm riêng.

## Ví dụ tính toán

Nếu dự kiến 1000.00 triệu VND, chậm sau ân hạn 3 ngày, phạt 0.10%/ngày, trần 8%:

```text
Điều kiện: late_penalty_applicable == TRUE AND actual_completion_date > due_date + grace_period_days
Tiền phạt: MIN(days_late_after_grace * penalty_rate_pct_per_day / 100 * planned_payment_vnd_mn, max_penalty_pct / 100 * planned_payment_vnd_mn)
Tiền trả: MAX(0, planned_payment_vnd_mn - penalty_amount_vnd_mn)
```

Phạt = MIN(3.00, 80.00) = **3.00 triệu VND**; trả = **997.00 triệu VND**. Nếu có tranh chấp mở, rule 10 HOLD trước và ví dụ phạt không quyết định thanh toán. Đủ 100% chứng từ dùng tỷ lệ `1.0`; phạt `0.10` là 0,10%, không phải tỷ lệ 10%.

## Ba lớp kiểm tra trước phát hành

1. **Kiểm tra cú pháp:** POST `/trust/rules/validate`; nhận lỗi có cấu trúc, không lưu phiên bản/audit nghiệp vụ. GET `/trust/rules/language` trả từ điển cùng nguồn với validator. Cả hai yêu cầu `rules:read`.
2. **Chạy thử tác động:** POST `/trust/rules/:id/preview` với version/rules/templates hiện tại; engine đánh giá toàn pack và so baseline. Yêu cầu đủ 405 mốc, 20/20 mẫu, không vi phạm bất biến và **không đổi decision, reason, status, payable, penalty** của bất kỳ mốc nào. Tối đa 30 dòng khác biệt trả để rà soát; tổng khác biệt vẫn tính hết. Không có thay đổi thì đây là kiểm tra bảo toàn baseline, không phải chứng nhận ground truth ẩn. Việc sửa mẫu mốc chỉ dùng khi tạo hồ sơ mới; không thay dữ liệu mốc BTC trong preview.
3. **Gửi duyệt/phát hành:** UI bỏ kết quả cũ sau mỗi thay đổi, khóa gửi khi chưa có preview mới đủ điều kiện. API tự chạy lại khi gửi, không tin cờ từ UI. Chỉ tác giả sửa/gửi bản nháp; quản trị thứ hai mới được phát hành. Giữ hash, optimistic version, audit và pin phiên bản cho hợp đồng mới; hợp đồng cũ không đổi. Bản chờ duyệt từ trước chưa có kiểm tra baseline mới phải soạn lại, không tự cho phát hành.

Ví dụ hồi quy: thêm `AND planned_payment_vnd_mn != 258.00` vào PR0023 vẫn khớp **20/20 mẫu** nhưng làm đổi MS0001. Test xác nhận `canSubmit=false` và API từ chối submit. Mã ứng dụng không hard-code PR0023/MS0001; đây chỉ là fixture để chứng minh kiểm tra toàn pack có ích.

Rule động trong phạm vi cuộc thi vì vậy là tùy chỉnh **có kiểm soát và bảo toàn kết quả pack**. Thêm biến/toán tử mới hoặc thay bản chất quyết định phải cập nhật evaluator, catalog, validator, test và thống nhất nghiệp vụ; không chỉ gõ thêm một tên biến trên UI. Ưu tiên Đồng/Bạc không bị lớp mở rộng này thay thế.

## Đồng bộ ngôn ngữ của base

Lượt browser tổng thể phát hiện `apps/web` và `packages/ui` resolve hai bản i18next khác peer TypeScript của pnpm. Vì vậy app đã đổi tiếng Anh nhưng nút base có thể còn tiếng Việt. Vite dedupe các singleton React/i18next/Query để cùng context; không sửa mã `packages/ui`.

## Hướng dẫn và bằng chứng

[Hướng dẫn quản trị có ảnh](../apps/web/src/guide/vi/admin.md) và bản Anh đã cập nhật 5 trạng thái. [Gallery theo vai trò](../playwright-report/rule-guide/roles/index.html), [kết quả capture](../playwright-report/rule-guide/capture-results.json) có ảnh gốc và ảnh khoanh vùng. Chụp bằng script hiện có và skill annotated-ui-guides, không dùng ảnh mockup.

Kiểm thử trên driver file và thư mục mới trong /tmp; không ghi Mongo/dữ liệu đang làm việc. Các lệnh tái kiểm:

```bash
pnpm check
# Khởi động API thử với kho dữ liệu trống trước khi chạy HTTP/browser/capture:
STORAGE_DRIVER=file DATA_DIR=/tmp/codecash-rules-demo TRUST_DIR=/tmp/codecash-rules-demo-trust API_PORT=3260 pnpm start:api
VITE_API_PROXY=http://127.0.0.1:3260 pnpm --filter @codecash/web exec vite preview --host 127.0.0.1 --port 5330 --strictPort
WEB_URL=http://127.0.0.1:5330 node scripts/rule-editor-smoke.mjs
WEB_URL=http://127.0.0.1:5330 GUIDE_STEPS='rule language' GUIDE_OUT=/tmp/rules-images GUIDE_REPORT=/tmp/rules-report pnpm guide:screenshots
```

Dùng thư mục mới cho mỗi bộ smoke tổng thể có ghi dữ liệu. `GUIDE_STEPS` chỉ lọc bước capture; xuất ra /tmp khi chụp một phần để không thay manifest của bộ ảnh đầy đủ.

## Kết quả kiểm chứng tại commit 0a021f0 (trước khi siết đơn vị)

- `pnpm check`: typecheck, lint, format, build đạt; **112 test** (61 Python + 51 API/foundation) đạt.
- HTTP smoke: nhận đủ payload 128 rule, trả chẩn đoán 384 biểu thức, preview/lưu nháp hoạt động; supplier bị chặn cả từ điển, chẩn đoán và preview.
- Browser tổng thể: **34 màn/kịch bản** đạt ở chế độ Vite dev theo yêu cầu script; kiểm thêm luồng rule trên bản production preview, có sửa sai kiểu, khôi phục, vô hiệu kết quả cũ, tra biến, công thức hợp cú pháp nhưng đổi tiền bị chặn và bảng đối chiếu dễ đọc; desktop/mobile đạt.
- Capture: **5/5 trạng thái**, không lỗi bước hoặc thiếu khoanh vùng, có ảnh gốc; đã xem trực quan ảnh công thức, lỗi và từ điển.
- [CSV engine](../artifacts/rules-review/submission_output.csv): **405 dòng × 22 cột**, 348 RELEASE / 15 PENALTY / 36 HOLD / 6 REJECT; **20/20** mẫu, **0** bất biến lỗi. [Metrics](../artifacts/rules-review/metrics.json): tiền trả **365785.87 triệu VND**, tiền phạt **102.13 triệu VND**.
- Chưa xác minh ground truth HIDDEN/HOLDOUT; chưa build/chạy Docker image trong lượt này. Dockerfile đã bổ sung catalog vào runtime.

Xem thử ở http://localhost:5330/platform/rule-versions, đăng nhập demo **Quản trị hệ thống**. Đây là kho file thử riêng; bản nháp minh họa chưa gửi duyệt/phát hành. Đợt này không commit/push và không sửa tài liệu kế hoạch đang có thay đổi của người dùng.
