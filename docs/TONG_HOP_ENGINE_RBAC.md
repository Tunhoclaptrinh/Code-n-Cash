# Tổng hợp thay đổi: engine, RBAC mới và nghiệp vụ theo vai trò

Phạm vi: PR #7, #8, #9 (đã merge vào `main`) và PR #10 (đang mở). Nguồn: mã nguồn trên `main` (5edfb25), nhánh `feat/dynamic-policy-engine` (bdd2720), `packages/contracts/permissions.json`, `apps/api/src/domain/accounts.ts`, `docs/NGHIEP_VU.md`.

## 1. Thay đổi của engine

| PR  | Hạng mục               | Trước                                 | Sau                                                                                                                                                                                                                                                        | Bằng chứng                          |
| --- | ---------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| #7  | Cấu trúc engine        | Một tệp evaluator                     | Package `codecash_engine`, mỗi bước một module (structure, events, requirements, controls, schedule, rules, amounts, confidence, trace)                                                                                                                    | `tests/test_engine_stages.py`       |
| #7  | Kết quả chuẩn          | Không có mốc so sánh                  | Golden snapshot toàn bộ 405 mốc; mọi thay đổi engine phải khớp snapshot                                                                                                                                                                                    | `tests/golden/`                     |
| #7  | Benchmark              | Chỉ 20 mẫu công khai                  | Benchmark tổng hợp, chia theo hợp đồng (dev/test), hiển thị trên màn kết quả Data Pack                                                                                                                                                                     | `GET /engine/benchmark`             |
| #7  | Confidence             | Điểm cố định theo lý do               | Chấm theo độ vững trước các cách hiểu mở của đề và chất lượng bản ghi                                                                                                                                                                                      | `confidence.py`                     |
| #7  | Lỗ hổng luật           | 3 lỗ hổng do test nghiệp vụ ghi nhận  | Đã đóng                                                                                                                                                                                                                                                    | commit "close the three rule gaps"  |
| #8  | Lỗi khi tính luật      | Một luật lỗi làm hỏng cả lượt chạy    | Chỉ mốc bị lỗi về ELSE (HOLD), issue `RULE_EVALUATION_ERROR` kèm mã luật                                                                                                                                                                                   | test engine                         |
| #8  | Cảnh báo trình tự      | Không có                              | Phê duyệt trước chứng từ cuối, chứng từ trước ngày ký, nghi trùng trong 24 giờ, tranh chấp do nhà cung cấp tự đóng, phê duyệt vượt hạn mức. Chỉ hạ confidence, không đổi quyết định                                                                        | `sequence.py`                       |
| #8  | Hạn mức phê duyệt      | Không kiểm                            | Người duyệt có `approval_limit_vnd_mn` nhỏ hơn giá trị mốc thì phê duyệt không được tính                                                                                                                                                                   | `controls.py`                       |
| #8  | Trace                  | Kết quả và lý do                      | Thêm giá trị biến luật, kết cục từng luật, băm mã nguồn engine                                                                                                                                                                                             | audit trace                         |
| #8  | An toàn bộ luật        | Chỉ so 405 mốc                        | Chứng minh tĩnh trên lưới giá trị biên; luật không an toàn bị chặn `RULE_VERSION_UNSAFE` trước khi công bố                                                                                                                                                 | `safety.py`                         |
| #8  | Mutation check         | 11/16 lỗi cài vào bị bắt              | 16/16                                                                                                                                                                                                                                                      | `tools/mutation_check.py`           |
| #10 | Chính sách nghiệp vụ   | Hằng số rải trong các module          | Policy pack `apps/engine/policy/case4_btc.json` (`CODECASH_POLICY_V1`, `CASE4_BTC` 2.0.0), được kiểm và biên dịch khi nạp; tệp sai bị từ chối kèm danh sách lỗi                                                                                            | `policy.py`                         |
| #10 | Nội dung policy pack   | Không có                              | Loại event, nhóm, bên tạo, trạng thái hợp lệ, điều kiện thẩm quyền, khử trùng lặp, tranh chấp, phê duyệt, ngày hoàn thành, bất thường, ngoại lệ, quyết định và hợp đồng số tiền, chốt an toàn, token điều kiện, cách hiểu, hồ sơ chạy, trọng số confidence | `docs/NGHIEP_VU.md` mục 6.2         |
| #10 | Bộ biên dịch biểu thức | Chỉ `BTC_DSL_V1`                      | Một bộ biên dịch danh sách trắng, 3 phương ngữ: luật (`BTC_DSL_V1` giữ nguyên), fact (thêm `OR`, `NOT`, `ROUND_MONEY`), bản ghi (`actor.*`, `contract.*`, chuỗi, `IN`)                                                                                     | `expressions.py`                    |
| #10 | Biến luật              | 17 biến cố định trong code            | Mỗi biến khai báo nguồn (fact, cấu hình, ô của `milestones.csv` hoặc `contracts.csv`); thêm 5 biến: `invoice_required`, `hold_on_open_dispute`, `payment_percent`, `contract_value_vnd_mn`, `auto_release_allowed`                                         | `rule_language.json`, `bindings.py` |
| #10 | Bộ luật                | Giả định đúng 8 luật, ưu tiên 10..80  | Bộ luật bất kỳ hợp lệ khi: ưu tiên không trùng, ELSE ở cuối, quyết định và lý do có trong policy, đủ 8 mã lý do chuẩn                                                                                                                                      | `structure.py`                      |
| #10 | Chốt an toàn           | Gắn với bảng luật                     | Độc lập với bảng luật: luật trả tiền về ELSE khi còn tranh chấp mở, có từ chối hợp lệ hoặc thiếu điều kiện; số tiền phải không âm và không vượt giá trị mốc. Mỗi lần chốt can thiệp được báo là vi phạm bất biến                                           | `rules.py`, `amounts.py`            |
| #10 | Giải thích quyết định  | Không có cách chọn luật               | `selection` (`FIRST_MATCH` hoặc nhánh về ELSE), 6 kết cục luật (thêm `SET_ASIDE`, `FAILED`), giá trị mọi biến; màn quyết định hiển thị bảng biến                                                                                                           | `VariablesPanel.tsx`                |
| #10 | API dùng chung policy  | Bản sao hằng số trong `vocabulary.ts` | API đọc thẩm quyền event, trạng thái hợp lệ, trạng thái theo lý do, quyết định trả tiền từ cùng tệp policy                                                                                                                                                 | `apps/api/src/domain/policy.ts`     |
| #10 | CLI                    | Không chọn được policy                | `--policy FILE`, `--policy-info`; băm policy thuộc định danh lượt chạy                                                                                                                                                                                     | `apps/engine/cli.py`                |

Kết quả trên Data Pack không đổi qua #7, #8, #10: RELEASE 348, HOLD 36, PENALTY 15, REJECT 6; thanh toán 365.785,87 triệu, phạt 102,13 triệu; 20/20 mẫu công khai đúng. Benchmark #10: 5.373/5.373 (test), 5.408/5.408 (dev).

## 2. RBAC: trước và sau PR #8

| Hạng mục                           | Trước #8                                                                                      | Sau #8 (hiện tại)                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Kiểm soát viên (`ADMIN_AUDITOR`)   | 2 tài khoản nền tảng `admin@codecash.vn`, `controller@codecash.vn`, phạm vi **toàn hệ thống** | Mỗi bên một kiểm soát viên: `controller@novaan.vn` (bên mua), `controller@phuminh.vn` (nhà cung cấp), phạm vi **tổ chức mình** |
| Đề xuất ngoại lệ                   | Kiểm soát viên đề xuất                                                                        | **Chủ hợp đồng** đề xuất (`exceptions:propose`)                                                                                |
| Duyệt ngoại lệ                     | Kiểm soát viên thứ hai, phạm vi toàn hệ thống                                                 | **Kiểm soát viên của bên mua** duyệt (`exceptions:decide`, phạm vi tổ chức); kiểm soát viên nhà cung cấp chỉ theo dõi          |
| Quản trị hệ thống (`SYSTEM_ADMIN`) | Đọc được tài liệu hợp đồng                                                                    | Không đọc nội dung hợp đồng; giữ tài khoản, cấu hình, mẫu, công bố luật, neo chuỗi audit, khôi phục demo                       |
| Kiểm tra toàn vẹn (`AUDITOR`)      | Đọc hợp đồng, phê duyệt, tranh chấp, tài khoản, cấu hình, kết quả engine                      | Chỉ thấy **bản tóm tắt** mục audit (digest), neo và bằng chứng Merkle; không đọc nội dung, không ghi                           |
| Công bố phiên bản luật             | Cần người duyệt thứ hai (`SECOND_REVIEWER_REQUIRED`)                                          | Một quản trị công bố phiên bản đã qua kiểm tra; phiên bản chỉ ràng buộc hợp đồng khi cả hai bên ký văn bản ghim nó (SoD-4)     |
| Dữ liệu cá nhân trong audit        | Lưu nguyên văn                                                                                | Email, tên, điện thoại trong phần thay đổi chỉ lưu dạng HMAC                                                                   |
| Tài khoản cũ khi nâng cấp          | Không áp dụng                                                                                 | Tài khoản seed không còn trong danh mục bị tắt (không xoá, vì audit còn nhắc tới)                                              |

Danh tính, tổ chức và vai trò luôn suy ra từ phiên đăng nhập; API không nhận vai trò, mã người dùng hay tổ chức do trình duyệt gửi lên.

## 3. Vai trò hiện tại và tài khoản demo

| Vai trò                                       | Thuộc        | Tài khoản demo          | Việc chính                                                                                           |
| --------------------------------------------- | ------------ | ----------------------- | ---------------------------------------------------------------------------------------------------- |
| Chủ hợp đồng (`CONTRACT_OWNER`)               | Bên mua      | `owner@novaan.vn`       | Soạn, số hoá, gửi ký hợp đồng; phê duyệt theo vai trò; mở và giải quyết tranh chấp; đề xuất ngoại lệ |
| Phê duyệt tài chính (`FINANCE_APPROVER`)      | Bên mua      | `finance@novaan.vn`     | Phê duyệt hoặc từ chối mốc; chuyển khoản                                                             |
| Phê duyệt thứ hai (`SECONDARY_APPROVER`)      | Bên mua      | `secondary@novaan.vn`   | Phê duyệt hoặc từ chối mốc đúng vai trò                                                              |
| Cán bộ hợp đồng (`LEGAL_REVIEWER`)            | Bên mua      | `legal@novaan.vn`       | Soạn và rà điều khoản, thiết lập vị trí ký, nộp chứng từ phía bên mua, mở và giải quyết tranh chấp   |
| Nhà cung cấp (`SUPPLIER`)                     | Nhà cung cấp | `supplier@phuminh.vn`   | Ký, nộp chứng từ phía nhà cung cấp, mở tranh chấp                                                    |
| Kiểm soát viên bên mua (`ADMIN_AUDITOR`)      | Bên mua      | `controller@novaan.vn`  | Xem hợp đồng của bên mua; duyệt hoặc trả lại đề xuất ngoại lệ                                        |
| Kiểm soát viên nhà cung cấp (`ADMIN_AUDITOR`) | Nhà cung cấp | `controller@phuminh.vn` | Xem hợp đồng đã ký của nhà cung cấp; theo dõi bên mua chi đúng hợp đồng                              |
| Quản trị hệ thống (`SYSTEM_ADMIN`)            | Nền tảng     | `sysadmin@codecash.vn`  | Tài khoản, tổ chức, cấu hình, mẫu, phiên bản luật, neo audit, khôi phục demo                         |
| Kiểm tra toàn vẹn (`AUDITOR`)                 | Nền tảng     | `auditor@codecash.vn`   | Kiểm chuỗi audit, neo và bằng chứng Merkle                                                           |

Mật khẩu demo: `Passw0rd!`.

## 4. Ma trận quyền nghiệp vụ

Phạm vi: `org` tổ chức mình, `own` chỉ bản ghi mình là một bên, `assigned` chỉ bước được giao, `all` toàn hệ thống, `—` không có quyền. Bảng dưới là các quyền nghiệp vụ; quyền quản trị dữ liệu (tổ chức, tài khoản, cấu hình, mẫu) chỉ `SYSTEM_ADMIN` có. Ma trận đầy đủ: `packages/contracts/permissions.json`.

| Quyền                          | Chủ HĐ   | Tài chính | Duyệt 2  | Cán bộ HĐ | Kiểm soát viên | Quản trị | Toàn vẹn | NCC      |
| ------------------------------ | -------- | --------- | -------- | --------- | -------------- | -------- | -------- | -------- |
| `contracts:read`               | org      | org       | org      | org       | org            | —        | —        | own      |
| `contracts:draft-write`        | org      | —         | —        | org       | —              | —        | —        | —        |
| `signing:sign`                 | assigned | assigned  | assigned | assigned  | —              | —        | —        | assigned |
| `evidence:submit`              | —        | —         | —        | org       | —              | —        | —        | own      |
| `approvals:vote`               | org      | org       | org      | —         | —              | —        | —        | —        |
| `payments:transfer`            | —        | org       | —        | —         | —              | —        | —        | —        |
| `disputes:open`                | org      | —         | —        | org       | —              | —        | —        | own      |
| `disputes:resolve`             | org      | —         | —        | org       | —              | —        | —        | —        |
| `exceptions:propose`           | org      | —         | —        | —         | —              | —        | —        | —        |
| `exceptions:decide`            | —        | —         | —        | —         | org            | —        | —        | —        |
| `engine:read`                  | org      | org       | org      | org       | org            | —        | —        | —        |
| `engine:evaluate`              | org      | org       | —        | —         | org            | —        | —        | —        |
| `documents:read`               | org      | org       | org      | org       | org            | —        | —        | —        |
| `rules:write`, `rules:publish` | —        | —         | —        | —         | —              | all      | —        | —        |
| `rules:read`                   | —        | —         | —        | —         | all            | all      | all      | —        |
| `audit:read`, `audit:export`   | —        | —         | —        | —         | —              | all      | all      | —        |
| `anchors:write`                | —        | —         | —        | —         | —              | all      | —        | —        |
| `demo:reset`                   | —        | —         | —        | —         | —              | all      | —        | —        |

## 5. Nghiệp vụ khi có các vai trò mới

| Quy trình                               | Các bước                                                                                              | Vai trò thực hiện                                                  | Kiểm soát ở API                                                                                                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Soạn và ký hợp đồng                     | Soạn hoặc tải hợp đồng, rà điều khoản trích xuất, đặt vị trí ký, ký tuần tự, kích hoạt                | Chủ hợp đồng, cán bộ hợp đồng; người ký được giao; nhà cung cấp    | Chỉ người được giao ký; file đổi sau khi trích xuất thì dừng ký; hợp đồng ghim phiên bản luật lúc tạo                                                                                    |
| Nộp chứng từ                            | Ghi event của mốc                                                                                     | Bên mua: cán bộ hợp đồng. Nhà cung cấp: `SUPPLIER`                 | Mỗi bên chỉ ghi loại event của bên mình (thẩm quyền đọc từ policy pack); engine chạy lại trong cùng giao dịch                                                                            |
| Phê duyệt chi                           | Phê duyệt hoặc từ chối mốc                                                                            | Chủ hợp đồng, phê duyệt tài chính, phê duyệt thứ hai               | Đếm theo vai trò bắt buộc, một người một lần; vượt hạn mức thì không tính                                                                                                                |
| Tranh chấp                              | Mở; giải quyết                                                                                        | Mở: chủ HĐ, cán bộ HĐ, nhà cung cấp. Giải quyết: chủ HĐ, cán bộ HĐ | Mốc bị giữ (HOLD) đến khi có `DISPUTE_RESOLVED` hợp lệ; nhà cung cấp không tự đóng                                                                                                       |
| Ngoại lệ (vô hiệu event sai thẩm quyền) | Chủ HĐ đề xuất kèm ghi chú; kiểm soát viên bên mua duyệt hoặc trả lại; engine chạy lại                | Chủ hợp đồng; kiểm soát viên bên mua; kiểm soát viên NCC theo dõi  | `CONTRACT_OWNER_ONLY`, `NOTE_REQUIRED`, `EVENT_NOT_VOIDABLE`, `CONTROLLERS_ONLY`, `BUYER_ONLY`, `EXCEPTION_ALREADY_DECIDED`, `SECOND_CONTROLLER_REQUIRED` (người đề xuất không tự duyệt) |
| Phiên bản luật                          | Soạn, xem trước trên 405 mốc, gửi duyệt, chứng minh an toàn, công bố                                  | Quản trị hệ thống                                                  | Chặn nếu đổi bất kỳ kết quả nào trên Data Pack (`RULE_VERSION_REGRESSION`) hoặc không an toàn (`RULE_VERSION_UNSAFE`); ràng buộc khi hai bên ký                                          |
| Kiểm tra toàn vẹn                       | Kiểm chuỗi, so với lần neo gần nhất, lấy bằng chứng Merkle, kiểm độc lập bằng `tools/verify_audit.py` | Kiểm tra toàn vẹn, quản trị hệ thống                               | Chỉ trả digest, không nội dung; kiểm soát viên các bên bị từ chối (403)                                                                                                                  |
| Khôi phục demo                          | Neo chuỗi cũ, lưu trữ, nạp lại dữ liệu                                                                | Quản trị hệ thống                                                  | Lưu trữ thay vì xoá; chuỗi mới nối tiếp chuỗi cũ                                                                                                                                         |

## 6. Tách nhiệm (SoD)

| Mã    | Quy tắc                                                                                                            | Cách thực thi                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| SoD-1 | Người cấu hình không xử lý ngoại lệ và không duyệt chi                                                             | `SYSTEM_ADMIN` không có `exceptions:*`, `approvals:*`, `documents:read`     |
| SoD-2 | Ngoại lệ do chủ hợp đồng đề xuất, kiểm soát viên của cùng bên mua duyệt; người đề xuất không tự duyệt              | Kiểm tra vai trò, tổ chức bên mua và người đề xuất trong `exceptions.ts`    |
| SoD-3 | Không vai trò nào sửa trực tiếp quyết định, tiền, trạng thái, audit                                                | Không có quyền ghi CRUD; audit chỉ ghi qua `Repository.transact`, chuỗi băm |
| SoD-4 | Công bố chỉ đưa phiên bản đã kiểm vào danh sách dùng cho hợp đồng mới; ràng buộc khi cả hai bên ký văn bản ghim nó | Hợp đồng ghim phiên bản luật lúc tạo; chữ ký gắn với ảnh điều khoản         |

## 7. Trạng thái

| PR            | Trạng thái            | CI                                                                   |
| ------------- | --------------------- | -------------------------------------------------------------------- |
| #7, #8        | Đã merge              | #8 làm CI `main` đỏ (test cũ, warm-up sập theo RBAC mới)             |
| #9            | Đã merge (5edfb25)    | Xanh: verify và docker; sửa toàn bộ lỗi do #8                        |
| #10           | Đang mở, chưa merge   | Xanh trên bdd2720                                                    |
| Prod (Render) | Vẫn chạy bản trước #7 | Bản build cục bộ từ `main` chạy đúng; cần xem log deploy trên Render |
