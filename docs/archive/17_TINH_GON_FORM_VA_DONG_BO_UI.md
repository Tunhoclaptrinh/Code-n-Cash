# Kiểm tra form hợp đồng thu gọn — 24/10/2026

- Mỗi form có một nút Điền mẫu toàn bộ, giữ dữ liệu đã nhập và điền nốt người ký còn trống.
- Bốn người ký: một dòng/người trên desktop, hai dòng trên màn hẹp; menu Thao tác chuyển lên/xuống/xóa.
- Chú thích dài nằm trong tooltip; nội dung tự co giãn, bộ đếm tách khỏi chú thích, tệp nhỏ hiển thị KB.
- Kiểm tra trực tiếp đã qua ở chiều rộng 1440, 1280, 1024, 390 px, gồm đổi thứ tự/xóa người ký, sinh DOCX và chặn tệp mẫu cũ sau khi sửa nội dung.

## Sự cố cấu hình lượt test đầu

API test được khởi động với DATA_DIR riêng nhưng chưa ghi đè STORAGE_DRIVER=mongo trong .env. Vì vậy các thao tác hướng dẫn ban đầu đã dùng Mongo cục bộ. Hai API này đã được dừng. Các lượt xác nhận sau bắt buộc STORAGE_DRIVER=file, DATA_DIR và TRUST_DIR riêng trong /tmp; đã kiểm tra records.json nằm đúng kho riêng. Script browser và chụp hướng dẫn kiểm health.storage trước khi mở Chrome và từ chối chạy nếu không phải file.

Đối chiếu audit từ 01:47 UTC ngày 24/10/2026 ghi nhận sáu giao dịch có thay đổi nghiệp vụ trong lượt test:

| Thao tác | Hồ sơ bị tác động | Bản ghi |
| --- | --- | --- |
| Giải quyết dispute | CT0019 (DATA_PACK) | Thêm event workflow AP-EV0010 |
| Phê duyệt | CT0103 (SEED) | Thêm event workflow AP-EV0011 |
| Gắn chứng từ demo (hai lần) | MS0416 / CT0104 (SEED) | ATT-00001 và ATT-00002 |
| Đề xuất rồi quyết định ngoại lệ | CT0090 (DATA_PACK) | EXC-0001 |

Có thêm các audit đăng nhập/xem. CSV Data Pack không bị sửa. Audit Mongo được kiểm lại: chain liên tục, 276 entry đã niêm phong tại thời điểm đối chiếu, không có entry hỏng/chưa niêm phong. Không xóa audit hoặc tự hoàn nguyên Mongo dùng chung vì có thể đè trạng thái đang được người khác sử dụng. Bản đối chiếu chi tiết nằm ở /tmp/codecash-ui-test-mongo-audit.json và /tmp/codecash-ui-test-mongo-summary.json; không đưa thông tin xác thực vào báo cáo.

## Đồng bộ base trong monorepo

Bản build đã lộ hai instance i18next do các đường dẫn peer TypeScript khác nhau giữa web và packages/ui. Đã thêm resolve.dedupe ở Vite để chia sẻ runtime, giữ nguyên packages/ui. Browser có bước chuyển sang tiếng Việt và kiểm nút Xuất của base, ngoài kiểm form.

## Kết quả và cách xem

- `pnpm check`: 120 test đạt; typecheck, lint, format và build đạt. Sau chỉnh tooltip, typecheck/lint/format/build được chạy lại.
- Browser smoke: 34 màn/kịch bản đạt trên bản build; thêm kiểm bốn kích thước màn hình và nút base tiếng Việt.
- 66 ảnh gốc + 66 ảnh khoanh vùng, không bước lỗi/điểm khoanh thiếu. Đã kiểm trực quan form, phần tệp, modal quản trị và mobile.
- Hai script browser/guide đã được thử với health giả lập Mongo: đều từ chối trước khi mở Chrome.
- Bản xem riêng: http://localhost:5319 → API 3247, kho file `/tmp/codecash-compact-release-guide`. Chọn tài khoản cán bộ hợp đồng trong menu demo để mở **Tải hợp đồng lên**.
- [Ảnh người ký](../apps/web/public/guide/images/upload-signers.webp), [ảnh tài liệu](../apps/web/public/guide/images/upload-document.webp), [gallery theo vai trò](../playwright-report/guide/roles/index.html), [kết quả máy đọc](../playwright-report/guide/roles/results.json).

Bản UI dùng một nút điền mẫu toàn form, không tự tải tệp hoặc sinh tài liệu khi bấm điền. Tệp là dữ liệu thật: dùng nút tạo DOCX hoặc chọn tệp riêng, rồi kiểm tra preview. Không tự lưu/gửi hay thay nội dung người dùng đã nhập.
