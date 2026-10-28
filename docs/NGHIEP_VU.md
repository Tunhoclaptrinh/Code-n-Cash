# CodeCash: Đặc tả nghiệp vụ

Bảng D, Case 4: Smart Contract Workflow. Tài liệu nghiệp vụ duy nhất của dự án; các tài liệu nghiệp vụ trước đây nằm trong [archive](archive/). Khi có mâu thuẫn, thứ tự căn cứ là: đề thi chính thức, câu trả lời của BTC (mục 12), Data Pack, tài liệu này.

Phiên bản đặc tả engine: 1.2. Snapshot dữ liệu: 18/10/2026.

## 1. Phạm vi và nguyên tắc

CodeCash là hệ thống quản lý thực hiện hợp đồng có điều kiện thanh toán: số hoá điều khoản, ký, nộp chứng từ theo mốc, phê duyệt, tranh chấp, quyết định thanh toán và lưu vết. Phần chạy trên Data Pack của BTC là bằng chứng (PoC) cho năng lực ra quyết định của engine; cùng engine đó chạy cho hợp đồng tạo mới trong ứng dụng.

| Cấp    | Nội dung đã làm                                                                                                                                                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bronze | Nhiều hợp đồng, 13 loại mốc; kiểm chứng từ, thẩm quyền, phê duyệt, tranh chấp, từ chối, thời hạn; 4 quyết định; tính tiền; lưu lịch sử; giao diện theo vai trò                                                                                                                                          |
| Silver | Workflow trực tiếp trên ứng dụng (nộp chứng từ, phê duyệt, tranh chấp, ngoại lệ hai người duyệt), phân quyền theo tổ chức, hạn mức phê duyệt, cảnh báo trình tự event, audit dạng chuỗi băm có niêm phong quyết định, phiên bản luật có duyệt; bằng chứng: bộ ca tổng hợp và kiểm thử đột biến (mục 10) |
| Gold   | Ký số theo trình tự gắn với nội dung tệp, đọc điều khoản từ PDF có dẫn trang (AI chỉ đề xuất, không quyết định), neo đầu chuỗi audit tự động kèm gốc Merkle và bộ kiểm độc lập, chứng minh an toàn bộ luật trước khi công bố, vết giải thích từng luật, tổng quan nhiều hợp đồng                        |

Nguyên tắc:

1. **An toàn thanh toán trước.** Chưa đủ căn cứ thì HOLD; không bao giờ tự RELEASE khi chưa chắc.
2. **Luật và chính sách đọc từ dữ liệu.** Quyết định lấy từ `payment_rules.csv` theo first-match; chính sách nghiệp vụ (bên nào được tạo loại event nào, trạng thái hợp lệ, cách đóng tranh chấp, cách đếm phê duyệt, trạng thái theo lý do, chốt an toàn) đọc từ policy pack có phiên bản (mục 6.2); không hard-code theo mã hợp đồng, mốc hay scenario.
3. **Trình duyệt không ra quyết định.** API xử lý nghiệp vụ, Python tính quyết định và tiền.
4. **Tiền dùng số thập phân chính xác,** không dùng số thực dấu phẩy động.
5. **Không ai sửa trực tiếp quyết định, số tiền hay audit.** Con người can thiệp bằng event mới của đúng bên hoặc quyết định ngoại lệ có hai người duyệt.

## 2. Vai trò và quyền

Hai lớp quyền tách biệt: **thẩm quyền nghiệp vụ** (bên nào được tạo loại event nào, lấy từ Data Pack, engine kiểm) và **quyền người dùng hệ thống** (ai được xem và thao tác gì, đội thiết kế, API kiểm theo tài khoản đăng nhập).

### 2.1. Thẩm quyền tạo event

| Loại event                                                                                       | Bên được tạo                                                                                                                                                                                                | Điều kiện                                                                                                                                                |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONTRACT_SIGNED`, `KICKOFF_CONFIRMED`, `REQUIREMENTS_APPROVED`, `UAT_PASSED`, `ACCEPTANCE`      | Bên mua của hợp đồng                                                                                                                                                                                        | Đúng `buyer_id`, đang `ACTIVE`, trạng thái `CONFIRMED`                                                                                                   |
| `DELIVERY`, `INVOICE`, `GO_LIVE`, `SERVICE_ACTIVATED`, `SERVICE_COMPLETED`, `WARRANTY_COMPLETED` | Nhà cung cấp của hợp đồng                                                                                                                                                                                   | Đúng `supplier_id`, đang `ACTIVE`, trạng thái `CONFIRMED`                                                                                                |
| `APPROVAL`                                                                                       | Người phê duyệt của bên mua                                                                                                                                                                                 | `parent_party_id` là bên mua, `can_approve_payment = TRUE`, vai trò thuộc `required_approval_roles`, trạng thái `APPROVED`                               |
| `REJECTION`                                                                                      | Người phê duyệt của bên mua                                                                                                                                                                                 | Có `REJECTION` trong `allowed_event_types`, trạng thái `REJECTED`; không giới hạn theo vai trò bắt buộc                                                  |
| `DISPUTE_OPENED`                                                                                 | Engine: mọi bản ghi của mốc. Ứng dụng: bên mua hoặc nhà cung cấp (`disputes:open`)                                                                                                                          | Engine không xét người mở hay `can_raise_dispute` (mở dễ): mở tranh chấp chỉ dẫn tới HOLD nên đây là phía an toàn. Ai được mở trong ứng dụng do API kiểm |
| `DISPUTE_RESOLVED`                                                                               | Bài nộp BTC: không kiểm người đóng (cách hiểu A06, mục 12). Workflow: bên mua hoặc người phê duyệt của bên mua có quyền `DISPUTE`; trong ứng dụng là chủ hợp đồng hoặc cán bộ hợp đồng (`disputes:resolve`) | Trạng thái `RESOLVED`, tham chiếu đúng `DISPUTE_OPENED` cùng mốc, cùng hợp đồng, không trước lúc mở (đóng khó)                                           |

Loại bên và vai trò luôn tra trong `parties.csv`, không tin cột `actor_party_type` ghi trên event. Cột `allowed_event_types` không dùng nguyên văn cho required event: cách đó làm sai 5 trong 20 mẫu công khai (mục 10).

Bảng này là nội dung của policy pack (`apps/engine/policy/case4_btc.json`, mục 6.2): mỗi loại event thuộc một nhóm (`EVIDENCE`, `APPROVAL`, `REJECTION`, `DISPUTE_OPEN`, `DISPUTE_RESOLVE`), chứng từ ghi rõ bên tạo (`BUYER`, `SUPPLIER`) và trạng thái hợp lệ; điều kiện thẩm quyền của từng nhóm là một biểu thức đọc `parties.csv` và `contracts.csv`. API đọc cùng tệp này để người dùng chỉ ghi được event của bên mình.

### 2.2. Vai trò người dùng hệ thống

| Vai trò                                    | Thuộc                                  | Được làm                                                                                                                                                                  | Không được làm                                                                                 |
| ------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Chủ hợp đồng (`CONTRACT_OWNER`)            | Bên mua                                | Tải hợp đồng, ký, xác nhận chứng từ phía bên mua, phê duyệt theo vai trò, mở và giải quyết tranh chấp, đề xuất vô hiệu event sai thẩm quyền trên hợp đồng của mình        | Thao tác trên hợp đồng của tổ chức khác, tự duyệt đề xuất của mình                             |
| Phê duyệt tài chính, phê duyệt thứ hai     | Bên mua                                | Phê duyệt hoặc từ chối mốc đúng vai trò                                                                                                                                   | Duyệt thay vai trò khác                                                                        |
| Cán bộ hợp đồng bên mua (`LEGAL_REVIEWER`) | Bên mua                                | Soạn và rà điều khoản, thiết lập vị trí ký, mở và giải quyết tranh chấp                                                                                                   | Phê duyệt chi                                                                                  |
| Nhà cung cấp (`SUPPLIER`)                  | Nhà cung cấp                           | Ký, nộp chứng từ phía nhà cung cấp, mở tranh chấp                                                                                                                         | Giải quyết tranh chấp, phê duyệt                                                               |
| Kiểm soát viên nội bộ (`ADMIN_AUDITOR`)    | Mỗi bên mua và mỗi nhà cung cấp có một | Xem hợp đồng của tổ chức mình; kiểm soát viên bên mua duyệt hoặc trả lại đề xuất vô hiệu của chủ hợp đồng; kiểm soát viên nhà cung cấp theo dõi bên mua chi đúng hợp đồng | Đề xuất ngoại lệ, tạo event nghiệp vụ, sửa luật, sửa quyết định, xem hợp đồng của tổ chức khác |
| Quản trị hệ thống (`SYSTEM_ADMIN`)         | Vận hành nền tảng                      | Quản lý tài khoản, cấu hình, công bố phiên bản luật đã kiểm, neo chuỗi audit, khôi phục dữ liệu demo                                                                      | Xem nội dung hợp đồng, xử lý ngoại lệ, phê duyệt chi                                           |
| Chuyên viên kiểm tra toàn vẹn (`AUDITOR`)  | Vận hành nền tảng                      | Kiểm chuỗi audit, neo và bằng chứng Merkle; chỉ thấy bản tóm tắt mục audit (không có nội dung)                                                                            | Xem nội dung hợp đồng, mọi thao tác ghi                                                        |

Data Pack chỉ có các bên của hợp đồng: bên mua, nhà cung cấp và ba vai trò phê duyệt. Để quy trình chạy khép kín và tách nhiệm, đội bổ sung bốn vai trò; mỗi vai trò lấp một khoảng trống cụ thể:

| Vai trò bổ sung               | Khoảng trống cần lấp                                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cán bộ hợp đồng bên mua       | Điều khoản số hoá sai thì mọi quyết định sau đó đều sai; cần người rà điều khoản trước khi khoá và đưa đi ký, tách khỏi người duyệt chi                                                                                                     |
| Kiểm soát viên nội bộ         | Mốc bị kẹt vì chứng từ do bên không có thẩm quyền tạo cần người xử lý có kiểm soát: chủ hợp đồng đề xuất, kiểm soát viên của chính bên mua duyệt, không ai sửa trực tiếp kết quả; nhà cung cấp có kiểm soát viên riêng để theo dõi việc chi |
| Quản trị hệ thống             | Tài khoản, mẫu hợp đồng và phiên bản luật cần người quản lý tách khỏi nghiệp vụ, để người cấu hình không đồng thời xử lý ngoại lệ hay duyệt chi                                                                                             |
| Chuyên viên kiểm tra toàn vẹn | Cần một bên độc lập kiểm tra nhật ký không bị sửa mà không đọc nội dung hợp đồng và không thể thay đổi gì                                                                                                                                   |

Toàn bộ quyền nằm trong một ma trận duy nhất (`packages/contracts/permissions.json`), được kiểm ở API theo tài khoản đăng nhập và hiển thị cho quản trị tại màn Ma trận phân quyền.

Tách nhiệm: SoD-1 người cấu hình không xử lý ngoại lệ; SoD-2 ngoại lệ do chủ hợp đồng đề xuất và kiểm soát viên của cùng bên mua duyệt, người đề xuất không tự duyệt; SoD-3 không vai trò nào sửa trực tiếp quyết định, tiền, trạng thái, audit; SoD-4 công bố chỉ đưa một phiên bản luật đã kiểm vào danh sách dùng cho hợp đồng mới, phiên bản đó chỉ ràng buộc một hợp đồng khi cả hai bên ký văn bản ghim nó.

Danh tính, tổ chức và vai trò luôn suy ra từ phiên đăng nhập; API không nhận vai trò, mã người dùng hay tổ chức do trình duyệt gửi lên.

## 3. Dữ liệu

| Bảng                  | Số dòng | Vai trò                                                                 |
| --------------------- | ------- | ----------------------------------------------------------------------- |
| `contracts.csv`       | 100     | Hợp đồng, bên mua, nhà cung cấp, chính sách phê duyệt                   |
| `parties.csv`         | 65      | 10 bên mua, 25 nhà cung cấp, 30 người phê duyệt (mỗi bên mua 3 vai trò) |
| `milestones.csv`      | 405     | Điều kiện, hạn, ân hạn, phạt, giá trị từng mốc                          |
| `events.csv`          | 1.134   | Bằng chứng nghiệp vụ, phê duyệt, từ chối, tranh chấp                    |
| `payment_rules.csv`   | 128     | 16 phạm vi luật, mỗi phạm vi 8 luật ưu tiên 10..80                      |
| `decision_sample.csv` | 20      | Nhãn công khai duy nhất; dùng để kiểm chứng, không làm bảng tra         |

Quan hệ: hợp đồng có 3 đến 5 mốc; event gắn với mốc qua `milestone_id`; mốc lấy bộ luật qua `release_rule_code`; `DISPUTE_RESOLVED` trỏ về `DISPUTE_OPENED` qua `reference_event_id`.

Dữ liệu đội bổ sung luôn có nhãn nguồn: `DATA_PACK` (nguyên bản BTC), `SEED` (tài khoản người dùng, hợp đồng mẫu, thông tin ký mà Data Pack không có), `APP` (phát sinh khi dùng ứng dụng). Dữ liệu bổ sung không đổi kết quả của 405 mốc gốc.

Quy ước: tiền tính bằng triệu VND; phần trăm chia 100 khi tính; thời điểm không có múi giờ; danh sách trong ô phân cách bằng `;`.

## 4. Vòng đời

**Hợp đồng:** Bản nháp (`DRAFT`), Đang ký (`AWAITING_SIGNATURE`), sau khi ký xong thì tổng hợp từ các mốc, xét theo thứ tự: mọi mốc đã chuyển chi hoặc bị từ chối thì Đã đóng (`CLOSED`); còn mốc bị từ chối thì Cần xem xét (`NEEDS_REVIEW`); còn mốc chờ chứng từ, chờ phê duyệt hoặc tạm giữ thì Chờ điều kiện (`PENDING_CONDITIONS`); còn lại là Mọi mốc đủ điều kiện (`ALL_MILESTONES_ELIGIBLE`). Trạng thái hợp đồng chỉ phục vụ theo dõi, không đổi quyết định của mốc.

**Mốc:** mỗi mốc được đánh giá độc lập (bộ luật không có điều kiện phụ thuộc mốc trước) và đánh giá lại sau mỗi event mới.

| Quyết định                                             | Trạng thái mốc         |
| ------------------------------------------------------ | ---------------------- |
| RELEASE                                                | `ELIGIBLE_FOR_PAYMENT` |
| PENALTY                                                | `PAID_WITH_PENALTY`    |
| HOLD do thiếu chứng từ                                 | `WAITING_EVIDENCE`     |
| HOLD do thiếu phê duyệt                                | `WAITING_APPROVAL`     |
| HOLD do tranh chấp, sai thẩm quyền hoặc không xác định | `ON_HOLD`              |
| REJECT                                                 | `REJECTED`             |

Hai trạng thái không do engine sinh: `COMPLETED` khi kế toán ghi nhận đã chuyển chi một mốc RELEASE hoặc PENALTY (thao tác của ứng dụng, có lịch sử và audit); `PLANNED`, `IN_PROGRESS` chỉ xuất hiện ở chế độ as-of khi mốc chưa có event hoặc chưa tới hạn. Mốc `REJECTED` và `COMPLETED` bị khoá: các lượt chạy sau không ghi đè kết quả đã lưu.

## 5. Engine: chín bước xử lý một mốc

Engine là package `apps/engine/codecash_engine`, mỗi bước một module có đầu vào, đầu ra và test riêng (`tests/test_engine_stages.py`). Mọi bước đọc chính sách đã biên dịch (`policy.py`, mục 6.2); engine chỉ giữ cơ chế: năm nhóm event, chọn luật first-match và tiền `Decimal`.

| #   | Module                             | Việc                                                                                                                                | Quy tắc                |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1   | `structure`                        | Nạp mốc, hợp đồng, bộ luật; phát hiện lỗi cấu trúc (thiếu loại chứng từ, quorum không đọc được, bộ luật thiếu, event lệch hợp đồng) | BR-15                  |
| 2   | `events`                           | Cắt theo thời điểm (chế độ as-of); khử trùng lặp; áp quyết định ngoại lệ đã duyệt; đánh dấu bất thường                              | BR-03, BR-16, BR-19    |
| 3   | `requirements`                     | Phân loại required event: hợp lệ, sai thẩm quyền, sai trạng thái, không liên quan; tính loại còn thiếu và tỷ lệ hoàn thành          | BR-04 đến BR-07, BR-20 |
| 4   | `controls`                         | Tranh chấp đang mở, từ chối hợp lệ, số vai trò đã phê duyệt                                                                         | BR-08 đến BR-10        |
| 5   | `schedule`, `bindings`, `sequence` | Ngày hoàn thành thực tế, số ngày trễ sau ân hạn; đọc tham số mốc và hợp đồng theo khai báo của từng biến; cảnh báo trình tự event   | BR-11, BR-12           |
| 6   | `rules`                            | Dựng biến luật, chọn luật đầu tiên khớp theo ưu tiên, nhánh ELSE, chốt an toàn thanh toán                                           | BR-02, BR-14           |
| 7   | `amounts`                          | Tiền phạt, số được thanh toán theo công thức của luật thắng, chốt an toàn số tiền                                                   | BR-12, BR-13           |
| 8   | `confidence`                       | Điểm tin cậy và các yếu tố hạ điểm                                                                                                  | Mục 8                  |
| 9   | `trace`                            | Bằng chứng, token điều kiện đạt và thiếu, trạng thái mốc                                                                            | BR-17                  |

Chi tiết các bước:

- **Khử trùng lặp (BR-03).** Hai event là một khi trùng hợp đồng, mốc, loại, chứng từ, người tạo, trạng thái và tham chiếu. Giữ bản sớm nhất. Bản lặp không được tính hai lần và không thay được chứng từ còn thiếu.
- **Required event hợp lệ (BR-04 đến BR-07).** Đúng loại, đúng bên của hợp đồng theo bảng 2.1, đúng trạng thái. Event sai thẩm quyền không là bằng chứng và được đếm vào `unauthorized_required_event_count`.
- **Tranh chấp (BR-08).** Mọi `DISPUTE_OPENED` đều mở tranh chấp; chỉ `DISPUTE_RESOLVED` hợp lệ tham chiếu đúng mới đóng. Phạm vi là mốc.
- **Phê duyệt (BR-10).** Đếm số **vai trò** bắt buộc đã có phê duyệt hợp lệ; một người duyệt nhiều lần chỉ tính một lần. Người duyệt có `approval_limit_vnd_mn` nhỏ hơn giá trị mốc thì phê duyệt không được tính (Data Pack không có trường hợp này, hợp đồng tạo trong ứng dụng có thể có).
- **Cảnh báo trình tự.** Phê duyệt trước chứng từ cuối cùng, chứng từ trước ngày ký hợp đồng, chứng từ cùng loại cùng người gửi lại với mã khác trong 24 giờ (nghi trùng), tranh chấp do chính nhà cung cấp đóng, phê duyệt vượt hạn mức. Cảnh báo không đổi quyết định, chỉ hạ confidence và hiện trong trace để người duyệt xem trước khi chi. Trên Data Pack không có cảnh báo nào.
- **Ngày hoàn thành (BR-11).** Thời điểm muộn nhất trong các required event hợp lệ (bản sớm nhất của mỗi loại). APPROVAL, DISPUTE_RESOLVED và event quản trị không đẩy ngày hoàn thành. Chưa đủ chứng từ thì chưa có ngày hoàn thành.
- **Số ngày trễ.** `days_late_after_grace = max(0, ngày hoàn thành − (due_date + grace_period_days))`, tính theo ngày lịch.
- **Cổng chất lượng (BR-15).** Lỗi cấu trúc đưa mốc về luật ELSE. Bất thường (người tạo không tồn tại, loại event lạ, từ chối không hợp lệ) chỉ hạ lệnh trả tiền xuống ELSE, không đổi các quyết định chặn.
- **Lỗi khi tính luật.** Luật không tính được cho một mốc (ví dụ công thức chia cho tham số bằng 0) giữ riêng mốc đó qua ELSE với issue `RULE_EVALUATION_ERROR` kèm mã luật, không làm hỏng cả lượt chạy; màn xem trước phiên bản luật vẫn từ chối bộ luật như vậy (`RULE_EVALUATION_FAILED`).
- **Chốt an toàn thanh toán.** Khi luật thắng là RELEASE hoặc PENALTY, engine kiểm thêm các điều kiện của policy pack: không có tranh chấp mở (trừ khi mốc ghi `hold_on_open_dispute = FALSE`), không có từ chối hợp lệ, đủ mọi điều kiện. Không đạt thì mốc về ELSE kèm lý do, dù bảng luật nói gì. Với bộ luật của BTC chốt này không bao giờ phải can thiệp; nó chặn bộ luật sai thứ tự hoặc sai điều kiện.
- **Chốt an toàn số tiền.** Số tiền không âm, thanh toán không vượt giá trị mốc, và khớp hợp đồng số tiền của từng quyết định (RELEASE trả đủ P; HOLD, REJECT trả 0; PENALTY trả `MAX(0, P − F)` với F trong trần, kể cả khi trần cho phép F lớn hơn P). Không đạt thì mốc về ELSE và không chi.
- Hai chốt an toàn trên chỉ phải can thiệp khi bộ luật có lỗi, nên còn được báo là vi phạm bất biến (mục 9): lượt chạy nộp bài dừng lại, thao tác trên ứng dụng bị huỷ toàn bộ, còn màn xem trước phiên bản luật và chế độ chẩn đoán liệt kê từng mốc bị ảnh hưởng. Trong mọi trường hợp mốc không được chi.

## 6. Luật quyết định

Tám luật giống nhau ở cả 16 phạm vi, chạy first-match theo `priority` tăng dần, dừng ở luật đầu tiên khớp.

| Ưu tiên | Điều kiện                                         | Quyết định | Mã lý do                  | Thanh toán      | Phạt |
| ------- | ------------------------------------------------- | ---------- | ------------------------- | --------------- | ---- |
| 10      | Có tranh chấp đang mở                             | HOLD       | `OPEN_DISPUTE`            | 0               | 0    |
| 20      | Có từ chối hợp lệ                                 | REJECT     | `REJECTION_PRESENT`       | 0               | 0    |
| 30      | Có required event sai thẩm quyền                  | HOLD       | `UNAUTHORIZED_EVENT`      | 0               | 0    |
| 40      | Chưa đủ required event                            | HOLD       | `MISSING_REQUIRED_EVENT`  | 0               | 0    |
| 50      | Cần phê duyệt và chưa đủ vai trò                  | HOLD       | `APPROVAL_QUORUM_NOT_MET` | 0               | 0    |
| 60      | Áp phạt và hoàn thành sau hạn cộng ân hạn         | PENALTY    | `LATE_COMPLETION`         | `MAX(0, P − F)` | F    |
| 70      | Đủ mọi điều kiện, không tranh chấp, không từ chối | RELEASE    | `ALL_CONDITIONS_MET`      | P               | 0    |
| 80      | `ELSE`                                            | HOLD       | `UNRESOLVED_CONDITION`    | 0               | 0    |

ELSE là nhánh mặc định cuối cùng, không phải một event hay scenario: mọi trường hợp không khớp luật 10 đến 70 hoặc không đánh giá được đều HOLD để người kiểm tra (BTC xác nhận). Các yếu tố chặn (10 đến 50) luôn xét trước phạt (60).

Engine không giả định đúng 8 luật hay ưu tiên 10..80. Một phạm vi luật hợp lệ khi: có ít nhất một luật, ưu tiên không trùng, đúng một nhánh ELSE và nằm cuối, mọi quyết định và mã lý do có trong policy pack, và có đủ 8 mã lý do chuẩn của README (mục 4.4). Thêm một luật ở ưu tiên 65 chẳng hạn không cần sửa code; phạm vi không hợp lệ thì các mốc của nó về ELSE kèm lý do.

### 6.1. Tính động của engine

Engine không gắn cứng với một hợp đồng, một bộ luật hay một chính sách. Năm cơ chế giữ cho quyết định luôn theo dữ liệu mới nhất:

1. **Đánh giá lại sau mỗi thao tác.** Mỗi thao tác ghi (nộp chứng từ, phê duyệt, từ chối, mở hoặc đóng tranh chấp, duyệt ngoại lệ) chạy lại engine Python trên toàn bộ dữ liệu trong cùng giao dịch; chỉ kết quả nào thay đổi mới được ghi, trạng thái mốc và hợp đồng cập nhật ngay, lịch sử trạng thái ghi lại lượt chạy gây ra thay đổi.
2. **Chạy thử trước khi hành động.** Màn phê duyệt, nộp chứng từ và tranh chấp gọi engine ở chế độ chạy thử với event giả định, nên người dùng thấy quyết định và số tiền sẽ ra sao trước khi xác nhận. Kết quả chạy thử không được lưu.
3. **Xem lại tại một thời điểm.** Chế độ as-of cắt event theo thời điểm chọn và chạy lại, cho thấy mốc sẽ được quyết định thế nào nếu chỉ có các event tới thời điểm đó. Danh sách bên, luật của hợp đồng và quyết định ngoại lệ vẫn lấy theo hiện tại, nên đây là phát lại theo event, không phải ảnh chụp toàn bộ hệ thống tại thời điểm đó.
4. **Luật là dữ liệu có phiên bản.** Luật viết bằng ngôn ngữ điều kiện `BTC_DSL_V1` (`apps/engine/rule_language.json`), không cần sửa code khi đổi luật. Vòng đời một phiên bản:

| Bước               | Kiểm soát                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bản nháp           | Kiểm cú pháp và tên biến theo từ vựng của engine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Xem trước tác động | Chạy phiên bản mới trên cả 405 mốc, so với phiên bản đang hiệu lực, liệt kê từng mốc đổi quyết định hoặc số tiền; không ghi gì                                                                                                                                                                                                                                                                                                                                                                                                          |
| Gửi duyệt          | Bị chặn (`RULE_VERSION_REGRESSION`) nếu đổi **bất kỳ** quyết định, mã lý do, trạng thái hay số tiền nào trên 405 mốc của Data Pack so với luật gốc của BTC, kể cả khi 20 mẫu công khai vẫn đúng                                                                                                                                                                                                                                                                                                                                         |
| Kiểm tra an toàn   | Chứng minh tĩnh trên mọi phạm vi luật (`codecash_engine/safety.py`): duyệt lưới fact phủ mọi ranh giới, thêm giá trị biên quanh mọi hằng số mà điều kiện so sánh; không luật trả tiền nào thắng khi còn yếu tố chặn, số tiền nằm trong [0, P], HOLD và REJECT không trả, phạm vi kết thúc bằng ELSE. Không đạt thì không gửi duyệt và không công bố được (`RULE_VERSION_UNSAFE`). Bước này bắt được luật chỉ sai với tham số mà Data Pack không có (ví dụ chỉ sai khi giá trị mốc trên 6.000 triệu), điều mà phép so 405 mốc không thấy |
| Công bố            | Quản trị hệ thống công bố phiên bản đã qua kiểm tra; nội dung được khoá bằng băm, phiên bản cũ chuyển sang ngừng hiệu lực; phiên bản chỉ ràng buộc hợp đồng khi cả hai bên ký văn bản ghim nó (SoD-4)                                                                                                                                                                                                                                                                                                                                   |

Luật của BTC là căn cứ cho 405 mốc, nên một phiên bản mới không được đổi kết quả của chúng. Phiên bản mới dùng để viết lại tương đương, thêm phạm vi luật và mẫu mốc cho hợp đồng tạo trong ứng dụng. Hợp đồng ghim phiên bản luật tại thời điểm tạo, nên công bố phiên bản mới không âm thầm đổi quyết định của hợp đồng đang chạy.

5. **Chính sách là dữ liệu** (mục 6.2): thêm loại event, đổi điều kiện thẩm quyền, đổi cách đóng tranh chấp, thêm biến luật từ một cột của mốc hay hợp đồng đều là sửa dữ liệu, không sửa code.

### 6.2. Policy pack

`apps/engine/policy/case4_btc.json` (định dạng `CODECASH_POLICY_V1`, `CASE4_BTC` phiên bản 2.0.0) chứa toàn bộ chính sách nghiệp vụ mà trước đây nằm trong code. Engine kiểm và biên dịch tệp khi nạp; tệp sai (nhóm event lạ, bên không có, biểu thức đọc cột không tồn tại, trạng thái không có trong danh mục, định nghĩa vòng tròn) bị từ chối với danh sách lỗi, không chạy một phần.

| Phần                                                         | Nội dung                                                                                                                           | Quy tắc               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `sides`, `event_types`, `categories`                         | Loại event, nhóm, bên tạo, trạng thái hợp lệ, điều kiện thẩm quyền theo nhóm                                                       | Mục 2.1, BR-04, BR-05 |
| `dedupe`                                                     | Các trường định danh một bản lặp; chỉ xét khi có `document_id`                                                                     | BR-03                 |
| `requirements`                                               | Điều kiện để một required event được tính; required event bổ sung theo cờ của mốc (chỉ dùng khi đo độ nhạy A08)                    | BR-04 đến BR-07       |
| `approvals`                                                  | Phê duyệt nào được tính, một lần mỗi người duyệt, đếm theo vai trò                                                                 | BR-10                 |
| `disputes`                                                   | Phạm vi (mốc hoặc hợp đồng) và điều kiện để `DISPUTE_RESOLVED` đóng tranh chấp                                                     | BR-08                 |
| `completion`                                                 | Nhóm event tính vào ngày hoàn thành                                                                                                | BR-11                 |
| `anomalies`, `exceptions`                                    | Bất thường hạ lệnh trả tiền; event nào quyết định ngoại lệ được vô hiệu                                                            | BR-15, BR-19          |
| `derived_facts`                                              | `all_required_conditions_met` viết bằng biểu thức trên các biến luật                                                               | Mục 6                 |
| `decisions`, `reasons`, `statuses`, `fallback`, `rule_scope` | Quyết định nào trả tiền và hợp đồng số tiền của nó, trạng thái theo lý do, nhánh mặc định, điều kiện của một phạm vi luật          | Mục 4, 6, 9           |
| `guards`                                                     | Chốt an toàn thanh toán và số tiền                                                                                                 | Mục 5                 |
| `condition_tokens`                                           | Cách đánh giá token `EVENT:X`, `APPROVAL_QUORUM:n`, `NO_OPEN_DISPUTE`                                                              | Mục 9                 |
| `switches`, `profiles`, `readings`, `confidence`             | Các cách hiểu đề đo độ nhạy, hồ sơ chạy (`BTC_SUBMISSION`, `WORKFLOW` thêm điều kiện bên mua đóng tranh chấp), trọng số confidence | Mục 8, 12             |

Biểu thức trong policy pack dùng hai phương ngữ của cùng bộ biên dịch (`expressions.py`), cả hai phân tích cú pháp theo danh sách trắng và không chạy mã tuỳ ý:

- **Biểu thức trên bản ghi** đọc `event.*`, `actor.*` (bên tạo, tra trong `parties.csv`), `contract.*`, `milestone.*`, `referenced.*` (event được tham chiếu), có chuỗi, `IN` trên danh sách phân cách `;`, `AND`, `OR`, `NOT`. So sánh với giá trị thiếu luôn sai; tên cột được kiểm theo tiêu đề tệp của Data Pack.
- **Biểu thức trên biến luật** là `BTC_DSL_V1` thêm `OR`, `NOT` và `ROUND_MONEY`, dùng cho fact suy ra và chốt an toàn.

Mỗi biến trong `apps/engine/rule_language.json` khai báo nguồn giá trị (`binding`): fact do engine tính, fact suy ra trong policy pack, hoặc một ô của `milestones.csv` hay `contracts.csv` kèm kiểu và thông báo lỗi. Ngoài 17 biến của đề, bộ từ vựng có thêm `invoice_required`, `hold_on_open_dispute`, `payment_percent`, `contract_value_vnd_mn`, `auto_release_allowed`; bộ luật của BTC không dùng chúng nên kết quả trên 405 mốc không đổi.

Mỗi kết quả ghi lại cách chọn luật (`selection`: `FIRST_MATCH` hoặc một trong các nhánh về ELSE ở mục 14.12); phần giải thích trong audit trace ghi kết cục của từng luật (mục 14.11) và giá trị mọi biến luật lúc quyết định. Audit trace của lượt chạy ghi mã, phiên bản và băm SHA-256 của policy pack; băm này thuộc định danh lượt chạy.

## 7. Tính tiền

Với P là giá trị mốc (`planned_payment_vnd_mn`):

- `F = MIN(days_late × penalty_rate_pct_per_day / 100 × P, max_penalty_pct / 100 × P)`
- RELEASE: thanh toán P, phạt 0. PENALTY: thanh toán `MAX(0, P − F)`, phạt F. HOLD, REJECT: 0 và 0.
- Tính bằng `Decimal`; làm tròn F tới 0,01 theo ROUND_HALF_UP trước, rồi mới trừ, để thanh toán cộng phạt bằng P.
- Phạt chỉ áp khi `late_penalty_applicable = TRUE`; mốc trễ không áp phạt vẫn RELEASE đủ P.

Ví dụ: mốc 516,00 triệu, phạt 0,10%/ngày, trần 10%, ân hạn 2 ngày, hoàn thành trễ 3 ngày sau hạn: trễ sau ân hạn 1 ngày, F = 0,52, thanh toán 515,48.

## 8. Confidence score

`confidence_score` thuộc [0, 1], là mức chắc chắn đội tự gán cho quyết định. Điểm **không** thay đổi quyết định: tranh chấp mở vẫn HOLD dù điểm cao.

Điểm = độ bền với cách hiểu đề × chất lượng hồ sơ. Trọng số, cách hiểu và switch tương ứng nằm trong policy pack (`readings`, `confidence`).

| Thành phần                                 | Cách tính                                                                                                                                                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cách hiểu chưa được BTC chốt               | Engine chạy lại mốc theo từng cách hiểu khác; nếu quyết định hoặc số tiền đổi thì trừ trọng số: A05 tranh chấp lan cả hợp đồng 0,20; A06 chỉ bên mua được đóng tranh chấp 0,10; A08 bắt buộc INVOICE theo `invoice_required` 0,20 |
| Lỗi hoặc bất thường dữ liệu                | Điểm tối đa 0,50                                                                                                                                                                                                                  |
| Bản lặp                                    | Nhân 0,97 cho mỗi bản lặp (tối đa 3)                                                                                                                                                                                              |
| Event không liên quan                      | Nhân 0,97                                                                                                                                                                                                                         |
| Hoàn thành sát ranh giới trễ hạn (±1 ngày) | Nhân 0,95                                                                                                                                                                                                                         |
| Cảnh báo trình tự (mục 5)                  | Nhân 0,90                                                                                                                                                                                                                         |

Kết quả trên 405 mốc: 1,00 (355 mốc), 0,97 (5), 0,80 (44), 0,60 (1). Cột `notes` liệt kê yếu tố hạ điểm. Đây là thang chắc chắn có giải thích, không phải xác suất đúng; chưa thể hiệu chỉnh thành xác suất vì không có nhãn sai để đối chiếu.

Chỉ cách hiểu còn mở mới hạ điểm. Cách hiểu đã bị mẫu công khai bác bỏ (A01 dùng nguyên văn `allowed_event_types`, A02 cắt event theo snapshot; mục 12) không hạ điểm, vì chọn chúng sẽ làm sai mẫu đã có nhãn.

## 9. Đầu ra và truy vết

Mỗi lượt chạy xuất đủ 405 dòng theo `submission_output_template.csv` (22 cột), không tự lọc tập ẩn.

| Nhóm cột   | Nội dung                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Định danh  | 6 cột giữ nguyên từ template                                                                                                   |
| Quyết định | `predicted_decision`, `predicted_milestone_status`, `reason_code`, `decision_reason`, `rule_id_applied`                        |
| Điều kiện  | `conditions_met`, `missing_conditions` theo token của `required_condition` (`EVENT:X`, `APPROVAL_QUORUM:n`, `NO_OPEN_DISPUTE`) |
| Tiền       | `payable_amount_vnd_mn`, `penalty_amount_vnd_mn`, 2 chữ số thập phân                                                           |
| Bằng chứng | `evidence_event_ids` (event hợp lệ đã dùng; không chứa bản lặp hay event sai quyền)                                            |
| Vận hành   | `confidence_score`, `processing_time_ms`, `evaluated_at`, `engine_name`, `audit_trace_id`, `notes`                             |

Mỗi dòng có một bản audit trace: dấu vân tay dữ liệu đầu vào, phiên bản đặc tả, băm mã nguồn engine và policy pack (`engineBuild`), mã, phiên bản và băm của policy pack, toàn bộ fact, cách chọn luật (`selection`), cảnh báo trình tự, người tạo các event bằng chứng, tham số mốc, giá trị mọi biến luật và kết cục của từng luật (mục 14.11). Màn quyết định hiển thị kết cục này thay vì suy ra từ thứ tự ưu tiên.

Trong ứng dụng, mọi thao tác ghi thành công thêm mục vào nhật ký audit dạng chuỗi băm (mỗi mục chứa băm của mục trước), ghi cùng giao dịch với dữ liệu; thao tác có nhiều hệ quả (ví dụ một quyết định ngoại lệ) có thể ghi nhiều mục cùng `transactionId`. Yêu cầu bị từ chối (lỗi 4xx, kể cả đăng nhập sai) không đổi dữ liệu nghiệp vụ nhưng được ghi một mục `REQUEST_FAILED` để truy vết hành vi bất thường. Các lỗi giống hệt nhau (cùng người, cùng địa chỉ, cùng mã lỗi) trong một phút chỉ ghi một mục; mục kế tiếp ghi số lần đã gộp, để không ai làm phình chuỗi bằng request lỗi. Không sửa, không xoá mục audit. Khôi phục dữ liệu demo neo đầu chuỗi cũ, chuyển toàn bộ dữ liệu cũ, kể cả chuỗi audit, sang kho lưu trữ, rồi ghi `RESET_DEMO_DATA` làm mục đầu tiên của chuỗi mới; mục này liên kết tới băm đầu chuỗi cũ, nên chuỗi mới nối tiếp chuỗi cũ chứ không bắt đầu lại từ số 0.

Những gì chuỗi audit niêm phong và cách kiểm:

| Thành phần               | Cách làm                                                                                                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dữ liệu BTC              | Mục nhập Data Pack niêm phong băm từng bảng                                                                                                                                                                                                                             |
| Event tạo trong ứng dụng | Mục của thao tác niêm phong băm từng event                                                                                                                                                                                                                              |
| Quyết định đã lưu        | Mục của thao tác (và mục nhập) niêm phong băm từng quyết định nó lưu; kiểm toàn vẹn phát hiện quyết định bị sửa trực tiếp mà không cần chạy lại engine                                                                                                                  |
| Đầu chuỗi                | Neo tự động mỗi `ANCHOR_INTERVAL_MINUTES` phút (mặc định 15) khi chuỗi có mục mới, và trước mỗi lần khôi phục demo; mỗi lần neo ghi gốc Merkle (RFC 9162) của toàn chuỗi. Mỗi báo cáo toàn vẹn tự so với lần neo gần nhất                                               |
| Một mục riêng lẻ         | `GET /trust/anchors/proof/:entryId` trả mục đó kèm đường kiểm Merkle (log2 n băm) tới gốc đã neo                                                                                                                                                                        |
| Kiểm độc lập             | `python3 tools/verify_audit.py --records <log>` hoặc `--proof <tệp>`: viết lại bằng Python thuần, không dùng mã của API                                                                                                                                                 |
| Dữ liệu cá nhân          | Email, tên, điện thoại… trong phần thay đổi chỉ lưu dạng HMAC với khoá riêng (`audit-personal.key` trong thư mục trust hoặc `AUDIT_PERSONAL_KEY`); vẫn thấy được là có thay đổi, huỷ khoá thì không còn liên kết được tới người (crypto-shredding), chuỗi vẫn kiểm được |

Giới hạn còn lại: bên làm chứng mặc định là khoá Ed25519 trên cùng máy chủ (`LOCAL_WITNESS`), nên chưa độc lập với người quản trị máy chủ; các mục ghi sau lần neo cuối chỉ được bảo vệ từ lần neo kế tiếp. Bước tiếp theo là nối `AnchorProvider` với dịch vụ dấu thời gian RFC 3161 hoặc blockchain công khai.

Bất biến kiểm trước khi xuất: mỗi mốc đúng một dòng; quyết định và mã lý do khớp luật thắng; tiền không âm, khớp hợp đồng số tiền của quyết định trong policy pack, phạt không vượt trần; mốc được trả tiền không thiếu điều kiện, không có tranh chấp, từ chối, sai thẩm quyền hay lỗi dữ liệu; không mốc nào phải nhờ chốt an toàn giữ lại. Phần kiểm tiền đọc lại tham số từ dữ liệu gốc, không dùng giá trị engine đã tính.

### 9.1. Hợp đồng thông minh trên giao diện

Tab **Hợp đồng thông minh** của mỗi hợp đồng (`contracts.getSmartContract`, quyền `contracts:read`) trình bày hợp đồng như một hợp đồng thông minh, từ dữ liệu sẵn có, không thêm quy tắc mới:

| Phần                         | Nội dung                                                                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cam kết của hai bên          | Số chữ ký đã có trên tổng số lượt ký; chữ ký bao phủ toàn bộ tệp hay bản chụp điều khoản; mã băm được ký; văn bản còn khớp chữ ký hay đã đổi; bộ luật thực thi, kèm phiên bản và mã băm khi hợp đồng ghim một phiên bản luật (SoD-4) |
| Bộ máy thực thi              | Mã, phiên bản và mã băm SHA-256 của policy pack; mã băm của các luật thuộc mọi phạm vi mà các mốc của hợp đồng dùng                                                                                                                  |
| Điều khoản thực thi theo mốc | Với mỗi mốc: chứng từ bắt buộc, phê duyệt, phạt chậm, bảng luật theo dạng "khi … thì …" với kết cục của lần đánh giá gần nhất (mục 14.11) và kết quả hiện tại                                                                        |

## 10. KPI và kết quả

| KPI                       | Định nghĩa                                                                                                                      | Tập đo                                          | Kết quả                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| Rule Execution Accuracy   | Quyết định đúng / tổng                                                                                                          | 20 mẫu công khai                                | 20/20                                                               |
| Scenario Accuracy         | Mẫu khớp toàn bộ 17 cột                                                                                                         | 20 mẫu công khai                                | 20/20                                                               |
| Macro-F1                  | Trung bình F1 của 4 quyết định                                                                                                  | 20 mẫu công khai                                | 1,0000                                                              |
| Unauthorized Payment Rate | Mốc không được trả nhưng bị trả / mốc không được trả                                                                            | 20 mẫu công khai; bộ tổng hợp                   | 0/10; 0/3.586                                                       |
| Amount Accuracy           | Thanh toán và phạt khớp đến 0,01                                                                                                | 20 mẫu công khai                                | 20/20, sai số lớn nhất 0,00                                         |
| Audit Trace               | Dòng có đủ cột, bằng chứng hoặc điều kiện thiếu, và trace                                                                       | 405 mốc                                         | 405/405                                                             |
| Phát hiện giả mạo audit   | Kiểu giả mạo bị phát hiện / kiểu thử (sửa mục, xoá giữa, đảo thứ tự, cắt dưới mốc neo, viết lại cả chuỗi, cắt sau mốc neo cuối) | Ma trận trong `tests/foundation/trust.test.mjs` | Không neo 3/6; có neo 5/6 (kiểu còn lại là giới hạn đã nêu ở mục 9) |
| An toàn bộ luật           | Phạm vi luật qua chứng minh tĩnh / tổng số                                                                                      | 16 phạm vi của BTC, 9.216 tình huống            | 16/16, không luật nào không bao giờ thắng ngoài ELSE                |
| Processing Time           | Thời gian đánh giá mỗi mốc                                                                                                      | 405 mốc                                         | Trung vị khoảng 0,26 ms, p95 khoảng 0,5 ms                          |

**Vì sao 20/20 chưa đủ để kết luận.** Với 20 mẫu, đúng cả 20 vẫn cho khoảng tin cậy Wilson 95% của độ chính xác là 83,9% đến 100%; chia đôi theo loại tình huống (10 phát triển, 10 kiểm tra) thì mỗi nửa là 72,2% đến 100%. Ngoài ra logic được viết khi đã đọc chính 20 mẫu này. Không suy ra độ chính xác trên 405 mốc từ 20 mẫu.

**Bộ ca tổng hợp (`apps/engine/benchmark.py`).** Với mỗi mốc trong 405 mốc và 33 tình huống, bộ sinh viết lại lịch sử event từ chính tham số của mốc và các bên của hợp đồng. Đáp án suy từ fact mà tình huống tạo ra qua bảng luật, độc lập với phần xử lý event của engine; mỗi tình huống dẫn căn cứ từ đề, README hoặc câu trả lời BTC. Ca được chia theo hợp đồng thành nửa phát triển và nửa kiểm tra, biến thể của một mốc không nằm ở cả hai nửa.

| Chỉ số trên nửa kiểm tra                            | Kết quả                                                    |
| --------------------------------------------------- | ---------------------------------------------------------- |
| Số ca                                               | 6.237 (RELEASE 1.860, PENALTY 333, HOLD 3.841, REJECT 203) |
| Độ chính xác quyết định                             | 6.237/6.237, Wilson 95% từ 99,94%                          |
| Khớp toàn bộ quyết định, mã lý do, thanh toán, phạt | 6.237/6.237                                                |
| Macro-F1 (bootstrap theo hợp đồng)                  | 1,0000 (1,0000 đến 1,0000)                                 |
| Unauthorized Payment Rate                           | 0/4.044, cận trên 95% là 0,09%                             |

**Bộ ca có thật sự bắt được lỗi không (`tools/mutation_check.py`).** Một bộ ca do chính đội dựng thì đạt 100% chưa nói lên nhiều, nếu nó không trượt khi engine sai. Công cụ cài lần lượt 16 lỗi thực tế vào engine (phần lớn là "Lỗi 1" tới "Lỗi 6" ở README BTC: bỏ khử trùng lặp, bỏ kiểm thẩm quyền, bỏ qua tranh chấp, đếm phê duyệt theo người thay vì vai trò, tính trễ trước ân hạn, bỏ trần phạt, đảo thứ tự luật, …), rồi đếm nguồn nào phát hiện:

| Nguồn                                                       | Lỗi bị phát hiện                                                                                                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20 mẫu công khai                                            | 7/16                                                                                                                                                 |
| Bộ ca tổng hợp trước khi bổ sung                            | 11/16 (sót: nộp lại chứng từ sau hạn, hai người cùng vai trò, phê duyệt từ vai trò không bắt buộc, bản đóng đóng mọi tranh chấp, tranh chấp gửi lặp) |
| Bộ ca tổng hợp hiện tại (thêm 5 tình huống cho các chỗ sót) | 16/16                                                                                                                                                |

Diễn giải: điểm tuyệt đối ở đây cho thấy engine thực thi đúng bảng luật trên mọi tham số mốc và mọi tình huống biên đã liệt kê (trùng lặp, sai bên, người duyệt khác bên mua hoặc ngừng hoạt động, tranh chấp không tham chiếu, ranh giới ân hạn, vượt trần phạt, phê duyệt và đóng tranh chấp muộn, dữ liệu lệch hợp đồng). Nó không phải bằng chứng đúng với đáp án ẩn ở những điểm diễn giải BTC chưa chốt; rủi ro đó được đo riêng bằng độ nhạy (mục 12) và phản ánh vào confidence.

Phân bố quyết định trên 405 mốc: RELEASE 348, HOLD 36, PENALTY 15, REJECT 6; tổng thanh toán 365.785,87 triệu, tổng phạt 102,13 triệu.

## 11. Ký số và tài liệu

- Mỗi hợp đồng có tệp gốc: tệp tải lên, hoặc văn bản mô phỏng dựng từ điều khoản trong dữ liệu (đánh dấu là mô phỏng, cố định byte để băm ổn định).
- Văn bản sinh ra theo thể thức văn bản hành chính (Nghị định 30/2020/NĐ-CP): khổ A4, lề trên và dưới 20 mm, trái 30 mm, phải 15 mm; Times New Roman 13; căn đều hai bên, thụt đầu dòng 1 cm, giãn dòng 1,15; có quốc hiệu, tiêu ngữ, căn cứ pháp lý, bảng mốc thanh toán và khối chữ ký theo từng bên.
- Chữ ký theo trình tự các bên, gắn với băm SHA-256 nội dung tệp (hoặc băm điều khoản khi chưa có tệp).

Ký số mang lại hai giá trị mà chữ ký trên giấy quét lại không có:

| Giá trị          | Cách hệ thống bảo đảm                                                                                                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toàn vẹn dữ liệu | Chữ ký gắn với băm nội dung; sửa dù một ký tự thì chữ ký không còn khớp và hệ thống báo tài liệu đã thay đổi (`DOCUMENT_CHANGED`). Văn bản bị khoá sau chữ ký đầu tiên. Màn Kiểm tra chữ ký kiểm lại bất kỳ lúc nào, kể cả với một tệp PDF do người dùng tải lên |
| Giá trị pháp lý  | Theo Luật Giao dịch điện tử số 20/2023/QH15, chữ ký số hợp lệ có giá trị như chữ ký tay, và chữ ký số của cơ quan, tổ chức đáp ứng yêu cầu đóng dấu; người ký không thể chối bỏ việc đã ký                                                                       |
| Truy vết         | Trình tự ký, người ký, thời điểm và phương thức được ghi vào nhật ký chuỗi băm; quyền ký lấy từ tài khoản đăng nhập                                                                                                                                              |

- Bản demo dùng chứng thư mô phỏng và ghi rõ trên màn hình; giá trị pháp lý nói trên chỉ có khi ký qua nhà cung cấp dịch vụ chứng thực chữ ký số được cấp phép, là bước tích hợp của MVP.
- AI đọc PDF chỉ đề xuất trường kèm trang và đoạn trích; người dùng xác nhận; AI không tham gia quyết định thanh toán.

## 12. Đối chiếu đề bài và câu trả lời BTC

| Nguồn                     | Yêu cầu                                                                                                                                                                                         | Cách đáp ứng                                                                                     | Bằng chứng                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Đề, mục 2                 | Contract, Milestone, Event, Rule Check, Decision, Audit Log                                                                                                                                     | Mục 5, 6, 9                                                                                      | `tests/test_engine_stages.py`, `tests/foundation/workflow.test.mjs`                                         |
| Đề, mục 2                 | Kiểm required event, quyền actor, quorum, dispute, rejection, thời hạn                                                                                                                          | Mục 2.1, 5                                                                                       | Bộ ca tổng hợp 33 tình huống, kiểm thử đột biến 16/16                                                       |
| Đề, mục 4                 | Trạng thái hợp đồng và mốc, điều kiện đạt và thiếu, quyết định, tiền, lý do, luật, bằng chứng, audit, thời gian xử lý                                                                           | Mục 4, 9                                                                                         | `tests/test_golden_output.py`                                                                               |
| Đề, mục 5                 | Bronze: không RELEASE khi chưa đủ điều kiện                                                                                                                                                     | Luật 10 đến 50, bất biến mục 9                                                                   | Unauthorized Payment Rate 0                                                                                 |
| Đề, mục 6                 | 5 nhóm KPI và cách đo                                                                                                                                                                           | Mục 10                                                                                           | `apps/engine/cli.py`, `apps/engine/benchmark.py`                                                            |
| Đề, mục 10                | Event thiếu, lặp, sai quyền, thiếu phê duyệt, tranh chấp, từ chối, chậm tiến độ                                                                                                                 | Mục 5                                                                                            | Bộ ca tổng hợp                                                                                              |
| Đề, mục 10                | Không hard-code; khi chưa rõ thì HOLD                                                                                                                                                           | Policy pack và bộ luật là dữ liệu (mục 6.2); chốt an toàn thanh toán và số tiền (mục 5)          | `tests/test_policy_engine.py`                                                                               |
| BTC, ngày hoàn thành      | Muộn nhất trong required event hợp lệ; APPROVAL và DISPUTE_RESOLVED không đẩy ngày; chỉ tính phần trễ lớn hơn 0                                                                                 | BR-11, mục 5                                                                                     | `tests/test_btc_clarifications.py`; tình huống `LATE_APPROVAL_ON_TIME_WORK`, `LATE_RESOLUTION_ON_TIME_WORK` |
| BTC, tranh chấp           | OPENED thì HOLD; RESOLVED tham chiếu đúng thì gỡ; stakeholder bổ sung phải có vai trò, quyền OPEN/RESOLVE, audit                                                                                | Mục 2.1, 2.2, 9                                                                                  | Tình huống `RESOLUTION_WITHOUT_REFERENCE_HOLD`; test workflow tranh chấp                                    |
| BTC, confidence           | Trong [0, 1], không thay quyết định, đội tự giải thích                                                                                                                                          | Mục 8                                                                                            | `tests/test_btc_clarifications.py`                                                                          |
| BTC, tập ẩn               | 405 = 20 công khai + 250 hidden + 135 holdout; pipeline tổng quát                                                                                                                               | Xuất đủ 405 dòng, không hard-code                                                                | Test 405 dòng, bộ ca tổng hợp trên mọi mốc                                                                  |
| BTC, ELSE                 | Nhánh mặc định cuối, HOLD                                                                                                                                                                       | Mục 6                                                                                            | Tình huống `UNREADABLE_PARAMETER_HOLD`, `CONTRACT_MISMATCH_HOLD`                                            |
| BTC, trình bày            | Slide tối đa 15 trang, khoảng 5 phút: Bài toán, Giải pháp, Logic xử lý, KPI, Demo, Kế hoạch MVP                                                                                                 | Hồ sơ nộp                                                                                        |                                                                                                             |
| BTC, phụ lục              | Tùy chọn, không bắt buộc PDF; gồm wireframe, sơ đồ kiến trúc và workflow, ảnh màn hình, dữ liệu mẫu, tài liệu kỹ thuật; nhiều tệp thì nén thành 01 tệp `.zip`, ví dụ `HSSK_TenDoi_D_PhuLuc.zip` | Phụ lục 5 thư mục: sơ đồ, màn hình, dữ liệu mẫu, kịch bản kiểm thử, tài liệu kỹ thuật            | `HSSK_<TenDoi>_D_PhuLuc.zip`                                                                                |
| BTC, scenario test Silver | Đội tự xây dựng hoặc giả lập; có thể lấy scenario mẫu của Data Pack làm baseline rồi bổ sung                                                                                                    | Baseline 20 nhãn công khai; bổ sung bộ ca tổng hợp 28 tình huống và ma trận 79 kịch bản workflow | `apps/engine/benchmark.py`, `tests/foundation/business-rules.test.mjs`                                      |

Điểm diễn giải còn mở và ảnh hưởng đo được trên 405 mốc:

| Mã  | Điểm còn mở                                                 | Đội chọn                                                                                                                                                                                                | Nếu chọn khác                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 | Thẩm quyền 4 loại event chưa có mẫu                         | Theo loại bên trong quy trình                                                                                                                                                                           | Dùng nguyên văn `allowed_event_types`: 108 mốc đổi kết quả (101 đổi quyết định), chỉ khớp 15/20 mẫu; mẫu bác bỏ nên không hạ confidence                                                                                                                                 |
| A02 | 267 event (tới 27/05/2027) nằm sau ngày snapshot 18/10/2026 | Dùng toàn bộ lịch sử (`offline_full_history` trong `notes`)                                                                                                                                             | Cắt theo snapshot: 92 mốc đổi kết quả (84 đổi quyết định), sai 3 mẫu SC003 đến SC005 (SC005 hoàn thành 13/11/2026 vẫn PENALTY); mẫu bác bỏ nên không hạ confidence                                                                                                      |
| A05 | Tranh chấp theo mốc hay cả hợp đồng                         | Theo mốc                                                                                                                                                                                                | 31 mốc đổi sang HOLD                                                                                                                                                                                                                                                    |
| A06 | Ai được đóng tranh chấp                                     | Bài nộp BTC chỉ kiểm tham chiếu; workflow bắt buộc bên mua                                                                                                                                              | Bắt buộc bên mua cho bài nộp: 0 mốc đổi trên Data Pack (8 bản đóng đều do bên mua); vẫn tính trong confidence vì tập ẩn có thể khác                                                                                                                                     |
| A07 | Chế độ làm tròn                                             | ROUND_HALF_UP tới 0,01 (quy ước tiền của đội, mục 7). Phải làm tròn: mẫu SC006 (MS0041) phạt thô 6,624, nhãn 6,62; 7/15 mốc PENALTY có phạt thô lẻ quá 2 chữ số. Luôn làm tròn lên sẽ ra 6,63, sai nhãn | Chỉ MS0396 rơi đúng nửa đơn vị (10,605). Công thức BTC `days × rate / 100 × planned` tính bằng số thực ra 10,605000000000002, làm tròn được 10,61, trùng HALF_UP; chỉ `Decimal` HALF_EVEN cho 10,60. Không đổi quyết định; là quy ước tính tiền nên không hạ confidence |
| A08 | `invoice_required` nhưng INVOICE không bắt buộc             | Theo `required_event_types`                                                                                                                                                                             | 15 mốc đổi sang HOLD                                                                                                                                                                                                                                                    |
| A13 | Định dạng điều kiện đạt và thiếu                            | Token của `required_condition`                                                                                                                                                                          | Không đo được                                                                                                                                                                                                                                                           |

## 13. Tái lập

```bash
python3 apps/engine/cli.py --output out        # 405 dòng, audit, KPI
python3 apps/engine/benchmark.py --report out  # bộ ca tổng hợp
python3 tools/kiem_chung_nghiep_vu.py --check  # kiểm mẫu và bất biến
python3 apps/engine/cli.py --policy-info       # từ vựng của policy pack đang dùng
python3 apps/engine/cli.py --policy FILE       # chạy với một policy pack khác
python3 tools/mutation_check.py                # bộ ca có bắt được 16 lỗi cài vào không
python3 tools/verify_audit.py --records .data/records.json  # kiểm độc lập chuỗi audit
pnpm test                                      # toàn bộ test Python và Node
```

## 14. Từ điển trạng thái: mã kỹ thuật và từ nghiệp vụ

Engine, API và Data Pack dùng mã (cột "Mã"). Màn hình nghiệp vụ chỉ hiển thị từ nghiệp vụ tương ứng. Mã được giữ nguyên ở những nơi phục vụ đối chiếu và chấm điểm: phần "Chi tiết kỹ thuật" và bảng luật trên màn truy vết quyết định, Nhật ký hoạt động, màn Toàn vẹn dữ liệu, Kết quả Data Pack và file CSV xuất ra. Nhãn được lấy từ `apps/web/src/locales/{vi,en}/domain.json`; khi đổi nhãn, cập nhật bảng này cùng lúc.

### 14.1. Quyết định thanh toán của engine

Bốn quyết định engine trả về cho mỗi mốc. Màn hình hiển thị nhãn ngắn; khi rê chuột vào nhãn sẽ thấy phần ý nghĩa.

| Mã        | Tiếng Việt trên UI | Tiếng Anh trên UI | Ý nghĩa                                   |
| --------- | ------------------ | ----------------- | ----------------------------------------- |
| `RELEASE` | Chi đủ             | Pay in full       | Đủ điều kiện chi toàn bộ                  |
| `PENALTY` | Chi sau trừ phạt   | Pay less penalty  | Đủ điều kiện chi sau khi trừ phạt trễ hạn |
| `HOLD`    | Tạm giữ            | Hold              | Tạm giữ, chưa chi                         |
| `REJECT`  | Không chi          | Do not pay        | Không chi: người có thẩm quyền đã từ chối |

### 14.2. Lý do quyết định

Mỗi quyết định kèm đúng một lý do, theo thứ tự ưu tiên của luật (mục 6).

| Mã                        | Tiếng Việt trên UI                           | Tiếng Anh trên UI                                  |
| ------------------------- | -------------------------------------------- | -------------------------------------------------- |
| `OPEN_DISPUTE`            | Đang có tranh chấp chưa đóng                 | A dispute is still open                            |
| `REJECTION_PRESENT`       | Người phê duyệt đã từ chối                   | An approver rejected it                            |
| `UNAUTHORIZED_EVENT`      | Có chứng từ do bên không có thẩm quyền tạo   | Evidence created by a party without authority      |
| `MISSING_REQUIRED_EVENT`  | Còn thiếu chứng từ bắt buộc                  | Required evidence is missing                       |
| `APPROVAL_QUORUM_NOT_MET` | Chưa đủ vai trò phê duyệt                    | Approval roles not complete                        |
| `LATE_COMPLETION`         | Hoàn thành sau hạn và ân hạn                 | Completed after the due date and grace period      |
| `ALL_CONDITIONS_MET`      | Đủ mọi điều kiện                             | All conditions met                                 |
| `UNRESOLVED_CONDITION`    | Không đánh giá tự động được, giữ để kiểm tra | Cannot be evaluated automatically; held for review |

### 14.3. Trạng thái mốc thanh toán

Trạng thái là vị trí của mốc trong vòng đời (mục 4), khác với quyết định: ví dụ mốc "Chờ phê duyệt" có quyết định "Tạm giữ".

| Mã                     | Tiếng Việt trên UI         | Tiếng Anh trên UI     |
| ---------------------- | -------------------------- | --------------------- |
| `WAITING_EVIDENCE`     | Chờ chứng từ               | Waiting for evidence  |
| `WAITING_APPROVAL`     | Chờ phê duyệt              | Waiting for approval  |
| `ON_HOLD`              | Tạm giữ                    | On hold               |
| `REJECTED`             | Bị từ chối                 | Rejected              |
| `ELIGIBLE_FOR_PAYMENT` | Đủ điều kiện chi           | Eligible for payment  |
| `PAID_WITH_PENALTY`    | Đủ điều kiện chi, trừ phạt | Payable after penalty |
| `COMPLETED`            | Đã chuyển chi              | Payment transferred   |
| `PLANNED`              | Chưa bắt đầu               | Planned               |
| `IN_PROGRESS`          | Đang thực hiện             | In progress           |

### 14.4. Trạng thái hợp đồng

| Mã                        | Tiếng Việt trên UI   | Tiếng Anh trên UI       |
| ------------------------- | -------------------- | ----------------------- |
| `DRAFT`                   | Bản nháp             | Draft                   |
| `AWAITING_SIGNATURE`      | Đang ký              | Signing                 |
| `PENDING_CONDITIONS`      | Chờ điều kiện        | Pending conditions      |
| `NEEDS_REVIEW`            | Cần xem xét          | Needs review            |
| `ALL_MILESTONES_ELIGIBLE` | Mọi mốc đủ điều kiện | All milestones eligible |
| `CLOSED`                  | Đã đóng              | Closed                  |

### 14.5. Phân loại sự kiện khi engine lọc bằng chứng

Kết quả bước lọc bằng chứng (mục 5) cho từng sự kiện của mốc.

| Mã                     | Tiếng Việt trên UI        | Tiếng Anh trên UI           |
| ---------------------- | ------------------------- | --------------------------- |
| `EVIDENCE`             | Bằng chứng hợp lệ         | Valid evidence              |
| `ADDITIONAL`           | Hợp lệ, đã có bản sớm hơn | Valid, earlier copy counted |
| `APPROVAL`             | Phê duyệt được tính       | Approval counted            |
| `APPROVAL_NOT_COUNTED` | Phê duyệt không được tính | Approval not counted        |
| `REJECTION`            | Từ chối                   | Rejection                   |
| `OPEN_DISPUTE`         | Tranh chấp đang mở        | Open dispute                |
| `CLOSED_DISPUTE`       | Tranh chấp đã đóng        | Closed dispute              |
| `RESOLUTION`           | Đóng tranh chấp           | Dispute resolution          |
| `DUPLICATE`            | Bản lặp (bị loại)         | Duplicate (excluded)        |
| `UNAUTHORIZED`         | Sai thẩm quyền            | Unauthorised                |
| `WRONG_STATUS`         | Sai trạng thái            | Wrong status                |
| `UNRELATED`            | Không liên quan           | Unrelated                   |
| `VOIDED`               | Đã vô hiệu                | Voided                      |

### 14.6. Trạng thái sự kiện

| Mã          | Tiếng Việt trên UI | Tiếng Anh trên UI |
| ----------- | ------------------ | ----------------- |
| `CONFIRMED` | Đã xác nhận        | Confirmed         |
| `APPROVED`  | Đã duyệt           | Approved          |
| `REJECTED`  | Từ chối            | Rejected          |
| `OPEN`      | Đang mở            | Open              |
| `RESOLVED`  | Đã đóng            | Resolved          |

### 14.7. Nguồn dữ liệu

| Mã          | Tiếng Việt trên UI | Tiếng Anh trên UI |
| ----------- | ------------------ | ----------------- |
| `DATA_PACK` | Dữ liệu BTC        | Organiser data    |
| `SEED`      | Dữ liệu bổ sung    | Demo seed         |
| `APP`       | Tạo trong app      | Created in app    |

### 14.8. Vai trò phê duyệt trong Data Pack

| Mã                   | Tiếng Việt trên UI  | Tiếng Anh trên UI  |
| -------------------- | ------------------- | ------------------ |
| `CONTRACT_OWNER`     | Chủ hợp đồng        | Contract owner     |
| `FINANCE_APPROVER`   | Phê duyệt tài chính | Finance approver   |
| `SECONDARY_APPROVER` | Phê duyệt cấp 2     | Secondary approver |

### 14.9. Bên của hợp đồng

| Mã         | Tiếng Việt trên UI | Tiếng Anh trên UI |
| ---------- | ------------------ | ----------------- |
| `BUYER`    | Bên mua            | Buyer             |
| `SUPPLIER` | Nhà cung cấp       | Supplier          |

### 14.10. Vai trò người dùng hệ thống

| Mã                   | Tên trên UI             |
| -------------------- | ----------------------- |
| `CONTRACT_OWNER`     | Chủ hợp đồng            |
| `LEGAL_REVIEWER`     | Cán bộ hợp đồng bên mua |
| `SUPPLIER`           | Nhà cung cấp            |
| `FINANCE_APPROVER`   | Phê duyệt tài chính     |
| `ADMIN_AUDITOR`      | Kiểm soát viên          |
| `SECONDARY_APPROVER` | Phê duyệt cấp 2         |
| `SYSTEM_ADMIN`       | Quản trị hệ thống       |
| `AUDITOR`            | Kiểm tra toàn vẹn       |

### 14.11. Kết quả xét từng luật

Trên bảng luật của màn truy vết quyết định, mỗi luật của phạm vi có một kết quả, lấy từ phần giải thích trong audit trace của engine.

| Mã              | Tiếng Việt trên UI                                | Tiếng Anh trên UI                           |
| --------------- | ------------------------------------------------- | ------------------------------------------- |
| `MATCHED`       | Khớp, áp dụng                                     | Matched, applied                            |
| `NOT_MATCHED`   | Không khớp                                        | Not matched                                 |
| `NOT_EVALUATED` | Không xét (đã có rule khớp)                       | Not evaluated (earlier rule matched)        |
| `OVERRIDDEN`    | Khớp nhưng bị hạ xuống ELSE do dữ liệu bất thường | Matched, but sent to ELSE by a data anomaly |
| `SET_ASIDE`     | Khớp nhưng bị chốt an toàn tạm giữ                | Matched, set aside by a safety check        |
| `FAILED`        | Không tính được                                   | Could not be evaluated                      |

### 14.12. Cách engine chọn luật áp dụng

Khi không phải `FIRST_MATCH`, màn truy vết hiển thị một ghi chú giải thích vì sao mốc được tạm giữ.

| Mã                       | Ý nghĩa                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `FIRST_MATCH`            | Luật đầu tiên khớp theo ưu tiên được áp dụng                              |
| `STRUCTURE_FALLBACK`     | Dữ liệu của mốc có lỗi cấu trúc, không xét luật, về ELSE                  |
| `ANOMALY_FALLBACK`       | Luật cho chi khớp nhưng hồ sơ có bất thường, về ELSE                      |
| `PAYMENT_GUARD_FALLBACK` | Luật cho chi khớp nhưng chốt an toàn thanh toán không đạt, về ELSE        |
| `RULE_ERROR_FALLBACK`    | Một luật không tính được trên dữ liệu của mốc, về ELSE                    |
| `AMOUNT_GUARD_FALLBACK`  | Số tiền của luật khớp không đúng hợp đồng số tiền của quyết định, về ELSE |
