# Tài liệu API

API của CodeCash là NestJS, tiền tố `/api/v1`. Mọi nghiệp vụ (ký, nộp chứng từ, phê duyệt, tranh chấp, lệnh chi, ngoại lệ) đi qua API. Trình duyệt chỉ gọi API, không tự quyết định.

## Đọc tài liệu API ở đâu

| Tài liệu | Đường dẫn | Ghi chú |
|---|---|---|
| Swagger UI của API chính | <http://127.0.0.1:3000/api/docs> | Mở khi API đang chạy (`pnpm dev`, xem [README](../README.md) mục "Cài đặt và chạy"). Danh sách đầy đủ endpoint, thử gọi trực tiếp. Bấm **Authorize** và dán token để gọi endpoint cần đăng nhập |
| Đặc tả OpenAPI dạng JSON | <http://127.0.0.1:3000/api/docs-json> | Nhập vào Postman, Insomnia hoặc Swagger Editor |
| Hợp đồng dịch vụ ký số (OpenAPI 3.1) | [`apps/signer/openapi.yaml`](../apps/signer/openapi.yaml) | Dịch vụ ký mô phỏng (cổng 3200). Giải thích ở [10_DICH_VU_KY_SO.md](10_DICH_VU_KY_SO.md) |
| Danh sách hành động nghiệp vụ và quyền | [`apps/api/src/workflow.controller.ts`](../apps/api/src/workflow.controller.ts) (bảng `HANDLERS`) | Mỗi hành động ghi quyền cần có |
| Ma trận quyền theo vai trò | [`packages/contracts/permissions.json`](../packages/contracts/permissions.json) | Nơi duy nhất cấp quyền cho 8 vai trò |
| Kiểu dữ liệu dùng chung | [`packages/contracts/src/`](../packages/contracts/src/) | Kiểu TypeScript của tài nguyên, workflow, nhật ký |

Swagger liệt kê đủ đường dẫn nhưng chưa mô tả chi tiết thân yêu cầu, vì controller không gắn chú thích Swagger. Phần dưới đây bổ sung cách gọi.

## Gọi thử trong 1 phút

```bash
# 1. Đăng nhập (tài khoản mẫu chạy local, mật khẩu ở README mục "Tài khoản demo")
curl -s -X POST http://127.0.0.1:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"finance@novaan.vn","password":"Passw0rd!"}'
# → {"success":true,"data":{"token":"<JWT>","user":{...}},"requestId":"..."}

# 2. Gọi API với token
curl -s http://127.0.0.1:3000/api/v1/auth/me -H "Authorization: Bearer <JWT>"

# 3. Một hành động nghiệp vụ: danh sách việc cần làm của người đang đăng nhập
curl -s -X POST http://127.0.0.1:3000/api/v1/workflow/tasks/listTasks \
  -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" -d '{"args":[]}'
```

Quy ước:

- Token JWT hạn 8 giờ, gửi qua header `Authorization: Bearer`.
- Vai trò, tổ chức và người thực hiện lấy từ token. API bỏ qua mọi vai trò hay mã người dùng do trình duyệt gửi lên.
- Phản hồi thành công có dạng `{ success, data, requestId }`. Lỗi trả mã HTTP kèm mã lỗi, ví dụ `ACTION_FORBIDDEN`, `ACTION_NOT_FOUND`, `INVALID_ARGUMENTS`.

## Các nhóm endpoint

| Nhóm | Đường dẫn (sau `/api/v1`) | Dùng để |
|---|---|---|
| Đăng nhập | `POST auth/login`, `POST auth/demo-login`, `GET auth/demo-accounts`, `GET auth/me`, `POST auth/logout`, `POST auth/reset-demo` | Phiên đăng nhập; khôi phục dữ liệu demo (chỉ quản trị hệ thống) |
| Hành động nghiệp vụ | `POST workflow/:module/:action` với thân `{"args":[...]}` | Toàn bộ thao tác nghiệp vụ, xem bảng module bên dưới |
| Engine và Data Pack | `GET engine/decisions`, `GET engine/benchmark`, `POST engine/evaluate`, `GET/POST engine/datasets`, `POST engine/datasets/:id/evaluate`, `GET engine/datasets/:id/result` | Kết quả 405 mốc, KPI, đánh giá một bộ dữ liệu tải lên |
| Luật và tin cậy | `trust/rules…` (soạn, kiểm, chạy thử, công bố phiên bản luật), `trust/anchors…` (neo Merkle, gói neo, đường kiểm `anchors/proof/:entryId`, kiểm neo), `trust/contracts/:code/signatures` | Phiên bản luật có kiểm soát; kiểm toàn vẹn nhật ký |
| Tài nguyên dạng bảng | `GET resources`, `GET/POST resources/:resource`, `GET/PATCH/DELETE resources/:resource/:id`, nhập và xuất CSV | Danh mục được phép sửa (tài khoản, tổ chức…). Nhật ký và quyết định không sửa qua đây |
| Văn bản và chứng từ | `contract-files/…`, `documents/…`, `evidence-documents/…`, `contract-samples` | Xem trước, tải, nộp tệp hợp đồng và chứng từ |
| Khác | `GET health`, `GET permissions`, `notifications/…`, `signing/callback`, `POST exports` | Kiểm tình trạng, quyền của người dùng, thông báo, webhook ký số, ghi nhận lượt xuất tệp |

## Module của `workflow/:module/:action`

| Module | Hành động |
|---|---|
| `tasks` | `getTaskInbox`, `listTasks`, `getPendingTaskCount` |
| `contracts` | `listContracts`, `getContractOverview`, `getSmartContract`, `getMilestoneDetail`, `getMilestoneTimeline`, `getVerificationBundle` |
| `drafts` | `saveContractDraft`, `getDigitization`, `editDigitizedMilestones`, `confirmDigitization` |
| `signing` | `sendSigningRequest`, `confirmSigningRequest`, `rejectSigningRequest`, `cancelSigning`, `getVerification` |
| `evidence` | `getEvidenceWorkspace` (kèm chạy thử: quyết định nếu nộp), `attachEvidenceFile`, `submitEvidence` |
| `approvals` | `getApprovalView` (kèm chạy thử: quyết định nếu duyệt), `castVote` |
| `disputes` | `openDispute`, `resolveDispute`, `getDispute` |
| `payments` | `transferToAccounting` (duyệt lệnh chi), `retryPaymentDelivery` |
| `exceptions` | `listExceptionQueue`, `proposeException`, `decideException` (ngoại lệ hai người) |
| `amendments`, `liquidation` | `proposeAmendment`, `decideAmendment`; `proposeLiquidation`, `decideLiquidation` |
| `integrity`, `activity`, `dashboard` | `verifyIntegrity`, `listActivity`, `getDashboard` |

Tên chính xác của từng hành động, tham số và quyền cần có: bảng `HANDLERS` trong [`apps/api/src/workflow.controller.ts`](../apps/api/src/workflow.controller.ts). Mỗi hành động ghi sửa đổi được ghi vào nhật ký chuỗi băm, rồi API chạy lại engine trong cùng giao dịch.
