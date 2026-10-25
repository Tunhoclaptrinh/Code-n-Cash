# Khung ký lớn và trình tự đọc/trích xuất — 25/10/2026

## Khung PDF để chọn vùng ký

Chế độ vừa trang trước đây thu theo cả chiều cao, có lúc chỉ còn 26% trên laptop. Phù hợp xem tổng thể nhưng quá nhỏ để đặt ô ký.

Khung mới dành phần lớn chiều ngang cho PDF, thu cột cấu hình còn 320–370 px trên desktop và tăng chiều cao tối thiểu khả dụng. Mặc định **Vừa chiều ngang**, cuộn riêng trong PDF; **Vừa trang** là lựa chọn xem tổng thể. Có **Mở rộng/Thu gọn**, Escape để trở lại, zoom tới 300%. Chọn người ký hoặc “Đến vùng ký” đưa đúng trang và vùng đó vào khung nhìn; thay đổi zoom cũng giữ vùng đang chọn trong tầm nhìn.

Mở rộng dùng cùng editor và state, không tạo editor thứ hai. Ô chưa lưu không mất khi mở rộng/thu gọn; khi rời màn, trạng thái cuộn trang được khôi phục. Tọa độ vẫn dùng hệ chuẩn 520 đơn vị; không thay đổi bytes/hash hoặc kiểm tra đúng người, chồng ô, đè chữ ở API.

## Trình tự thân thiện ở màn số hóa

Màn trích xuất có bốn bước thường trực, hướng dẫn và viền nhấn vào thao tác tiếp theo:

| Bước | Người dùng làm gì | Điều kiện chuyển |
| --- | --- | --- |
| Đọc tệp | Mở PDF, đọc điều khoản, xác nhận đã đọc | Trình xem phải tải xong tệp trước khi bật nút xác nhận đã đọc |
| Trích xuất | Chủ động chạy extractor đã cấu hình | Có xác nhận đọc với tệp hiện tại; lỗi provider vẫn hiển thị, không tự dựng giá trị |
| Đối chiếu | Nạp đề xuất vào ô trống, kiểm trang/quote, sửa/bổ sung sáu trường | Giá trị đủ và hợp lệ; người dùng đánh dấu đã đối chiếu |
| Xác nhận | Áp dụng sáu giá trị vào hồ sơ | Sau đó mới bật nút khóa bản số hóa; vẫn phải rà bảng mốc/ngày hạn như trước |

Sửa giá trị xác nhận bỏ đánh dấu đã đối chiếu. Thay proposal phải rà lại; trạng thái đọc gắn với code, document ID và hash tệp. Khi mở lại hồ sơ chưa xác nhận, hướng dẫn hiện lại và cần xác nhận đọc; nếu đã có proposal thì dùng kết quả đó, không tự gọi AI thêm. Proposal đã xác nhận hiển thị bước hoàn tất.

Đây là trình tự tương tác và xác nhận đọc/đối chiếu của người dùng, không phải chứng minh họ đã hiểu văn bản hay chữ ký số. API xác nhận trích xuất và khóa hồ sơ vẫn kiểm quyền, hash/version và dữ liệu như trước. Không thêm yêu cầu đọc tài liệu vào engine/Bronze: hồ sơ SEED không có bytes tệp vẫn báo rõ giới hạn và cho rà soát mẫu thủ công; không đánh dấu giả rằng đã đọc PDF.

Khung diễn giải mốc được đổi nhãn thành **Điều khoản theo mẫu quy trình**, bỏ cách ghi trang PDF giả định từ mẫu cũ. Khung này không phải OCR; trang và đoạn trích thật chỉ nằm trong bảng trích xuất. So sánh tổng tiền cũng không viện dẫn một số điều chưa được xác minh trên tệp.

## Kiểm chứng

- `pnpm check`: typecheck, lint, format, build và 148 test nền tảng (77 Python, 71 Node).
- `scripts/refinement-smoke.mjs`: thêm mở rộng/thu gọn và Escape, kiểm PDF mặc định đủ lớn, chế độ vừa trang, đọc PDF thật, nút extract/khóa bị chặn trước bước đọc, tải lại trang vẫn hướng dẫn, nạp sáu trường, đánh dấu đối chiếu, xác nhận/khóa và chuyển sang ký. Kịch bản lệch tên vẫn bị API từ chối.
- `scripts/visual-review.mjs`: đạt 72 bố cục ở bốn kích thước, hai theme; kiểm kích thước PDF và chiều cao canvas, thay tiêu chí cũ “toàn trang phải vừa màn hình ngay từ đầu” vì chế độ mặc định giờ ưu tiên đọc và đặt ô.
- Browser smoke đạt 36 màn/kịch bản, tiếp tục kiểm luồng cũ/SEED, desktop/mobile và sáng/tối. Script hướng dẫn đã chuyển từ pre-confirm qua API sang thao tác thật theo bốn bước trên trình duyệt; 72 ảnh hướng dẫn và 11 ảnh kiểm tra riêng có đủ ảnh gốc/khoanh vùng, không thiếu mục.

Ảnh mới và ảnh gốc ở `playwright-report/refinement`; hướng dẫn Việt/Anh dùng ảnh thật của khung mở rộng, bước đọc PDF và đối chiếu. Báo cáo theo vai trò và kết quả JSON tạo bằng script báo cáo có sẵn. Kiểm thử dùng fixture file riêng và extractor local, không gọi Google hoặc ghi dữ liệu production.
