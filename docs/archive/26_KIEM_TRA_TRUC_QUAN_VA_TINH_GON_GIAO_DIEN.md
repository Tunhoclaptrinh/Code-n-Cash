# Kiểm tra trực quan và tinh gọn giao diện — 25/10/2026

## Những điểm tìm thấy và đã sửa

Browser smoke kiểm được hành vi nhưng không kết luận giao diện đã đẹp. Lượt này xem thêm ảnh thực ở desktop 1440×900, laptop 1280×720, tablet 768×1024 và điện thoại 390×844, cả sáng/tối và đúng tài khoản từng vai trò.

| Quan sát trên giao diện | Điều chỉnh | Lý do |
| --- | --- | --- |
| Bộ mẫu trong hướng dẫn chiếm phần lớn chiều cao điện thoại; tiêu đề “Bắt đầu và đăng nhập” bị đẩy xuống | Giữ bốn nút PDF và ZIP; thu hướng dẫn chọn nhà cung cấp/tài khoản vào **Cách dùng và tài khoản người ký** | Vẫn tải được ngay; thông tin dài mở khi cần, phần hướng dẫn chính xuất hiện sớm hơn |
| Thống kê danh sách xếp một cột, phải cuộn khá xa mới thấy dòng hợp đồng | Dùng `StatisticsItem.colSpan` của base để xếp hai cột trên mobile; ô lẻ cuối danh sách hợp đồng chiếm hàng riêng | Giảm chiều cao mà không thu nhỏ chữ, không thay base và vẫn giữ thao tác bấm để lọc |
| Màn truy vết lặp “Mốc 3 · Nghiệm thu” ngay dưới breadcrumb | Tiêu đề trang giữ ở breadcrumb; thẻ kết quả lấy lý do quyết định làm tiêu đề | Người xem đọc ngay vì sao HOLD/PENALTY; giảm lặp, không sửa quyết định hay công thức |
| Màn ký và đặt vị trí có thêm `h1` trong nội dung | Chuyển tiêu đề khối thành `h2`, giảm cỡ hợp lý, cho hàng trạng thái xuống dòng | Mỗi trang có một tiêu đề chính, giữ thứ bậc nội dung và tránh ép tên dài |
| Laptop cao 720 px có thể cắt trang PDF/nút tiếp tục | Tính chiều cao theo vùng còn lại; cho phép chế độ vừa trang xuống 25%; danh sách bên phải cuộn riêng, hàng thao tác giữ ở đáy | Luôn tìm được nút tiếp tục; trang PDF vừa chiều cao, vẫn có thể phóng to để chỉnh chi tiết |
| Chú thích và metadata quá nhạt, nhất là ở giao diện tối | Ánh xạ token `--text-muted` của app sang `--color-text-muted` hiện có | Tăng độ rõ bằng bảng màu hiện có; không chỉnh mã trong `packages/ui` |

Các thay đổi chỉ tác động trình bày, thứ bậc nội dung và vùng cuộn. API/engine, quyền, công thức, tiền, Data Pack và kiểm tra vùng ký đúng người giữ nguyên.

## Kiểm tra và minh chứng

- `pnpm check`: typecheck, lint, format, production build và 148 test (77 Python, 71 Node).
- `scripts/browser-smoke.mjs`: đạt 36 màn/kịch bản; kiểm 1.430 nút trong 82 ngữ cảnh không phát hiện lỗi theo tiêu chí hiện có. Bao gồm sáng/tối, mobile, chuyển ngôn ngữ, form trống/điền mẫu, quản trị mẫu/rule và nghiệp vụ.
- `scripts/visual-review.mjs`: đạt chín màn × bốn kích thước × hai theme = 72 trạng thái, không thiếu ảnh/không lỗi kiểm tra. Dùng tài khoản chủ hợp đồng, cán bộ hợp đồng, nhà cung cấp và quản trị; vùng ký dùng PDF thật. Kiểm tràn ngang, một tiêu đề chính, vị trí nội dung hướng dẫn/bảng hợp đồng và nút tiếp tục/trang PDF trên laptop. Danh sách phiên bản rule trên fixture mới rỗng là trạng thái hợp lệ; chờ nút tạo phiên bản thay vì giả định luôn có dòng dữ liệu.
- `scripts/refinement-smoke.mjs`: kiểm PDF phản ánh nội dung form, bốn download/ZIP, gợi ý đúng tên, API từ chối sai người, tài khoản demo, guide drawer, mobile; bổ sung mở/đóng phần tài khoản ký của bộ mẫu.
- Chụp lại 72 ảnh hướng dẫn và bảy ảnh kiểm tra PDF; giữ ảnh gốc và ảnh khoanh vùng, cập nhật hướng dẫn Việt/Anh.

Báo cáo trực quan: `playwright-report/visual-review/index.html`; dữ liệu đo từng màn: `layout-audit.json`; danh sách chụp/thiếu/lỗi: `results.json`. Kiểm tra PDF riêng ở `playwright-report/refinement/index.html`. Các thư mục báo cáo được tạo cục bộ, không chứa khóa API và không được coi là kết quả kiểm chứng production.

## Chạy lại trên fixture riêng

Khởi động API với `STORAGE_DRIVER=file`, `EXTRACTION_PROVIDER=local`, `DATA_DIR`/`TRUST_DIR` riêng trong `/tmp`, ví dụ cổng 3311. Trước lượt visual, tạo CT0105 có PDF thực bằng:

```bash
API_BASE_URL=http://127.0.0.1:3311/api/v1 REAL_CONTRACT_COUNTS=3 node scripts/real-contract-smoke.mjs
WEB_URL=http://127.0.0.1:3311 VISUAL_ASSERT=1 node scripts/visual-review.mjs
```

Không dùng chung fixture với browser smoke hoặc script hướng dẫn vì các script đó có phê duyệt, ký và thay dữ liệu kịch bản. Lượt kiểm tra trực quan không gọi Gemini. PDF ở chế độ vừa trang có thể nhỏ trên laptop; dùng nút phóng to để đọc/chỉnh vùng ký. Các kiểm tra trên là phạm vi đã chạy, không bảo đảm mọi trình duyệt, thiết bị hoặc tài liệu tùy ý đều có cùng bố cục.
