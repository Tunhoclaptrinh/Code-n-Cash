# Giản lược màn hình theo nguyên tắc UI/UX — 25/10/2026

Góp ý: màn hình quá nhiều thông tin, khó theo dõi; có những câu hiển nhiên (ví dụ "Ký bằng chữ ký số có chứng thư còn hiệu lực" — không có chứng thư thì vốn không ký được). Áp dụng cho toàn bộ màn hình.

## 1. Nguyên tắc

| # | Nguyên tắc | Cách áp dụng |
| --- | --- | --- |
| 1 | Mỗi màn trả lời 3 câu theo thứ tự: trạng thái hiện tại → còn thiếu/vướng gì → tôi làm gì | Khối đầu cột phải: tiêu đề trạng thái, thẻ trạng thái, việc tiếp theo, nút thao tác |
| 2 | Bỏ câu hiển nhiên và phần giải thích "hệ thống chạy thế nào" | Bỏ hộp quy tắc, "Sau khi nộp…", "Khi bạn chọn…", chú thích về engine/event/mã BR, câu về chứng thư còn hiệu lực |
| 3 | Chi tiết phụ: thu gọn, bấm mới mở (progressive disclosure) | "Xem chi tiết", "Cách tính", "Xem cả 8 luật", "Truy vết chi tiết", "Chi tiết kỹ thuật" |
| 4 | Không lặp thông tin trên cùng màn | Bỏ dòng ngữ cảnh lặp mã/tên hợp đồng, bỏ dòng trạng thái lặp thẻ trạng thái |
| 5 | Ẩn lựa chọn không dùng được thay vì giải thích | Ẩn "Ảnh chữ ký" khi hợp đồng bắt buộc chữ ký số; nút "Xóa ô" chỉ hiện khi có ô |
| 6 | Chỉ giữ một câu ngắn khi thiếu nó người dùng có thể làm sai hoặc không hoàn tác được | "Không sửa được sau khi nộp.", "Không sửa được sau khi xác nhận.", "Một người đề xuất, người thứ hai duyệt." |
| 7 | Mã BTC chấm giữ ở màn Quyết định mốc | MS…, mã lý do, mã luật PR…, quyết định RELEASE/HOLD/…; các màn khác chỉ giữ mã mốc |
| 8 | Thông báo trung thực về ký mô phỏng không mất, chỉ gọn lại | Hộp cảnh báo dài → nhãn nhỏ "Ký mô phỏng", di chuột xem đầy đủ |

## 2. Số chữ hiển thị (cột thông tin/thao tác, 1440×1000)

| Màn | Trước | Sau |
| --- | --- | --- |
| Quyết định mốc (CT0084 · mốc 3) | 831 | 125 |
| Nộp chứng từ (CT0084 · mốc 3) | 177 | 66 |
| Phê duyệt chi (CT0102 · mốc 1) | 206 | 131 |
| Tranh chấp (CT0084 · mốc 3) | 177 | 73 |
| Trình tự ký (CT0102) | 241 | 107 |
| Chọn phương thức ký (CT0102 · bước 2) | 189 | 99 |
| Kiểm tra chữ ký (CT0084) | 313 | 137 |
| Chi tiết hợp đồng · Các mốc (CT0084) | 306 | 221 |
| Chi tiết hợp đồng · Ký hợp đồng (CT0084) | 212 | 124 |
| Tải hợp đồng lên (form trống, cả trang) | 324 | 202 |
| Vị trí ký (có PDF, chưa đặt ô, cả trang) | 294 | 133 |
| Rà soát điều khoản (sau trích xuất, cả trang) | 617 | 389 |
| Toàn vẹn dữ liệu (cả trang) | 363 | 148 |
| Danh sách hợp đồng / Nhật ký / Ngoại lệ / Phân quyền (cả trang, phần lớn là bảng) | 555 / 396 / 455 / 458 | 458 / 382 / 422 / 413 |

## 3. Thay đổi theo màn

| Màn | Giữ hiển thị | Thu gọn (bấm mới mở) | Bỏ |
| --- | --- | --- | --- |
| Quyết định mốc | Lý do + thẻ quyết định/trạng thái, MS…, mã lý do, "Luật áp dụng PR… · Đủ điều kiện chi · Phạt", việc tiếp theo, nút; ✓/✗ điều kiện; 4 dòng tính tiền; luật áp dụng | 9 dòng số liệu điều kiện ("Xem chi tiết"); cách tính phạt ("Cách tính"); bảng 8 luật ("Xem cả 8 luật"); sự kiện, diễn biến, lịch sử, ngoại lệ ("Truy vết chi tiết" — kiểm soát viên có đề xuất chờ thì mở sẵn) | Dòng ngữ cảnh lặp tên hợp đồng/các bên; giải thích idempotency; đoạn giải thích diễn biến/lịch sử/ngoại lệ; banner "Không đồng ý với quyết định?" |
| Nộp chứng từ | Ô chứng từ bắt buộc, tệp kèm, nút "Để sau"/"Nộp", một dòng hạn và phạt, "Không sửa được sau khi nộp." | — | Thẻ "Sau khi nộp" (các bước Hệ thống/Con người); khung "chạy thử" khi chưa có kết quả |
| Phê duyệt chi | 3 ô số liệu, lý do hiện tại, chứng từ, người duyệt, ghi chú, 3 nút màu, liên kết truy vết | — | Hộp "Khi bạn chọn"; đoạn "Phê duyệt không thay được chứng từ còn thiếu…"; câu chặn dài → một câu ngắn |
| Tranh chấp | Danh sách tranh chấp, ô tác động thanh toán, lựa chọn xử lý (mỗi lựa chọn một dòng), lý do, nút | — | "Ghi DISPUTE_OPENED…", hộp "mở dễ, đóng khó", chú thích "không ai sửa tay tiền phạt" |
| Việc cần làm | Danh sách, bộ lọc, thống kê, nút | Popup chi tiết chỉ còn "Cần có", "Lý do đang giữ", "Nguồn dữ liệu" | Câu cuối trang; dòng phụ lặp tên việc; tiêu đề hợp đồng lặp 2 lần |
| Trình tự ký | Mỗi bước: "Bên · Tên", thẻ trạng thái, "Chức danh · Tổ chức", "Đã ký … · phương thức"; email chỉ ở bước đang chờ và chỉ khi demo | — | "Ký bằng chữ ký số có chứng thư còn hiệu lực", "bước cuối bắt buộc chữ ký số", dòng "Vai trò · Chức danh", "Hệ thống đang chờ/sẽ thông báo…", hộp "Quy tắc của trình tự" |
| Chọn phương thức ký | Các phương thức (tên + 1 dòng), tiến trình, điện thoại mô phỏng, nút | Thông báo ký mô phỏng (nhãn + tooltip) | "Ảnh chữ ký" khi không được dùng; "Tệp sẽ được ký"; thông tin chứng thư; hộp "trong lúc chờ, tệp bị khóa" |
| Kiểm tra chữ ký | Kết quả, mỗi chữ ký: tên · bên, trạng thái, thời gian · phương thức; dòng đỏ khi có vấn đề; ô kiểm tra tệp | Chứng thư thử nghiệm (tooltip); "Chi tiết kỹ thuật" | Hộp "Khi nào kết quả báo không hợp lệ"; đoạn giải thích ô kiểm tra tệp |
| Chi tiết hợp đồng | Thẻ mốc: tên, trạng thái, mã mốc, số tiền, hạn, chứng từ, lý do, việc tiếp theo, nút; 4 dòng thanh toán; 3 dòng điều khoản | Quy trình mốc, bộ quy tắc ("Chi tiết kỹ thuật") | Thẻ quyết định và mã lý do/luật trên thẻ (còn ở màn Quyết định mốc); "ân hạn" lặp; "Đủ điều kiện chi" khi bằng giá trị mốc; dòng phạt/bị từ chối bằng 0; cảnh báo "đã ký đủ…"; đoạn giải thích ở các tab |
| Danh sách / popup hợp đồng | Cột, bộ lọc (kể cả nguồn), thống kê | — | Chính sách duyệt ở dòng phụ; "Bộ rule"; chú thích thanh toán; ô phạt bằng 0 |
| Tải hợp đồng lên | Các trường, nhãn có biểu tượng (i) xem hướng dẫn, kiểm tra còn thiếu, xem trước | Gợi ý chính sách duyệt (tooltip) | Các đoạn hướng dẫn dưới trường, thông báo phiên bản luật, thẻ mốc theo workflow, hai thông báo trong khung xem trước, các dòng kiểm tra mặc định |
| Vị trí ký | Trang PDF, chọn bước, đặt/sửa ô, phóng to/thu nhỏ, cảnh báo khi ô che chữ/sai người | Toạ độ mm (tooltip) | Hộp giới thiệu, "Mẹo", danh sách 4 kiểm tra luôn hiện (chỉ hiện khi chưa đạt), tiêu đề lặp |
| Rà soát điều khoản | Các bước, đọc tài liệu, trích xuất, bảng trường có trang/trích dẫn, xác nhận, "Không sửa được sau khi xác nhận." | Mã băm, phiên bản bộ trích xuất ("Chi tiết kỹ thuật"); điều khoản theo mẫu quy trình | Các hộp gợi ý "Bước 1/3…", nhãn đếm điểm cần xác nhận, ghi chú phê duyệt |
| Nhật ký, ngoại lệ, toàn vẹn, dữ liệu, phiên bản luật, quản trị, phân quyền | Bảng, mã/hash (là dữ liệu của kiểm soát/kiểm toán), nút; "Một người đề xuất, người thứ hai duyệt." | — | Các hộp giới thiệu dài, đoạn giải thích dưới thẻ, câu nêu mặc định |

Không đổi logic nghiệp vụ, quyền, API, luồng ký/xác nhận/huỷ. Một lỗi nhỏ được sửa kèm: nội dung hộp xác nhận phê duyệt trước đây hiện rỗng tên mốc.

## 4. Kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` | Đạt |
| `pnpm test` (83 test Python, 9 bộ test Node) | Đạt |
| `pnpm test:browser` | Đạt: 36 màn, desktop/mobile, các luồng chính |
| Xem ảnh chụp trước/sau từng màn | Đã xem; không cuộn ngang ở 1440 và 390 px |

## 5. Còn lại

- Một số khoá chuỗi cũ trong `apps/web/src/locales` không còn dùng (giữ lại để các phần sửa song song không xung đột); dọn ở đợt sau.
- `scripts/guide-screenshots.mjs` đã chỉnh selector cho phần thu gọn nhưng chưa chạy lại; ảnh hướng dẫn cần chụp lại bằng `pnpm guide:screenshots`.
