# Văn bản hợp đồng bên cạnh thao tác — 25/10/2026

Mục tiêu: ở mọi màn thao tác trên hợp đồng và từng mốc, người dùng/giám khảo thấy văn bản hợp đồng (kèm chữ ký và dấu demo) ngay bên trái, thông tin cần để quyết định và nút thao tác ở bên phải; nút có màu theo ý nghĩa. Dữ liệu BTC không kèm văn bản nên mọi hợp đồng chưa có tệp được dựng một **tệp gốc mô phỏng** từ chính dữ liệu của nó.

## 1. Tệp gốc mô phỏng

| Hạng mục | Cách làm |
| --- | --- |
| Áp dụng cho | Mọi hợp đồng chưa có tệp tải lên: 100 hợp đồng BTC và hợp đồng demo CT0101–CT0104. Hợp đồng có tệp thật vẫn dùng tệp thật |
| Nội dung | Hợp đồng tiếng Việt lập từ điều khoản (giá trị, thời hạn, ân hạn, phạt, chính sách duyệt), bảng mốc thanh toán với tên mốc tiếng Việt, thứ tự và tên người ký; trang "Xác nhận và chữ ký" có một vùng ký cho từng người |
| Nhãn | Dòng "BẢN HỢP ĐỒNG MÔ PHỎNG — lập từ dữ liệu hợp đồng của Ban tổ chức để xem và đối chiếu"; chân trang "CT… · Bản mô phỏng · Trang n"; trên khung xem có nhãn "Bản mô phỏng" kèm giải thích |
| Ổn định | Cùng dữ liệu cho cùng tệp DOCX, cùng SHA-256 (thời gian trong gói ZIP cố định). Tạo lại sau khi máy chủ khởi động lại không đổi tệp |
| Lưu đệm | `DATA_DIR/mock-originals/<khoá>.docx/.pdf/.json`; khoá gồm dữ liệu hợp đồng và phiên bản bộ sinh/mẫu chữ, đổi mẫu thì tự sinh lại |
| Hiệu năng | Lần đầu ~2 giây/hợp đồng (LibreOffice, xếp hàng từng bản), các lần sau ~0,08 giây. Production tự dựng sẵn toàn bộ trong nền sau khi khởi động; tắt bằng `MOCK_ORIGINALS_WARMUP=false` |
| Quyền | Đọc trong phạm vi người đăng nhập như hợp đồng; hợp đồng của đơn vị khác vẫn trả `CONTRACT_ACCESS_DENIED` |
| Ký số | Không đổi logic ký và xác minh. Chữ ký của hợp đồng chưa có tệp vẫn gắn với bản điều khoản đã chốt (chính dữ liệu mà bản mô phỏng được lập ra); không ghi tệp mô phỏng vào bản ghi ký, không sửa vị trí ký đã lưu. Test xác nhận kết quả xác minh trước/sau khi dựng tệp giống hệt |

### API

| Endpoint | Hợp đồng chưa có tệp | Hợp đồng có tệp |
| --- | --- | --- |
| `GET /contract-files/:code` | Một tệp `original` (`HopDong_CT….docx`, `simulated: true`) | Danh sách tệp như trước |
| `GET /contract-files/:code/original/download` | DOCX mô phỏng | — |
| `GET /contract-files/:code/original/preview` | PDF dựng từ DOCX | — |
| `GET /contract-files/:code/original/pages/:n/image` | Ảnh trang PNG | — |
| `GET /contract-files/:code/view` (mới) | Tài liệu, kích thước từng trang và vị trí ký lấy từ vùng "VỊ TRÍ KÝ 0n" trên PDF thật, kèm trạng thái từng bước ký | Tài liệu, trang và vị trí ký đã lưu khi bố trí ô ký |

## 2. Khung "Văn bản hợp đồng"

| Thành phần | Mô tả |
| --- | --- |
| `ContractPreviewPane` | Ảnh từng trang thật; đầu khung có số trang, nhãn "Bản mô phỏng", nút "Đến trang ký", "Tải tệp gốc", dòng "Đang xử lý: Mốc 3 · Nghiệm thu" |
| Đã ký | Chữ ký viết tay màu mực xanh + dòng "Đã ký số · VNPT SmartCA · 12/08/2026 09:10" (ký bằng ảnh: "Ký bằng ảnh · …") và dấu tròn đỏ in tên tổ chức, chữ "MẪU" |
| Đang đến lượt | Ô viền xanh nét đứt "Bước 2 · đang chờ Vũ Thanh Hà ký" |
| Chờ lượt | Ô viền xám "Bước 3 · Phạm Minh Đức" |
| `ContractSideLayout` | Màn ≥1200 px: văn bản bên trái (giữ cố định khi cuộn), thông tin và nút bên phải. Màn hẹp: nút "Xem hợp đồng" mở ngăn kéo |
| Làm mới | Khung tự cập nhật sau mỗi thao tác ghi (ký, phê duyệt…) |
| `DemoSignatureMark`, `DemoSeal`, `PendingSignatureSlot` | Hình vẽ SVG, chỉ hiển thị, không sửa tệp |

## 3. Màn hình

| Màn | Trước | Sau |
| --- | --- | --- |
| Chi tiết hợp đồng › Các mốc | Dòng thời gian mốc + cột tổng quan thanh toán/điều khoản; văn bản chỉ ở tab "Tài liệu gốc" (hợp đồng BTC: "không kèm bản hợp đồng") | Văn bản bên trái; tổng quan thanh toán, điều khoản và các mốc bên phải |
| Chi tiết hợp đồng › Tài liệu gốc | Hợp đồng BTC không có tệp | Có tệp gốc mô phỏng để xem/tải |
| Nộp chứng từ | Không có văn bản | Văn bản bên trái, focus mốc đang nộp |
| Phê duyệt chi | Không có văn bản | Văn bản bên trái, focus mốc |
| Quyết định mốc | Không có văn bản; banner chữ và nút cùng hàng | Văn bản bên trái; banner xếp nút xuống dưới; các thẻ (điều kiện, tính tiền…) xếp một cột |
| Tranh chấp | Không có văn bản | Văn bản bên trái, focus mốc |
| Trình tự ký | Khung tài liệu đặt giữa trang | Văn bản bên trái có chữ ký/dấu theo bước, focus người đang đến lượt; bỏ "14 trang" cố định ở dòng tóm tắt |
| Chọn phương thức ký | Tài liệu thu gọn phải bấm mở | Văn bản bên trái, focus bước đang ký |
| Kiểm tra chữ ký | Không có văn bản | Văn bản có chữ ký/dấu bên trái kết quả kiểm tra |
| Tải hợp đồng lên | Xem trước bên phải; chỉ hiện khi form hợp lệ đủ; mỗi lần sửa thay bằng vòng xoay vài giây | Xem trước bên trái, form bên phải; hiện ngay từ đầu, trường chưa nhập là "……", chưa chọn người ký có khối "NGƯỜI KÝ — CHƯA CHỌN"; giữ bản cũ kèm nhãn "Đang cập nhật…" khi đang tạo bản mới |
| Màn hẹp (điện thoại) | — | Nút "Xem hợp đồng" mở ngăn kéo văn bản |

## 4. Màu nút theo ý nghĩa

| Ý nghĩa | Màu | Ví dụ |
| --- | --- | --- |
| Bước tiếp theo | Xanh dương đặc (`type="primary"`) | Nộp chứng từ, Mở phê duyệt, Xử lý tranh chấp, Gửi yêu cầu ký, Hoàn tất bản nháp |
| Đồng ý / xác nhận / chi tiền | Xanh lá đặc (`color="green" variant="solid"`) | Phê duyệt (và nút OK hộp xác nhận), Chuyển chi, Xác nhận ký, Xác nhận đóng tranh chấp, Duyệt đề xuất ngoại lệ |
| Từ chối / huỷ | Đỏ (`danger`) | Từ chối, Huỷ yêu cầu ký, Huỷ ký, Từ chối ngoại lệ |
| Báo vấn đề / cần thêm | Cam viền (`color="orange" variant="outlined"`) | Mở tranh chấp, Yêu cầu bổ sung, Đề xuất ngoại lệ; "Xác nhận" ở màn tranh chấp khi chọn mở tranh chấp/yêu cầu bổ sung |
| Tiện ích | Trắng (mặc định) | In / lưu PDF, Hướng dẫn, Nhật ký hợp đồng, Kiểm tra chữ ký, Tải tệp gốc, Đến trang ký, Để sau |

Mỗi khu vực quyết định chỉ có một nút nổi bật. Thay đổi chi tiết theo tệp:

| Tệp | Nút | Trước | Sau |
| --- | --- | --- | --- |
| `PaymentApprovalPage.tsx` | Từ chối | `color="danger" variant="outlined"` | `danger` (cùng giao diện) |
| `PaymentApprovalPage.tsx` | OK của hộp xác nhận Phê duyệt | Xanh dương | Xanh lá |
| `MilestoneDecisionPage.tsx` | Mở tranh chấp | Mặc định | Cam viền |
| `MilestoneDecisionPage.tsx` | Xử lý tranh chấp | Mặc định | Xanh dương (bước tiếp theo) |
| `MilestoneDecisionPage.tsx` | Duyệt / Đề xuất ngoại lệ | Xanh dương | Xanh lá / Cam viền |
| `disputes/components/DecisionPanel.tsx` | Xác nhận | Xanh dương | Xanh lá khi đóng tranh chấp; cam viền khi mở tranh chấp/yêu cầu bổ sung |
| `SigningMethodPage.tsx` | Xác nhận và gửi đến dịch vụ ký | Xanh dương | Xanh lá |
| `SigningFlowPage.tsx` | Hủy yêu cầu ký | Liên kết chữ đỏ | Nút đỏ viền |
| `ContractModal.tsx` | Hoàn tất bản nháp / Mở trang hợp đồng | Mặc định / Xanh dương | Xanh dương / mặc định khi có nút hoàn tất (chỉ một nút chính) |

## 5. Mô tả luật ở màn Quyết định mốc

Cột "Điều kiện" hiện câu nghiệp vụ ngắn theo mã lý do; biểu thức gốc của BTC vẫn ở tooltip, mã luật PR… giữ ở cột riêng.

| Mã lý do | Câu hiển thị |
| --- | --- |
| `OPEN_DISPUTE` | Đang có tranh chấp chưa đóng thì tạm giữ thanh toán. |
| `REJECTION_PRESENT` | Có ý kiến từ chối hợp lệ thì mốc bị từ chối, chưa được thanh toán. |
| `UNAUTHORIZED_EVENT` | Chứng từ do bên không có thẩm quyền tạo thì không được tính; tạm giữ để kiểm tra. |
| `MISSING_REQUIRED_EVENT` | Chưa đủ các chứng từ bắt buộc của mốc thì chưa được giải ngân. |
| `APPROVAL_QUORUM_NOT_MET` | Mốc cần phê duyệt mà chưa đủ số lượng hoặc vai trò hợp lệ thì tạm giữ thanh toán. |
| `LATE_COMPLETION` | Hoàn thành quá hạn và hết thời gian ân hạn thì bị phạt chậm, thanh toán sau khi trừ phạt. |
| `ALL_CONDITIONS_MET` | Đủ mọi điều kiện, không có tranh chấp và không bị từ chối thì thanh toán đủ giá trị mốc. |
| `UNRESOLVED_CONDITION` | Trường hợp không khớp các điều trên thì giữ lại để kiểm tra thủ công, không tự động thanh toán. |

## 6. Tệp đã sửa

| Nhóm | Tệp |
| --- | --- |
| Bộ sinh hợp đồng | `apps/engine/sample_contract.py` (chế độ `original`, tên mốc theo ngôn ngữ, ZIP cố định thời gian, chế độ `partial`), `apps/engine/templates/sample-{vi,en}.json` |
| API | `apps/api/src/mock-originals.ts` (mới), `contract-files.ts`, `sample-documents.ts` (truyền loại mốc, chế độ partial), `domain/drafts.ts` (`validateDraftSigners` có `partial`), `main.ts` (dựng sẵn trong nền) |
| Web dùng chung | `shared/ui/ContractPreviewPane.tsx`, `ContractSideLayout.tsx` + `.module.css`, `DemoSignatureMarks.tsx` (mới); `DocumentPreview.tsx` (`keepPrevious`); `shared/api/domain.ts` (làm mới khung sau thao tác); xoá `ContractDocumentPanel.tsx` |
| Màn hình | `ContractDetailPage`, `EvidenceSubmissionPage`, `PaymentApprovalPage`, `MilestoneDecisionPage`, `DisputePage` + `DecisionPanel`, `SigningFlowPage`, `SigningMethodPage`, `SignatureVerificationPage`, `ContractModal`, `PagePreviewPanel`, `ContractUploadPage.module.css` và CSS module của các màn |
| Chuỗi | `locales/{vi,en}/common.json` (`contractPane.*`), `domain.json` (`ruleCondition.*`), `contracts.json` (`partialNote`, `updating`), `signing.json` (bỏ số trang cố định) |
| Kiểm thử | `tests/foundation/workflow.test.mjs` (tệp mô phỏng ổn định, đủ vùng ký, xác minh không đổi), `trust.test.mjs` (xem trước bản nháp chưa đủ, giữ kiểm tra phạm vi), `tests/test_sample_contract.py` (mới), `i18n.test.mjs` (đủ câu cho mọi mã lý do) |

## 7. Kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` | Đạt |
| `pnpm test` | Đạt: 83 test Python, 9 bộ test Node không lỗi |
| `pnpm test:browser` | Đạt: 36 màn, desktop/mobile, các luồng ký/phê duyệt/tải lên |
| Kiểm trực quan 1440×1000 và 390×844 | CT0084: 3 chữ ký + 3 dấu đúng vùng ký; CT0102: 1 đã ký, 1 đang chờ, 1 chờ lượt; CT0101–CT0104 đều có văn bản; không cuộn ngang; ngăn kéo trên điện thoại hiển thị đủ |

## 8. Lưu ý

- Đây là bản **mô phỏng** để xem và đối chiếu, có nhãn rõ trên văn bản và trên giao diện; chữ ký/dấu là hình vẽ demo, không phải chữ ký số thật trên PDF.
- Tên người ký in trong văn bản lấy từ dữ liệu ký của hợp đồng tại thời điểm dựng; nếu tên tài khoản đổi, khoá lưu đệm đổi theo và văn bản được dựng lại.
- Ảnh hướng dẫn trong `apps/web/public/guide` chưa chụp lại theo bố cục mới; chạy `pnpm guide:screenshots` khi cập nhật bộ hướng dẫn.
