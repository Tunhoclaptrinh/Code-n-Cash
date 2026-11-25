# 34. CSDL Contract Smart (bản đã dựng, tham khảo)

> **Nguồn:** `docs/CSDL.md` của repo [Contract Smart](https://github.com/tuananhuhuudu/Contract_Smart) (commit `c3a69be`, 24/11/2026), dự án anh em dựng lại từ CodeCash trên PostgreSQL 17 + TypeORM. Đây là **bản đã cài đặt thật** (khác [31](31_THIET_KE_CSDL_POSTGRES.md) là bản thiết kế cho CodeCash).
>
> Giữ để tham khảo khi CodeCash chuyển sang PostgreSQL hoặc làm thư viện mốc / luật riêng từng hợp đồng. Đường dẫn `apps/api/...`, `pnpm db:seed`, endpoint và tài khoản bên dưới là **của Contract Smart**, không phải của CodeCash. Đã bỏ mật khẩu mặc định khỏi bản chép.
>
> Sơ đồ DBML (dán vào https://dbdiagram.io/d): [CSDL.dbml](diagrams/contract-smart/CSDL.dbml) (19 bảng, sinh từ CSDL đang chạy), [database.dbml](diagrams/contract-smart/database.dbml) (11 bảng nhóm 1–4), [thiet-ke-thu-vien-moc.dbml](diagrams/contract-smart/thiet-ke-thu-vien-moc.dbml) (thiết kế đích thư viện mốc).
>
> **Đáng học cho CodeCash:** trigger chặn sửa / xoá / TRUNCATE sự kiện, kết quả chấm và nhật ký ngay trong CSDL; nhật ký do trigger cấp số thứ tự, giờ và mã băm (app không tự đặt được), `audit_verify()` chỉ ra dòng bị sửa / thiếu; cột chụp lại vai trò người làm lúc thao tác; mốc có phiên bản nên hợp đồng đã ký không đổi theo; luật riêng từng hợp đồng (`is_custom`).

---

## Bản gốc: Đặc tả cơ sở dữ liệu

Cập nhật: 24/11/2026 · PostgreSQL 17 · ORM TypeORM (model trong `apps/api/src/models`, migration trong `apps/api/migrations`).

- **Thiết kế đích (11 bảng):** [thiet-ke-thu-vien-moc.dbml](diagrams/contract-smart/thiet-ke-thu-vien-moc.dbml), dán vào https://dbdiagram.io/d để xem. Trang bấm thử toàn luồng: http://127.0.0.1:3001/test/luong-v2.html (không ghi DB).
- **Đã dựng thật:** nhóm 1–4 (mục 3–6), đủ 11 bảng của thiết kế. Các nhóm sau dựng lần lượt, mỗi nhóm xong thì cập nhật tài liệu này.
- Thiết kế cũ (mã nghiệp vụ `CT0001`, `R_GOODS_STD:DELIVERY`, bảng `rule_scopes`, `contract_type_stages`, `rule_versions`) đã bỏ; xem lịch sử git nếu cần.

## 1. Tổng quan

Luồng: **tạo mốc (điều kiện + luật) → ghép mốc vào loại hợp đồng → tạo hợp đồng (chỉnh riêng nếu cần) → ký → ghi sự kiện → engine chấm.**

| Nhóm | Bảng | Trạng thái |
| --- | --- | --- |
| 1. Danh mục, các bên | `event_types`, `parties`, `users` | ✅ Đã dựng |
| 2. Thư viện mốc | `milestone_library`, `milestone_versions`, `payment_rules` | ✅ Đã dựng (chưa nạp dữ liệu) |
| 3. Loại hợp đồng | `contract_types`, `contract_type_milestones` | ✅ Đã dựng (chưa nạp dữ liệu) |
| 4. Hợp đồng | `contracts`, `milestones`, `events` | ✅ Đã dựng (chưa nạp dữ liệu) |
| 5. Chấm, chi tiền, nhật ký | `milestone_evaluations` | ✅ Đã dựng, engine đã nối |
|  | `payments` | ✅ Đã dựng: lệnh chi, duyệt tài chính |
|  | `audit_log` | ✅ Đã dựng: nhật ký kiểm toán chuỗi băm |

## 2. Quy ước chung

- **Khóa chính là `id` do máy sinh** (`SERIAL`; riêng `users.id` là `uuid`). Người dùng chỉ nhập tên. Bảng nối với nhau bằng `id`.
- **Cột chung** (kế thừa `BaseModel`, `src/models/base.model.ts`): `version` (tăng 1 mỗi lần sửa), `created_at`, `updated_at`.
- **Khóa lạc quan:** API sửa phải gửi `version` đang thấy; lệch thì **409** `VERSION_CONFLICT`.
- **Tiền** dùng `numeric`, đơn vị **triệu VND**, hậu tố `_vnd_mn` (`1000.00` = 1 tỷ đồng); đọc ra là chuỗi, không dùng số thực.
- **Giá trị liệt kê** dùng `text` + `CHECK`. **Danh sách id** dùng mảng `integer[]` (API kiểm từng id có thật).
- Mọi bảng và cột có comment tiếng Việt (DBeaver: nháy đúp bảng → tab Columns).

## 3. Nhóm 1: danh mục, các bên, người dùng

### 3.1 `event_types`: Loại sự kiện

Các nút bấm để ghi sự kiện. Engine **chỉ đọc nhóm** (`category`), không đọc tên, nên thêm loại mới không cần sửa code. Migration nạp sẵn 16 loại (id 1–16).

| Cột | Kiểu | Bắt buộc | Mặc định | Khóa | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | integer | ✓ | tự sinh | PK | Mã loại sự kiện. |
| `name` | text | ✓ |  | UNIQUE | Tên trên nút, ví dụ Giao hàng. |
| `category` | text | ✓ |  |  | EVIDENCE (chứng từ), APPROVAL, REJECTION, DISPUTE_OPEN, DISPUTE_RESOLVE, OTHER. |
| `actor_side` | text |  |  |  | Với chứng từ: BUYER hoặc SUPPLIER ghi; NULL với nhóm khác. |
| `valid_status` | text | ✓ |  |  | Trạng thái API tự điền cho sự kiện loại này (CONFIRMED, APPROVED, REJECTED, OPEN, RESOLVED). |
| `active` | boolean | ✓ | true |  | FALSE: ẩn khỏi danh sách chọn. |

| Nhóm | Bên ghi | Loại (id) |
| --- | --- | --- |
| EVIDENCE | BUYER | Ký hợp đồng (1), Xác nhận khởi động (2), Duyệt yêu cầu (3), Đạt kiểm thử UAT (4), Nghiệm thu (5) |
| EVIDENCE | SUPPLIER | Giao hàng (6), Hóa đơn (7), Đưa vào vận hành (8), Kích hoạt dịch vụ (9), Hoàn thành dịch vụ (10), Hết bảo hành (11) |
| APPROVAL · REJECTION | | Phê duyệt (12) · Từ chối (13) |
| DISPUTE_OPEN · DISPUTE_RESOLVE | | Mở tranh chấp (14) · Đóng tranh chấp (15) |
| OTHER | | Đề nghị đóng hợp đồng (16) |

**Ràng buộc:** tên không rỗng, không trùng; có `actor_side` **khi và chỉ khi** là EVIDENCE; `category`, `valid_status` nằm trong danh sách. **API:** thêm loại mới thì `valid_status` tự suy từ nhóm; không xóa được, chỉ tắt.

### 3.2 `parties`: Các bên

Bên mua, nhà cung cấp, người phê duyệt của bên mua. Là **công ty / vai trò trong hợp đồng**, không phải tài khoản đăng nhập.

| Cột | Kiểu | Bắt buộc | Mặc định | Khóa | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | integer | ✓ | tự sinh | PK | Mã bên. |
| `name` | text | ✓ |  | UNIQUE | Tên, ví dụ Nova An Business JSC. |
| `type` | text | ✓ |  |  | BUYER, SUPPLIER, APPROVER. |
| `parent_id` | integer |  |  | FK → `parties.id` | Bên mua mà người phê duyệt thuộc về. |
| `approval_role` | text |  |  |  | CONTRACT_OWNER, FINANCE_APPROVER, SECONDARY_APPROVER (chỉ người phê duyệt). |
| `approval_limit_vnd_mn` | numeric(18,2) |  |  |  | Hạn mức được duyệt (chỉ người phê duyệt). |
| `allowed_event_type_ids` | integer[] | ✓ | `{}` |  | Loại sự kiện bên này được ghi; engine dùng để phát hiện chứng từ sai thẩm quyền. |
| `active` | boolean | ✓ | true |  | FALSE: không chọn được cho hợp đồng mới. |

**Ràng buộc:** người phê duyệt **phải** có `parent_id` và `approval_role`, bên mua / nhà cung cấp **không** có; hạn mức chỉ với người phê duyệt và ≥ 0; tên không trùng.

### 3.3 `users`: Người dùng

| Cột | Kiểu | Bắt buộc | Mặc định | Khóa | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ✓ | gen_random_uuid() | PK | Mã người dùng. |
| `email` | text | ✓ |  | UNIQUE | Email đăng nhập, chữ thường. |
| `password_hash` | text | ✓ |  |  | Mật khẩu đã băm; API không bao giờ trả cột này. |
| `full_name` | text | ✓ |  |  | Họ tên. |
| `role` | text | ✓ |  |  | CONTRACT_OWNER, LEGAL_REVIEWER, FINANCE_APPROVER, SECONDARY_APPROVER, ADMIN_AUDITOR, SUPPLIER, ORG_ADMIN (quản trị công ty), SYSTEM_ADMIN, AUDITOR. |
| `party_id` | integer |  |  | FK → `parties.id` | Bên mà người dùng làm việc cho; NULL với SYSTEM_ADMIN, AUDITOR. |
| `active` | boolean | ✓ | true |  | FALSE: khóa tài khoản. |
| `created_by` | uuid |  |  | FK → `users.id` | Ai tạo tài khoản; NULL với tài khoản nạp sẵn. |

**Ràng buộc:** SYSTEM_ADMIN, AUDITOR **không** có bên, các vai trò khác **bắt buộc** có; email viết thường, đúng dạng, không trùng.

**Đăng nhập:** `POST /auth/login` trả JWT (8 giờ); mọi API khác cần `Authorization: Bearer <token>` (trên Swagger: nút **Authorize**). Mỗi lần gọi, API đọc lại người dùng từ DB, nên khóa tài khoản hay đổi vai trò có hiệu lực ngay. Không có tự đăng ký: tài khoản do quản trị tạo (bên dưới). Ai cũng tự đổi mật khẩu được (`POST /auth/change-password`). Công ty bị khóa thì nhân viên của nó không đăng nhập được.

**Phân quyền** (kiểm ở API: `@Roles` trên từng endpoint và `src/core/security/access.ts`):

| Việc | Ai được làm |
| --- | --- |
| Xem | Mọi người đã đăng nhập. Hợp đồng, mốc, sự kiện: chỉ của **tổ chức mình** (bên mua / nhà cung cấp; người duyệt thuộc bên mua); `SYSTEM_ADMIN`, `AUDITOR` xem hết |
| Dựng quy trình: loại sự kiện, thư viện mốc (phiên bản chung, luật), loại hợp đồng | `SYSTEM_ADMIN` |
| Tạo hợp đồng (bên mua phải là tổ chức mình), sửa khi DRAFT, thêm / bỏ mốc, luật riêng | `CONTRACT_OWNER`, `LEGAL_REVIEWER` của bên mua |
| Ký / kích hoạt | `CONTRACT_OWNER` của bên mua |
| Ghi sự kiện | `SUPPLIER`, `LEGAL_REVIEWER`, `CONTRACT_OWNER`, `FINANCE_APPROVER`, `SECONDARY_APPROVER` thuộc một bên của hợp đồng; **bên ghi lấy từ người đăng nhập** (`party_id`), `recorded_by` = người đó |
| Mở công ty (bên mua / nhà cung cấp) kèm quản trị công ty đầu tiên; khóa / mở khóa công ty | `SYSTEM_ADMIN` |
| Tạo tài khoản nền tảng (`SYSTEM_ADMIN`, `AUDITOR`), thêm quản trị cho một công ty | `SYSTEM_ADMIN` |
| Tạo, đổi vai, khóa, đặt lại mật khẩu **nhân viên công ty mình** | `ORG_ADMIN` (quản trị công ty); bên mua cấp được pháp lý, chủ hợp đồng, duyệt tài chính, duyệt thứ hai, kiểm soát, quản trị công ty; nhà cung cấp cấp được nhà cung cấp, kiểm soát, quản trị công ty. Không tự đổi vai hay tự khóa mình. Không tham gia nghiệp vụ hợp đồng |
| Duyệt chi | `FINANCE_APPROVER` của bên mua |
| Đổi mật khẩu của mình | Mọi người |

**Tài khoản demo** (nạp bởi `pnpm db:seed`):

| Email | Vai trò | Bên |
| --- | --- | --- |
| admin@contract-smart.vn | SYSTEM_ADMIN | — |
| auditor@contract-smart.vn | AUDITOR | — |
| legal@novaan.vn | LEGAL_REVIEWER | Nova An Business JSC (bên mua) |
| owner@novaan.vn | CONTRACT_OWNER | Contract Owner - Nova An Business JSC |
| finance@novaan.vn | FINANCE_APPROVER | Finance Approver - Nova An Business JSC |
| secondary@novaan.vn | SECONDARY_APPROVER | Secondary Approver - Nova An Business JSC |
| controller@novaan.vn | ADMIN_AUDITOR | Nova An Business JSC |
| supplier@phuminh.vn | SUPPLIER | Phú Minh Technology JSC (nhà cung cấp) |
| controller@phuminh.vn | ADMIN_AUDITOR | Phú Minh Technology JSC |
| admin@novaan.vn | ORG_ADMIN | Nova An Business JSC |
| admin@phuminh.vn | ORG_ADMIN | Phú Minh Technology JSC |

## 4. Nhóm 2: thư viện mốc

Mốc thanh toán được tạo **một lần** trong thư viện rồi dùng lại cho nhiều loại hợp đồng. Mốc chỉ có tên; **điều kiện và luật nằm ở phiên bản**. Sửa thì tạo phiên bản mới, nên hợp đồng đã ký (trỏ tới phiên bản cũ) không bị đổi theo.

```
milestone_library (Giao hàng) ──< milestone_versions (v1 RETIRED, v2 PUBLISHED, v3 DRAFT) ──< payment_rules (8 luật / phiên bản)
```

### 4.1 `milestone_library`: Thư viện mốc

| Cột | Kiểu | Bắt buộc | Mặc định | Khóa | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | integer | ✓ | tự sinh | PK | Mã mốc. |
| `name` | text | ✓ |  | UNIQUE | Tên mốc, ví dụ Nộp báo cáo. |
| `active` | boolean | ✓ | true |  | FALSE: không chọn được cho loại hợp đồng mới. |

### 4.2 `milestone_versions`: Phiên bản mốc

| Cột | Kiểu | Bắt buộc | Mặc định | Khóa | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | integer | ✓ | tự sinh | PK | Mã phiên bản. |
| `milestone_id` | integer | ✓ |  | FK → `milestone_library.id` | Phiên bản của mốc nào. |
| `is_custom` | boolean | ✓ | false |  | FALSE: phiên bản chung (thư viện); TRUE: luật riêng của một hợp đồng (tìm hợp đồng qua `milestones`). |
| `version_no` | integer | ✓ |  |  | 1, 2, 3... |
| `status` | text | ✓ | DRAFT |  | DRAFT → PUBLISHED → RETIRED. |
| `required_event_type_ids` | integer[] | ✓ | `{}` |  | Sự kiện bắt buộc (chỉ loại chứng từ đang bật); đủ mới được trả tiền. |
| `late_penalty` | boolean | ✓ | false |  | Trễ hạn có bị phạt không. |
| `note` | text |  |  |  | Lần sửa này đổi gì. |
| `published_at` | timestamptz |  |  |  | Lúc công bố; có khi và chỉ khi không còn là DRAFT. |

**Ràng buộc:** số phiên bản chung không trùng trong một mốc; mỗi mốc **chỉ một** phiên bản chung PUBLISHED (luật riêng không tính); trigger `milestone_versions_guard`: chỉ đi DRAFT → PUBLISHED → RETIRED, phiên bản không còn là nháp thì **không sửa nội dung, không xóa** được.

### 4.3 `payment_rules`: Luật

| Cột | Kiểu | Bắt buộc | Mặc định | Khóa | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | integer | ✓ | tự sinh | PK | Mã luật. |
| `milestone_version_id` | integer | ✓ |  | FK → `milestone_versions.id` | Luật của phiên bản nào (xóa phiên bản nháp thì luật xóa theo). |
| `priority` | integer | ✓ |  |  | Thứ tự xét, số nhỏ xét trước; không trùng trong một phiên bản. |
| `name` | text | ✓ |  |  | Tên luật tiếng Việt. |
| `condition` | text | ✓ |  |  | Điều kiện cho engine, ví dụ `open_dispute == TRUE`; luật cuối là `ELSE`. |
| `decision` | text | ✓ |  |  | RELEASE, HOLD, REJECT, PENALTY. |
| `reason_code` | text | ✓ |  |  | 1 trong 8 lý do engine biết (CHECK). |
| `payable_formula` | text | ✓ | `0` |  | Công thức tiền được trả. |
| `penalty_formula` | text | ✓ | `0` |  | Công thức tiền phạt. |

**Ràng buộc:** trigger `payment_rules_guard`: chỉ thêm / sửa / xóa luật khi phiên bản còn DRAFT.

### 4.4 API kiểm thêm

| API | Kiểm |
| --- | --- |
| `POST /milestone-library` | Tạo mốc kèm nháp v1, trống hoặc chép từ phiên bản đang dùng của mốc khác (`copyFromMilestoneId`). |
| `POST /milestone-library/:id/versions` | Tạo nháp mới chép từ phiên bản đang dùng; đã có nháp thì 409 `DRAFT_EXISTS`. |
| `PATCH /milestone-versions/:id` | Chỉ nháp; sự kiện bắt buộc phải là loại **chứng từ đang bật**. |
| `POST /milestone-versions/:id/publish` | Phải có sự kiện bắt buộc, có luật, luật cuối là `ELSE`; phiên bản đang dùng chuyển RETIRED. Luật riêng của hợp đồng không công bố ở đây (khóa khi kích hoạt hợp đồng). |
| Thêm / sửa luật | Điều kiện và công thức chỉ được dùng **biến engine biết** (`src/utils/rule-language.ts`); biến lạ → 400. |

## 5. Nhóm 3: loại hợp đồng

Loại hợp đồng **ghép các mốc từ thư viện**, mỗi mốc kèm % giá trị và hạn. Tạo hợp đồng thì máy đổi khuôn này thành mốc thật (tiền, ngày); sửa khuôn sau đó không ảnh hưởng hợp đồng đã tạo.

```
contract_types (Tư vấn) ──< contract_type_milestones (Ký hợp đồng 30% +0 ngày · Nghiệm thu 70% +60 ngày) >── milestone_library
```

### 5.1 `contract_types`: Loại hợp đồng

| Cột | Kiểu | Bắt buộc | Mặc định | Khóa | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | integer | ✓ | tự sinh | PK | Mã loại. |
| `name` | text | ✓ |  | UNIQUE | Tên, ví dụ Tư vấn. |
| `active` | boolean | ✓ | true |  | FALSE: không tạo được hợp đồng mới loại này. |

### 5.2 `contract_type_milestones`: Khuôn mốc

| Cột | Kiểu | Bắt buộc | Mặc định | Khóa | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | integer | ✓ | tự sinh | PK | Mã dòng khuôn. |
| `contract_type_id` | integer | ✓ |  | FK → `contract_types.id` | Loại hợp đồng (xóa loại thì khuôn xóa theo). |
| `position` | integer | ✓ |  |  | Thứ tự 1, 2, 3; API tự xếp theo hạn. |
| `milestone_id` | integer | ✓ |  | FK → `milestone_library.id` | Mốc trong thư viện. |
| `payment_percent` | numeric(5,2) | ✓ |  |  | % giá trị hợp đồng, > 0 và ≤ 100. |
| `due_after_days` | integer | ✓ |  |  | Hạn = ngày bắt đầu + số ngày, ≥ 0. |

**Ràng buộc:** thứ tự không trùng, một mốc chỉ xuất hiện một lần trong một loại. **API kiểm thêm:** chỉ ghép được mốc **đang bật và đã có phiên bản công bố**; tổng % **không vượt 100** (đủ 100 mới tạo được hợp đồng: `GET /contract-types/:id` trả `totalPercent`, `complete`); thêm / sửa / bỏ mốc thì tự đánh lại thứ tự theo hạn.

## 6. Nhóm 4: hợp đồng, mốc thật, sự kiện

```
contracts ──< milestones ──> milestone_versions (luật chung, hoặc luật riêng is_custom)
                  └──< events ──> event_types, parties
```

**Vòng đời hợp đồng:** DRAFT (đang đàm phán, chỉnh riêng được) → ACTIVE (đã ký: khóa, ghi sự kiện) → CLOSED.

### 6.1 `contracts`: Hợp đồng

| Cột | Kiểu | Bắt buộc | Mặc định | Khóa | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | integer | ✓ | tự sinh | PK | Mã hợp đồng. |
| `title` | text | ✓ |  |  | Tên hợp đồng. |
| `contract_type_id` | integer | ✓ |  | FK → `contract_types.id` | Loại dùng làm khuôn lúc tạo. |
| `buyer_id`, `supplier_id` | integer | ✓ |  | FK → `parties.id` | Bên mua, nhà cung cấp (khác nhau). |
| `value_vnd_mn` | numeric(18,2) | ✓ |  |  | Giá trị (triệu VND), > 0. |
| `start_on`, `end_on` | date | ✓ |  |  | Bắt đầu ≤ kết thúc. |
| `approval_policy` | text | ✓ |  |  | AUTO_IF_ALL_CONDITIONS, SINGLE_BUYER_APPROVAL, DUAL_APPROVAL, FINANCE_PLUS_OWNER. |
| `grace_days` | integer | ✓ |  |  | Số ngày ân hạn. |
| `penalty_pct_per_day`, `max_penalty_pct` | numeric(7,4) | ✓ |  |  | Phạt mỗi ngày, trần phạt (% tiền mốc). |
| `status` | text | ✓ | DRAFT |  | DRAFT → ACTIVE → CLOSED. |

**Trigger `contracts_guard`:** chỉ đi DRAFT → ACTIVE → CLOSED; hết DRAFT thì điều khoản không đổi được, không xóa được.

### 6.2 `milestones`: Mốc thật

| Cột | Kiểu | Bắt buộc | Mặc định | Khóa | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | integer | ✓ | tự sinh | PK | Mã mốc. |
| `contract_id` | integer | ✓ |  | FK → `contracts.id` | Thuộc hợp đồng nào. |
| `position` | integer | ✓ |  |  | Thứ tự 1, 2, 3 (API tự xếp theo hạn); không trùng trong hợp đồng. |
| `milestone_version_id` | integer | ✓ |  | FK → `milestone_versions.id` | Luật dùng để chấm; tên mốc lấy qua đây. |
| `amount_vnd_mn` | numeric(18,2) | ✓ |  |  | Tiền của mốc = % × giá trị; % hiển thị = tiền ÷ giá trị. |
| `due_on` | date | ✓ |  |  | Hạn. |

**Trigger `milestones_guard`:** chỉ thêm / sửa / xóa khi hợp đồng còn DRAFT.

### 6.3 `events`: Sự kiện

| Cột | Kiểu | Bắt buộc | Mặc định | Khóa | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | integer | ✓ | tự sinh | PK | Mã sự kiện. |
| `milestone_id` | integer | ✓ |  | FK → `milestones.id` | Xảy ra ở mốc nào. |
| `event_type_id` | integer | ✓ |  | FK → `event_types.id` | Loại sự kiện. |
| `status` | text | ✓ |  |  | API tự điền theo `event_types.valid_status`. |
| `party_id` | integer | ✓ |  | FK → `parties.id` | Bên thực hiện (bên mua, người duyệt của bên mua, hoặc nhà cung cấp của hợp đồng). |
| `recorded_by` | uuid |  |  | FK → `users.id` | Người bấm nút (NULL khi chưa có đăng nhập). |
| `happened_at` | timestamp | ✓ |  |  | Lúc xảy ra, giờ Việt Nam không múi giờ; bỏ trống = bây giờ. |
| `document_no` | text |  |  |  | Số giấy tờ; engine phát hiện nộp trùng. |
| `resolves_event_id` | integer |  |  | FK → `events.id` | Chỉ với Đóng tranh chấp: đóng tranh chấp nào. |
| `note` | text | ✓ | '' |  | Ghi chú. |
| `created_at` | timestamptz | ✓ | now() |  | Lúc lưu. |

**Trigger `events_guard`, `events_no_truncate`:** chỉ thêm (không sửa, không xóa, không TRUNCATE); chỉ ghi được khi hợp đồng ACTIVE.

### 6.4 API kiểm thêm

| API | Kiểm |
| --- | --- |
| `POST /contracts` | Loại hợp đồng đang bật, khuôn đủ 100%, mọi mốc đã công bố; bên mua / nhà cung cấp đúng loại và đang bật; sinh mốc: tiền = % × giá trị (lẻ dồn mốc cuối), hạn = bắt đầu + số ngày. |
| `PATCH /contracts/:id` | Chỉ DRAFT; đổi giá trị thì chia lại tiền theo tỷ lệ; đổi ngày bắt đầu thì dời mọi hạn cùng số ngày. |
| `POST /contracts/:id/milestones`, `PATCH`/`DELETE /milestones/:id` | Chỉ DRAFT; thêm mốc từ thư viện (đã công bố, chưa có trong hợp đồng); nhập %, lưu tiền; tự xếp lại thứ tự. |
| `POST`/`DELETE /milestones/:id/custom-rules` | Chỉ DRAFT; chép luật đang dùng thành bản nháp riêng (`is_custom`), sửa qua `/milestone-versions`; bỏ thì quay về luật chung và xóa bản riêng. |
| `POST /contracts/:id/activate` | Có mốc, tổng tiền = giá trị, các bên hợp lệ, luật riêng đủ (có sự kiện bắt buộc, có luật, luật cuối ELSE); khóa luật riêng cùng lúc với hợp đồng. |
| `POST /events` | Hợp đồng ACTIVE; loại sự kiện đang bật; bên thuộc hợp đồng; Đóng tranh chấp phải trỏ tới Mở tranh chấp **cùng mốc**, không sớm hơn lúc mở, chưa bị đóng; trường này chỉ dùng cho Đóng tranh chấp. Bên ghi sai loại chứng từ **không bị chặn** (engine đánh dấu sai thẩm quyền). |

## 6b. Nhóm 5: engine chấm

### 6b.1 `milestone_evaluations`: Kết quả chấm

Mỗi lần engine chấm một mốc thêm **một dòng**; dòng mới nhất là kết quả hiện tại, các dòng cũ là lịch sử. Chỉ thêm (trigger `milestone_evaluations_append_only`, `milestone_evaluations_no_truncate`).

| Cột | Kiểu | Bắt buộc | Khóa | Ý nghĩa |
| --- | --- | --- | --- | --- |
| `id` | integer | ✓ | PK | Mã lần chấm. |
| `milestone_id` | integer | ✓ | FK → `milestones.id` | Mốc được chấm. |
| `trigger_event_id` | integer |  | FK → `events.id` | Sự kiện làm engine chấm lại; NULL khi chấm lúc kích hoạt / bấm Chấm lại. |
| `rule_id` | integer |  | FK → `payment_rules.id` | Luật quyết định (luật đầu tiên khớp). |
| `decision` | text | ✓ |  | RELEASE / HOLD / REJECT / PENALTY. |
| `reason_code` | text | ✓ |  | Mã lý do của luật quyết định. |
| `milestone_status` | text | ✓ |  | Trạng thái mốc sau khi chấm (WAITING_EVIDENCE, ON_HOLD, ELIGIBLE_FOR_PAYMENT...). |
| `payable_vnd_mn`, `penalty_vnd_mn` | numeric(18,2) | ✓ |  | Tiền trả, tiền phạt (triệu VND). |
| `facts` | jsonb | ✓ |  | Vì sao: các con số engine tính, kết quả thử từng luật, sự kiện thiếu / sai thẩm quyền / trùng, tranh chấp mở, cảnh báo. |
| `evaluated_at` | timestamptz | ✓ |  | Lúc chấm. |

### 6b.2 Engine chạy khi nào

| Lúc | Chấm gì |
| --- | --- |
| `POST /contracts/:id/activate` | Mọi mốc của hợp đồng. |
| `POST /events` | Mốc của sự kiện vừa ghi (`trigger_event_id` = sự kiện đó). Engine lỗi thì sự kiện vẫn lưu, lỗi được ghi log. |
| `POST /milestones/:id/evaluate`, `POST /contracts/:id/evaluate` | Chấm lại bằng tay (hợp đồng phải ACTIVE). |
| `pnpm db:seed` | Chấm hợp đồng mẫu 1 sau khi nạp. |

Cách chạy: API (`src/services/engine.service.ts`) đọc các bảng, đổi sang dạng hàng của Data Pack BTC, gọi `python3 apps/engine/run_json.py` (JSON vào stdin, JSON ra stdout) rồi lưu kết quả. Logic chấm là gói `codecash_engine` chép nguyên từ dự án cũ; trên CT0019 cho kết quả giống hệt engine cũ (3 mốc RELEASE, Nghiệm thu HOLD vì tranh chấp). Biến môi trường tùy chọn: `PYTHON` (mặc định `python3`), `ENGINE_DIR` (mặc định `../engine`).

`GET /milestones/:id/evaluations` trả `{ rules, evaluations }`: lịch sử chấm (mới nhất trước) và bộ luật mốc đang dùng để đọc kết quả theo tên luật. Ai xem được hợp đồng thì xem được.

### 6b.3 `payments`: Lệnh chi

Hệ thống tự lập khi engine cho trả (RELEASE / PENALTY); chỉ **duyệt tài chính của bên mua** duyệt được; duyệt thì gửi cổng thanh toán (bản demo: mô phỏng, luôn nhận) và mốc thành đã chi.

| Cột | Kiểu | Bắt buộc | Khóa | Ý nghĩa |
| --- | --- | --- | --- | --- |
| `id` | integer | ✓ | PK | Mã lệnh chi. |
| `milestone_id` | integer | ✓ | FK → `milestones.id` | Mốc được chi. Mỗi mốc có tối đa **một** lệnh chưa hủy (index duy nhất có điều kiện). |
| `evaluation_id` | integer | ✓ | FK → `milestone_evaluations.id` | Lần chấm làm căn cứ chi. |
| `amount_vnd_mn` | numeric(18,2) | ✓ |  | Tiền chi (> 0), đã trừ phạt. |
| `penalty_vnd_mn` | numeric(18,2) | ✓ |  | Tiền phạt đã trừ. |
| `status` | text | ✓ | 'PENDING' |  | `PENDING` chờ duyệt chi, `PAID` đã chi, `CANCELLED` đã hủy. |
| `approved_by` | uuid |  | FK → `users.id` | Người duyệt tài chính đã duyệt. |
| `paid_at` | timestamptz |  |  | Lúc duyệt và gửi cổng. |
| `gateway_ref` | text |  |  | Mã giao dịch cổng trả về (`SIM-...`). |
| `note` | text | ✓ |  | Ví dụ lý do hủy. |
| `version`, `created_at`, `updated_at` |  | ✓ |  | Như mọi bảng. |

**Trigger `payments_guard`, `payments_no_truncate`:** không xóa, không TRUNCATE; chỉ đi `PENDING → PAID` hoặc `PENDING → CANCELLED`; đã chi hoặc đã hủy thì không sửa; mốc, lần chấm và số tiền không đổi được. CHECK: `PAID` thì phải có người duyệt, lúc chi và mã giao dịch.

**Luồng:**

| Lúc | Việc |
| --- | --- |
| Sau mỗi lần engine chấm | Cho trả mà chưa có lệnh → lập lệnh `PENDING`. Cho trả đúng số tiền của lệnh đang chờ → giữ nguyên. Không còn cho trả hoặc số tiền khác → hủy lệnh đang chờ (ghi lý do), cho trả thì lập lệnh mới. |
| `POST /payments/:id/approve` | Chỉ `FINANCE_APPROVER` của bên mua; lệnh phải `PENDING` và khớp lần chấm mới nhất (`PAYMENT_STALE` nếu không); gửi cổng → `PAID`. Mọi mốc đã chi hoặc bị từ chối thì hợp đồng `ACTIVE → CLOSED`. |
| Sau khi chi | Mốc đã chi không nhận thêm sự kiện (`MILESTONE_PAID`), engine không chấm lại mốc đó. |
| `GET /payments` | Lệnh chi của hợp đồng thuộc tổ chức mình (nhà cung cấp cũng xem được); quản trị, kiểm toán thấy hết. |

### 6b.4 `audit_log`: Nhật ký kiểm toán

Ai làm gì, lúc nào, trên cái gì. Mỗi thao tác ghi đúng một (hoặc vài) dòng **trong cùng giao dịch** với thao tác: thao tác thành công thì có dòng, lỗi thì cả hai cùng hủy. Ghi qua `AuditService.record` (`src/services/audit.service.ts`).

| Cột | Kiểu | Bắt buộc | Khóa | Ý nghĩa |
| --- | --- | --- | --- | --- |
| `id` | bigint | ✓ | PK | Số thứ tự trong chuỗi, **trigger cấp**, liên tục từ 1. |
| `occurred_at` | timestamptz | ✓ |  | Lúc ghi, trigger đặt bằng giờ CSDL (không tin giờ app gửi). |
| `actor_id` | uuid |  | FK → `users.id` | Người làm; trống = hệ thống (engine chấm, lập / hủy lệnh chi, đóng hợp đồng). |
| `actor_email`, `actor_role` | text |  |  | Email, vai **lúc làm** (chụp lại; vai có thể đổi sau). |
| `actor_organization_id` | integer |  | FK → `parties.id` | Công ty của người làm lúc đó. |
| `action` | text | ✓ |  | Hành động, xem bảng dưới. |
| `resource`, `resource_id` | text | ✓ |  | Loại và mã đối tượng: `contract 1`, `event 15`, `payment 3`, `user <uuid>`... |
| `contract_id` | integer |  | FK → `contracts.id` | Hợp đồng liên quan, để lọc theo hợp đồng và theo bên. |
| `organization_id` | integer |  | FK → `parties.id` | Công ty mà dòng nói tới (tài khoản, khóa công ty), để quản trị công ty xem. |
| `before`, `after` | jsonb |  |  | Giá trị trước / sau (chỉ các trường đổi). **Không bao giờ** chứa mật khẩu. |
| `reason` | text | ✓ |  | Lý do, ví dụ mã lỗi đăng nhập, lý do hủy lệnh chi. |
| `prev_hash` | char(64) | ✓ |  | Mã băm dòng trước (dòng đầu: 64 số `0`). |
| `hash` | char(64) | ✓ | UNIQUE | SHA-256 của chính dòng này, kể cả `prev_hash`. |

**Hành động được ghi:**

| Nhóm | `action` |
| --- | --- |
| Tài khoản | `LOGIN_FAILED`, `ORG_CREATED`, `ORG_LOCKED`, `ORG_UNLOCKED`, `USER_CREATED`, `USER_UPDATED`, `USER_LOCKED`, `USER_UNLOCKED`, `PASSWORD_RESET`, `PASSWORD_CHANGED` |
| Hợp đồng | `CONTRACT_CREATED`, `CONTRACT_UPDATED`, `CONTRACT_ACTIVATED`, `CONTRACT_CLOSED` |
| Mốc của bản nháp | `MILESTONE_ADDED`, `MILESTONE_UPDATED`, `MILESTONE_REMOVED`, `MILESTONE_CUSTOM_RULES`, `MILESTONE_SHARED_RULES` |
| Sự kiện | `EVENT_RECORDED`, `DISPUTE_OPENED`, `DISPUTE_CLOSED` |
| Engine | `MILESTONE_EVALUATED` |
| Chi tiền | `PAYMENT_OPENED`, `PAYMENT_CANCELLED`, `PAYMENT_APPROVED` |

**Trigger và hàm (viết tay trong migration `AuditLog`):**

| Tên | Việc |
| --- | --- |
| `audit_log_seal` → `seal_audit_entry()` | Trước khi thêm: khóa `pg_advisory_xact_lock` (mỗi lúc một người ghi, nhả khi commit), lấy dòng cuối, cấp `id` = cuối + 1, `prev_hash` = hash dòng cuối, `occurred_at` = giờ CSDL, rồi tính `hash`. App không tự đặt được các cột này. |
| `audit_entry_hash(e)` | `SHA-256` của mảng JSON mọi cột trừ `hash`, theo thứ tự cố định (jsonb tự sắp khóa nên `before`/`after` băm ổn định). |
| `audit_log_guard`, `audit_log_no_truncate` | Chặn `UPDATE`, `DELETE` (`AUDIT_LOCKED`) và `TRUNCATE`. |
| `audit_verify()` | Đi từ dòng 1: số thứ tự phải liên tục (phát hiện **xóa**), `prev_hash` phải khớp dòng trước (phát hiện **chèn / đổi thứ tự**), `hash` phải tính lại đúng (phát hiện **sửa**). Trả dòng hỏng đầu tiên, hoặc mã băm cuối nếu nguyên vẹn. |

Ví dụ đã thử: tắt trigger rồi sửa `after` của dòng 12 → `audit_verify()` báo "entry 12 was changed after it was written"; xóa dòng 5 → "entry 5 is missing". Giới hạn: người có quyền chủ CSDL có thể **viết lại cả chuỗi** từ một dòng trở đi; muốn chặn cả việc đó thì chép `head_hash` ra nơi khác định kỳ (neo) và so lại.

**Ai đọc được (`GET /audit-log`, lọc `contractId`, `action`, `resource`, `actorId`):**

| Vai | Thấy |
| --- | --- |
| `AUDITOR` | Tất cả; thêm `GET /audit-log/verify` kiểm chuỗi |
| `SYSTEM_ADMIN` | Dòng không thuộc hợp đồng nào (công ty, tài khoản, đăng nhập sai) |
| `ADMIN_AUDITOR` | Hợp đồng công ty mình là một bên, mọi việc nhân viên công ty mình làm, dòng về công ty mình |
| `ORG_ADMIN` | Dòng về công ty mình (`organization_id`): tài khoản, đăng nhập sai |
| Vai khác | Lịch sử các hợp đồng công ty mình là một bên |
| Không ai | Sửa, xóa |

## 7. Dữ liệu mẫu

`pnpm db:seed` (trong `apps/api`) đọc `data/datapack/*.csv` của BTC và nạp lại từ đầu (xóa rồi nạp). Mã trong CSV (`B009`, `S021`...) chỉ dùng để nối dòng lúc nạp; DB giữ `id` tự sinh. Hiện nạp: **65 bên** (10 bên mua, 25 nhà cung cấp, 30 người phê duyệt), **9 tài khoản demo**, và **một quy trình mẫu nhỏ**: 4 mốc của loại hàng hóa (32 luật, đã công bố), loại hợp đồng "Cung cấp hàng hóa", hợp đồng CT0019 (Nova An mua của Phú Minh, ACTIVE, 14 sự kiện thật) và một hợp đồng DRAFT để thử. Sau khi nạp, engine chấm hợp đồng 1 và tự lập 3 lệnh chi chờ duyệt. Nhật ký kiểm toán được làm lại từ đầu (seed là thao tác dọn môi trường thử, tắt trigger trong giao dịch), bắt đầu bằng 2 dòng "Nạp dữ liệu mẫu" cho 2 hợp đồng rồi các dòng engine chấm và lập lệnh chi. Quyền `DISPUTE` trong CSV được đổi thành cả Mở tranh chấp và Đóng tranh chấp.

## 8. Migration

| Migration | Nội dung |
| --- | --- |
| `Catalogs` | `event_types` (nạp sẵn 16 loại), `parties`, `users` |
| `MilestoneLibrary` | `milestone_library`, `milestone_versions`, `payment_rules`, trigger khóa phiên bản đã công bố |
| `ContractTypes` | `contract_types`, `contract_type_milestones` |
| `Contracts` | `contracts`, `milestones`, `events`, trigger khóa hợp đồng / mốc và sự kiện chỉ thêm |
| `MilestoneEvaluations` | `milestone_evaluations`, trigger chỉ thêm |
| `Payments` | `payments`, trigger khóa lệnh chi |
| `OrgAdmins` | vai `ORG_ADMIN`, cột `users.created_by` |
| `AuditLog` | `audit_log`, trigger đánh số + chuỗi băm + chặn sửa xóa, hàm `audit_verify()` |

## 9. Lệnh thường dùng

Chạy trong `apps/api`, Postgres đang chạy (`pnpm db:up` ở thư mục gốc).

| Việc | Lệnh |
| --- | --- |
| Sinh migration từ thay đổi trong model | `pnpm db:generate migrations/TenThayDoi` |
| Áp dụng migration | `pnpm db:migrate` |
| Hoàn tác migration gần nhất | `pnpm db:revert` |
| Nạp lại dữ liệu mẫu | `pnpm db:seed` |
| Xem database trên web | Adminer http://127.0.0.1:8080 (PostgreSQL, server `postgres`, database `contract_smart`) |
