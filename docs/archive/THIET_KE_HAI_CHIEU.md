# Thiết kế: hợp đồng hai chiều và phân công theo mốc

Tài liệu thiết kế cho các định hướng D5, D6, D9, D10 trong `docs/DINH_HUONG_TONG_THE.md`. Đây là **đề xuất**, chưa triển khai. Mục 1 ghi hiện trạng đã kiểm trong code (đường dẫn tính từ gốc repo). Các mục sau là thiết kế và kế hoạch theo giai đoạn.

Ràng buộc giữ nguyên ở mọi giai đoạn:

- Trình duyệt không quyết định nghiệp vụ.
- Danh tính và phạm vi lấy từ phiên đăng nhập.
- Nhật ký audit chỉ ghi qua `Repository.transact`.
- Tiền không dùng số thực.
- Giữ SoD-1.
- **Kết quả trên 405 mốc của Data Pack không đổi.** Golden snapshot và `ra_soat_btc` phải giữ xanh.

## 1. Hiện trạng

| Chủ đề                 | Hiện trạng                                                                                                                                                                                                                                                        | Vị trí trong code                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Ai soạn thảo           | Chỉ `LEGAL_REVIEWER` và `CONTRACT_OWNER` của bên mua soạn được. `assertEditor` từ chối mọi người khác với `BUYER_EDITORS_ONLY`. Khi lưu, hợp đồng nhận `buyer_id` là tổ chức của người soạn. `SUPPLIER` không có quyền `contracts:draft-*` hay `documents:upload` | `apps/api/src/domain/drafts.ts` (`EDITORS`, `assertEditor`, `saveDraft` ghi `buyer_id: buyer`); `packages/contracts/permissions.json` |
| Bên nhìn thấy bản nháp | Bên bán không thấy hợp đồng khi còn `DRAFT`                                                                                                                                                                                                                       | `context.ts` (`canSee`)                                                                                                               |
| "Bên" của người dùng   | Suy ra từ vai trò, không từ vị trí của người đó trong hợp đồng: `SUPPLIER` là bên bán; bốn vai trò `CONTRACT_OWNER`, `FINANCE_APPROVER`, `SECONDARY_APPROVER`, `LEGAL_REVIEWER` là bên mua                                                                        | `context.ts` (`BUYER_ROLES`, `side()`)                                                                                                |
| Quyền ghi sự kiện      | Bộ chính sách quy định loại sự kiện thuộc bên nào, ở mức tổ chức (`actor_party_id`). API chỉ cho một vai trò cố định ghi cho mỗi bên: `SUPPLIER` cho bên bán, `LEGAL_REVIEWER` cho bên mua                                                                        | `apps/engine/policy/case4_btc.json` (`sides`, `event_types`); `context.ts` (`mayRecord`)                                              |
| Phân công theo mốc     | Không có. Mốc chỉ ghi loại chứng từ và vai trò phê duyệt (`required_event_types`, `required_approval_roles`). Chỉ người ký được gán theo từng người (`SignStep.signerUserId`)                                                                                     | `records.ts` (cột `milestones`); `drafts.ts` (`validateDraftSigners`); `signing.ts` (`assertSigner`)                                  |
| Phê duyệt              | Người phê duyệt là các bên `APPROVER` con của bên mua, mỗi bên một tài khoản. Bên bán không có người phê duyệt                                                                                                                                                    | `records.ts` (`APPROVAL_ROLES_BY_POLICY`); `actions/approvals.ts`                                                                     |
| Vai trò bên bán        | Chỉ một vai trò `SUPPLIER`, vừa ký, vừa nộp chứng từ, vừa mở tranh chấp. Không tách đại diện pháp lý với người thực hiện                                                                                                                                          | `accounts.ts`                                                                                                                         |
| Ngoại lệ               | Chỉ `CONTRACT_OWNER` (bên mua) đề xuất, và chỉ đề xuất huỷ sự kiện engine đã gắn cờ. Kiểm soát viên bên mua quyết định, theo quy tắc hai người. Kiểm soát viên bên bán chỉ theo dõi (`BUYER_ONLY`). Không có loại ghi nhận "bên mua vi phạm"                      | `actions/exceptions.ts`; `views/milestones.ts` (`voidCandidates`)                                                                     |

## 2. Mô hình đề xuất

### 2.1. Vai trò trong hợp đồng thay cho vai trò cố định

Thêm bảng **`contract-members`**. Mỗi dòng là một người trong một hợp đồng:

| Trường                         | Ý nghĩa                                                                                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contractId`, `userId`, `side` | Người đó thuộc bên `BUYER` hay `SUPPLIER` **của hợp đồng này**                                                                                                                                        |
| `duty`                         | Một trong các nhiệm vụ: `REPRESENTATIVE` (đại diện pháp lý, ký), `EXECUTOR` (ghi sự kiện), `APPROVER` (phê duyệt chi, chỉ bên trả tiền), `CONTROLLER` (kiểm soát viên của bên), `DRAFTER` (soạn thảo) |
| `milestones`                   | Danh sách mốc người đó phụ trách, rỗng là mọi mốc                                                                                                                                                     |
| `eventTypes`                   | Các loại sự kiện người đó được ghi, là tập con của các loại thuộc bên mình trong bộ chính sách                                                                                                        |
| `addedBy`, `confirmedBy`       | Bên soạn đề xuất thành viên; mỗi bên tự xác nhận người của mình trước khi ký                                                                                                                          |

`ctx.side()` đổi thành `ctx.sideIn(contractId)`, đọc từ `contract-members`. Vai trò hệ thống (`permissions.json`) chỉ còn là trần quyền. Quyền cụ thể trên một hợp đồng lấy từ thành viên. Với hợp đồng Data Pack và hợp đồng mẫu, lúc nhập sẽ sinh thành viên từ các tài khoản hiện có, theo đúng ánh xạ vai trò đang dùng, nên hành vi không đổi.

### 2.2. Bên soạn thảo (D5)

- Hợp đồng ghi thêm `drafter_side` (`BUYER` hoặc `SUPPLIER`). `buyer_id` và `supplier_id` lấy từ lựa chọn trên form; tổ chức của người soạn phải là một trong hai bên.
- `assertEditor` kiểm tra thành viên `DRAFTER` của bên soạn thay cho vai trò cố định. Bên còn lại được xem bản nháp ở chế độ chỉ đọc, kể từ khi bên soạn "gửi đối tác rà soát", và xác nhận người của mình (2.1).
- Chỉ khoá điều khoản khi **cả hai bên** đã xác nhận: thêm trạng thái `REVIEW_BY_COUNTERPARTY` giữa `DRAFT` và `SIGNING`.
- Phương thức phê duyệt chi luôn gắn với **bên trả tiền** (bên mua), bất kể ai soạn. Engine không đổi.

### 2.3. Phân công theo mốc (D6)

- `mayRecord(type)` trở thành `mayRecord(type, milestone)`. Người dùng phải là thành viên `EXECUTOR` của đúng bên, có `type` trong `eventTypes`, và phụ trách mốc đó.
- Bộ chính sách giữ kiểm tra ở mức tổ chức (`actor_party_id`). Lớp phân công nằm ở API, nên engine và Data Pack không đổi. Sự kiện vẫn được ghi dưới tên tổ chức; người ghi lưu ở `recordedByUserId` và trong chữ ký chứng từ (đã có, mục 9.4 của `NGHIEP_VU.md`).
- Việc cần làm (`isMine`) và màn nộp chứng từ chỉ hiện các mốc và loại sự kiện được giao cho người đó.

### 2.4. Đại diện pháp lý và người thực hiện (D9)

- Bên bán có thêm các tài khoản tách theo nhiệm vụ trong dữ liệu mẫu, ví dụ đại diện ký, người giao hàng, kế toán xuất hoá đơn. Không cần vai trò hệ thống mới: các tài khoản này dùng một vai trò bên bán chung, còn nhiệm vụ cụ thể lấy từ `contract-members`.
- Người ký (`SignStep`) phải là thành viên `REPRESENTATIVE`. Người ghi sự kiện phải là `EXECUTOR`. Kiểm tra tách nhiệm vụ là: một người không vừa là `APPROVER` vừa là `EXECUTOR` trên cùng một mốc.

### 2.5. Kiểm soát hai phía và vi phạm của bên mua (D10)

- **Ngoại lệ theo bên.** Mỗi ngoại lệ được xử lý trong bên của nó: kiểm soát viên bên bán đề xuất và quyết định ngoại lệ trên sự kiện của bên bán, theo quy tắc hai người trong cùng bên. Kiểm soát viên bên mua làm điều tương tự với sự kiện bên mua. Huỷ một sự kiện vẫn theo BR-19 (`voided_events`).
- **Ghi nhận vi phạm của bên mua.** Thêm loại sự kiện `BUYER_BREACH` (chậm thanh toán, chậm nghiệm thu) do bên bán ghi, có chứng từ đã ký. Ban đầu chỉ là hồ sơ và cảnh báo: không đổi quyết định chi, nên Data Pack không đổi. Muốn sự kiện này có hệ quả tiền (lãi chậm trả), cần một luật mới trong bộ chính sách, có phiên bản và chứng minh an toàn như mọi luật khác.

## 3. Kế hoạch theo giai đoạn

| Giai đoạn                                 | Nội dung                                                                                                                                                                   | Thay đổi dữ liệu                                                      | Kiểm thử bắt buộc                                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| G1. Thành viên hợp đồng                   | Thêm bảng `contract-members`; sinh thành viên cho hợp đồng nhập và hợp đồng mẫu từ ánh xạ hiện tại; `side()` và `mayRecord()` đọc qua lớp mới nhưng kết quả y hệt hiện tại | Bảng mới, nằm trong manifest neo audit                                | Toàn bộ test hiện có giữ xanh, không sửa kỳ vọng; thêm test so sánh quyền cũ và mới trên mọi cặp người dùng × hành động (ma trận ghi) |
| G2. Phân công theo mốc (D6)               | Form soạn có bước "Phân công": chọn người, mốc và loại sự kiện cho từng bên; `mayRecord` kiểm theo phân công; hộp việc và màn nộp lọc theo phân công                       | Trường `milestones`, `eventTypes`                                     | Người không được giao bị từ chối (`NOT_ASSIGNED_EXECUTOR`); quyền của người được giao giữ nguyên; smoke trên giao diện                |
| G3. Tách đại diện và người thực hiện (D9) | Dữ liệu mẫu bên bán có đại diện, người giao hàng, kế toán; người ký phải là `REPRESENTATIVE`                                                                               | Tài khoản mẫu mới                                                     | Quét vai trò × màn hình (như lần kiểm 9 tài khoản × 20 màn); quy tắc tách nhiệm vụ                                                    |
| G4. Kiểm soát hai phía (D10)              | Ngoại lệ theo bên; kiểm soát viên bên bán xử lý sự kiện bên mình; sự kiện `BUYER_BREACH` chỉ để ghi hồ sơ                                                                  | Loại sự kiện mới trong bộ chính sách (không thuộc nhóm điều kiện chi) | Golden snapshot 405 mốc không đổi; quy tắc hai người trong từng bên; quyền đọc chéo đúng phạm vi                                      |
| G5. Bên bán soạn thảo (D5)                | `drafter_side`, trạng thái `REVIEW_BY_COUNTERPARTY`, khoá điều khoản khi cả hai bên xác nhận                                                                               | Trường mới trên hợp đồng                                              | Luồng đầy đủ: bên bán soạn, bên mua rà soát và xác nhận, ký, nộp chứng từ, chi; bên mua soạn vẫn chạy như cũ                          |

G1 là nền cho mọi giai đoạn sau và không đổi hành vi. G2 và G3 có thể làm song song sau G1. G5 làm cuối vì động đến nhiều màn nhất (form soạn, rà soát, ký).

## 4. Rủi ro và cách giữ an toàn

- **Quyền rộng hơn ngoài ý muốn.** Ở G1, mọi kiểm tra quyền đi qua lớp thành viên nhưng phải cho kết quả y hệt hiện tại. Ma trận ghi trong `tests/foundation/business-rules.test.mjs` là hàng rào.
- **Data Pack bị ảnh hưởng.** Không giai đoạn nào đổi cột CSV mà engine đọc. Phân công và vi phạm của bên mua chỉ nằm ở API, hoặc là loại sự kiện không thuộc nhóm điều kiện chi.
- **SoD.** `SYSTEM_ADMIN` không trở thành thành viên hợp đồng. Kiểm soát viên không ghi sự kiện nghiệp vụ. Người đề xuất và người quyết định ngoại lệ luôn là hai người.
