# 09. Việc còn lại, các bước của mốc và hộp việc

Tài liệu này giải thích phần trả lời câu hỏi "mốc này đang chờ ai, làm gì, bao lâu": nó dựa trên gì, vì sao vẫn khớp đề, và sửa hoặc mở rộng ở đâu. Tên mã và từ nghiệp vụ theo [NGHIEP_VU.md](NGHIEP_VU.md) mục 14.13.

## 1. Ý tưởng trong ba câu

1. Engine vẫn là nơi duy nhất ra quyết định: nó cho biết luật nào đang giữ mốc và điều kiện nào thiếu.
2. API dịch kết quả đó thành **các mục việc** (`PendingItem`): mỗi điều kiện của mốc kèm bên, tổ chức, vai trò, người làm được, đã chờ bao lâu, hạn, và việc đó có phải của người đang xem không.
3. Mọi màn chỉ hiển thị các mục này: khối "Việc còn lại" ở màn quyết định, thanh các bước ở bốn màn xử lý, dòng "Tiếp theo" ở chi tiết hợp đồng, màn tranh chấp, hộp việc và chuông thông báo. Không màn nào tự suy luận.

```text
engine (Python) ──> Evaluation (quyết định, lý do, luật, chứng từ hợp lệ, phê duyệt, tranh chấp)
                        │
API  views/responsibility.ts ──> PendingItem[]  (MilestoneDetail.pending, MilestoneRow.waitingOn)
                        │
     views/tasks.ts ──────────> TaskRow[]      (hộp việc: MINE, UPCOMING, WAITING)
                        │
Web  PendingItems.tsx, MilestoneJourney.tsx, TaskInboxPage.tsx  (chỉ hiển thị, liên kết, xem trước)
```

## 2. Vì sao vẫn khớp đề

| Đề hoặc BTC | Yêu cầu | Phần này làm gì | Không làm gì |
| --- | --- | --- | --- |
| Đề, mục 2 | Rule check, Decision, quyền actor | Đọc kết quả engine và bảng thẩm quyền (`AUTHORITY`, mục 2.1) để biết bên nào phải nộp | Không đổi luật, không đổi cách engine chọn luật |
| Đề, mục 4 | Điều kiện đạt và thiếu, lý do, luật áp dụng | Mỗi điều kiện có trạng thái (đang chặn, chờ sau, đã xong) và luật liên quan | Không thêm điều kiện mà engine không xét |
| Đề, mục 5 | Không RELEASE khi chưa đủ điều kiện | Chỉ đọc; không có đường nào từ màn hình đổi quyết định | Không ghi dữ liệu |
| Đề, mục 10 | Không hard-code; chưa rõ thì HOLD | Suy từ dữ liệu và policy pack; mốc HOLD do thiếu dữ liệu hiện mục "Dữ liệu mốc cần kiểm tra" | Không có mã hợp đồng, mã mốc nào trong logic |
| BTC A06 | Ai được đóng tranh chấp | Người có thể đóng là chủ hợp đồng và cán bộ hợp đồng bên mua, khớp quyền của workflow | |
| Nhãn công khai, 405 mốc | Giữ nguyên kết quả | Test workflow và golden chạy lại toàn bộ: quyết định của 405 mốc không đổi | |

Nguyên tắc dự án vẫn giữ: danh tính lấy từ token; chỉ nêu tên tài khoản của hai bên hợp đồng, không bao giờ có email; dòng Data Pack của bên mua hoặc nhà cung cấp chỉ ghi tên tổ chức, không gán cho một người demo nào.

## 3. Mục việc (`PendingItem`)

Kiểu ở `packages/contracts/src/workflow.ts` (bản sao trong `apps/api/src/domain/types.ts`, phải giống hệt). Cách tính ở `apps/api/src/domain/views/responsibility.ts`:

| Nguồn trong kết quả engine | Loại mục | Ai làm | Hành động |
| --- | --- | --- | --- |
| Chứng từ bắt buộc còn thiếu | `EVIDENCE` | Bên theo `AUTHORITY`: nhà cung cấp, hoặc cán bộ hợp đồng bên mua | `SUBMIT` (mở màn nộp, chọn sẵn loại) |
| Chứng từ do bên không có thẩm quyền tạo | `UNAUTHORIZED` | Bên đúng nộp lại; chủ hợp đồng đề xuất xử lý | `SUBMIT` hoặc `PROPOSE_EXCEPTION` |
| Vai trò phê duyệt chưa có (chưa đủ quorum) | `APPROVAL` | Người giữ vai trò đó ở bên mua | `APPROVE` |
| Tranh chấp đang mở | `DISPUTE` | Chủ hợp đồng, cán bộ hợp đồng bên mua | `RESOLVE` |
| Từ chối hợp lệ | `REJECTION` | Chủ hợp đồng, xử lý ngoài hệ thống | `CONTACT` |
| Lỗi cấu trúc hoặc bất thường | `DATA_ISSUE` | Chủ hợp đồng, cán bộ hợp đồng | `PROPOSE_EXCEPTION` hoặc `CONTACT` |
| Quyết định chi mà chưa có lệnh chi | `PAYMENT` | Phê duyệt tài chính bên mua | `TRANSFER` |

Trạng thái:

- `BLOCKING`: mục ứng với lý do của luật đang thắng (bảng `BLOCKING_KIND`). Chứng từ thiếu và chứng từ sai thẩm quyền chặn cùng nhau.
- `WAITING`: còn thiếu nhưng thuộc luật ưu tiên thấp hơn, chỉ chặn khi các mục `BLOCKING` xong.
- `DONE`: đã đạt, kèm người làm và thời điểm.

Thời gian:

- Quá hạn đếm từ ngày đến hạn, giống màn nộp chứng từ (`Ctx.lateness`); ngày hết ân hạn hiện riêng vì phạt chỉ tính sau ân hạn.
- "Đã chờ" chỉ hiện khi dữ liệu cho biết từ lúc nào: phê duyệt từ khi đủ chứng từ, tranh chấp từ lúc mở, lệnh chi từ lần phê duyệt cuối. Chứng từ chưa có mốc bắt đầu chờ nên chỉ hiện hạn.
- Mọi phép tính ngày dùng giờ nghiệp vụ (`businessNow`), không dùng đồng hồ trình duyệt.

`action.mine` dùng chung quy tắc với nút trên màn quyết định (`milestoneActions` ở `views/milestones.ts`), nên một việc hiện là "của bạn" đúng khi API cho phép bạn làm.

## 4. Các nơi dùng

| Nơi | Thành phần | Hiển thị |
| --- | --- | --- |
| Màn quyết định | `PendingPanel`, `BlockingPeople`, `ConditionsPanel` | Khối "Việc còn lại", chip người đang được chờ cạnh "Việc tiếp theo", điều kiện bấm hoặc rê vào để xem ai làm |
| Bốn màn xử lý một mốc (quyết định, nộp chứng từ, phê duyệt, tranh chấp) | `MilestoneJourney` qua prop `nav` của `ContractSideLayout` | Thanh Chứng từ, Phê duyệt, Tranh chấp, Quyết định, Lệnh chi; mỗi bước là liên kết, rê vào thấy ai phải làm |
| Chi tiết hợp đồng | `WaitingOnLine` | "Tiếp theo: tổ chức · vai trò", rê vào thì tải các mục đang chặn |
| Màn tranh chấp | `SubmissionPanel` | Bên mở, người mở nếu dữ liệu có, số ngày đã mở, người có thể đóng |
| Hộp việc | `TaskInboxPage`, `MilestonePreviewLink` | Ba nhóm việc, xem trước mốc khi rê vào |
| Chuông, số trên menu | `NotificationDrawer`, `AppLayout` | Việc đến lượt bạn đang giữ mốc hoặc hợp đồng |
| Nhật ký hoạt động | `ActivityLogView` | Dòng gắn với một mốc mở thẳng màn quyết định của mốc đó |

## 5. Hộp việc

`views/tasks.ts` gom các mục `action.mine` của từng mốc theo hành động thành một việc:

| Nhóm | Gồm | Ghi chú |
| --- | --- | --- |
| `MINE` Đến lượt tôi | Mục `BLOCKING` của bạn; việc ký đến lượt bạn; hồ sơ nháp; đề xuất ngoại lệ chờ kiểm soát viên duyệt | Kèm "đã chờ bạn N ngày" khi biết |
| `UPCOMING` Sắp tới lượt tôi | Mục `WAITING` của bạn, ví dụ phê duyệt khi còn thiếu chứng từ | `waitingFor` nêu việc phải xong trước |
| `WAITING` Tôi đang chờ người khác | Mốc mà chủ hợp đồng, cán bộ hợp đồng hoặc nhà cung cấp theo dõi, đang bị giữ bởi việc của người khác; hợp đồng đang chờ người khác ký | `waitingFor` nêu tổ chức, vai trò, người, số ngày |

Quy tắc đã chọn và lý do:

- Đề xuất ngoại lệ và lệnh chi chỉ thành việc khi chúng đang giữ mốc, không có bản "sắp tới".
- Mốc bị từ chối hoặc đã chi không sinh việc: chúng đã khép.
- Thứ tự: nhóm, rồi mức khẩn (nguy cơ phạt trễ, đến lượt bạn, mốc đang bị giữ, còn trong hạn), rồi việc đang giữ mốc trước lệnh chi, rồi hạn.
- Chuông và số trên menu (`notifies`): chỉ nhóm `MINE` và không gồm lệnh chi. Lệnh chi chờ duyệt là hàng việc kế toán làm theo đợt; trên Data Pack có 48 mốc đã đủ điều kiện chi từ nhiều tháng trước, nếu báo lên chuông sẽ che mất việc phê duyệt cần làm ngay. Muốn báo cả lệnh chi thì sửa một dòng trong `notifies`.

## 6. Sửa và mở rộng

| Muốn | Sửa ở | Cần thêm |
| --- | --- | --- |
| Thêm một loại điều kiện (ví dụ hoá đơn khớp số tiền, phụ lục chờ ký) | `PendingKind` (hai tệp kiểu), `conditions()`, `BLOCKING_KIND`, `REASON_OF` trong `responsibility.ts` | Nhãn `domain.pendingKind`, `inbox.followUp`, `inbox.waitingWhat`; bước tương ứng trong `KINDS` của `MilestoneJourney`; mục 14.13 của NGHIEP_VU; test |
| Đặt hạn cho phê duyệt (SLA) | Gán `dueBy` cho mục `APPROVAL` từ policy pack | Không đổi giao diện: hạn và quá hạn tự hiện |
| Thêm hành động (ví dụ nút "Nhắc") | `PendingActionKind`, `actionOf()`; nhãn `domain.pendingAction` | Một action API có kiểm quyền và ghi audit; nếu thành việc trong hộp việc thì thêm vào `TASK_OF` |
| Thêm bước vào thanh các bước | `JourneyStage`, `KINDS`, `stagesOf()` | Nhãn `journey.stage.*` |
| Đổi ai được theo dõi mốc | `FOLLOWERS` trong `tasks.ts` | Test hộp việc |
| Đổi việc nào lên chuông | `notifies` trong `tasks.ts` | Test "the inbox has the same items as each milestone" |
| Hợp đồng nhiều người cùng vai trò, phân công theo mốc | `accountsOf()`: lọc thêm theo thành viên hợp đồng (thiết kế hai chiều) | Không đổi giao diện |

Ranh giới không được vượt:

- Không để màn hình tự tính việc hay người chịu trách nhiệm; thêm vào API rồi hiển thị.
- Không đổi quyết định hay số tiền từ phần này; phần này chỉ đọc.
- Không nêu tên người ngoài hai bên hợp đồng, không trả email.

## 7. Kiểm thử giữ hành vi

| Test (`tests/foundation/workflow.test.mjs`) | Giữ điều gì |
| --- | --- |
| each held milestone lists who must act next… | Mục việc, trạng thái, người, hạn; không lộ tổ chức khác, không email |
| a dispute names the side that opened it… | Bên mở, không bịa người cho dòng Data Pack, người có thể đóng |
| the inbox has the same items as each milestone… | Ba nhóm, `waitingFor`, thứ tự, chuông chỉ đếm việc đang giữ |
| workflow lists are read page by page… | Nhóm `MINE` của danh sách bằng danh sách của chuông |

Trước khi gửi PR có đổi giao diện phần này: chạy `pnpm typecheck`, `pnpm lint`, `pnpm test`, và chụp màn hình ở 1440 px và 390 px, chế độ sáng và tối.

## 8. Giới hạn hiện tại

- Phê duyệt chưa có hạn vì policy pack chưa có SLA.
- Chứng từ chưa có thời điểm bắt đầu chờ, nên chỉ hiện hạn và số ngày quá hạn.
- Chưa có nhắc việc tự động theo hạn. Khi làm, nên thêm một bộ hẹn giờ phát sự kiện hệ thống (sắp đến hạn, quá hạn, hết ân hạn) rồi để mục việc và hộp việc đọc như hiện nay.
- Mỗi lần đọc tính lại từ kết quả engine đã lưu; nếu chậm khi dữ liệu lớn, lưu đệm theo `runId` của lượt đánh giá.
