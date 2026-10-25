# Rà soát bố cục toàn ứng dụng — 25/10/2026

## Phát hiện và cách xử lý

| Khu vực | Vấn đề quan sát trên ảnh thật | Điều chỉnh |
| --- | --- | --- |
| Kiểm tra chữ ký | Màn 390 px vẫn có hai cột, bộ chọn rộng tối thiểu 320 px, nút xem mốc bị xuống dòng nhiều và trang tràn ngang | Một cột dưới 1100 px; bộ chọn co theo khung; thông báo và nút xếp lại trên mobile; trường dài được ngắt dòng |
| Phê duyệt, nộp chứng từ, tranh chấp | Tiêu đề nội dung lặp ý với breadcrumb; trạng thái chiếm thêm hàng | Giữ một tiêu đề mô tả đúng hành động, đưa trạng thái lên cạnh tiêu đề, giữ dòng ngữ cảnh hợp đồng/bên tham gia |
| Thẻ nghiệp vụ | Padding 22×28 px ở nhiều khối, khoảng trống lớn khi xếp cột trên điện thoại | Đồng bộ padding chủ yếu 16×20 px, tiêu đề khối 18 px; giữ kích thước nút 32 px và chữ nội dung |
| Trích xuất | Lặp thẻ mở tài liệu trước tiến trình; mã SHA-256 dài và khoảng trống đoạn trích chiếm diện tích | Mở/đọc/tải tệp tại thẻ trích xuất; hash có thể mở rộng và sao chép; giữ đoạn trích, lỗi và cảnh báo trực tiếp |
| Bản số hóa, tranh chấp | Hai khối cao khác nhau bị kéo bằng nhau, gây khoảng trắng thừa | Căn đầu các cột theo chiều cao nội dung; tên, tác giả và tệp dài được xuống dòng |
| Phê duyệt trên điện thoại | Nhãn chứng từ nằm trên cùng một hàng, ép tên tệp vào cột hẹp và làm trang tràn ngang | Cho nhãn/thẻ xuống dòng; giữ chiều rộng tối thiểu phần tên tệp và dự phòng khoảng cho bộ đếm ghi chú |
| Phê duyệt, chứng từ, tranh chấp ở theme tối | Nền pastel viết cứng theo theme sáng trong khi chữ đã đổi sang sáng, dẫn đến gần như mất nhãn | Tính nền/viền từ token ngữ nghĩa và màu surface hiện tại, không sửa theme hay component base |

Chỉ sửa tại `apps/web`, dùng props/CSS module và component ngữ cảnh chung `WorkflowContext`. Không sửa base `packages/ui`, cấu hình phân quyền, API, công thức hay Data Pack. Giữ các thao tác hàng dạng icon có tooltip/aria-label và menu hamburger; nút trên form/thanh công cụ vẫn có chữ. Khung PDF đặt chữ ký vẫn ưu tiên chiều rộng và có chế độ mở rộng, không thu nhỏ để làm trang trông gọn.

Trình tự đọc PDF → trích xuất → đối chiếu sáu trường → xác nhận vẫn giữ nguyên. Thu gọn hash chỉ thay cách trình bày, không bỏ đối chiếu tài liệu hay thay điều kiện khóa hồ sơ. Các giới hạn mô phỏng chữ ký/CA vẫn hiển thị.

## Chụp nhanh và kiểm chứng

`scripts/visual-review.mjs` mở rộng từ 9 lên 18 màn: việc cần làm, hợp đồng, tải lên, vị trí ký, quyết định, hướng dẫn, ký, phiên bản luật, tổ chức, chi tiết hợp đồng, phê duyệt, tranh chấp, số hóa, kiểm tra chữ ký, chứng từ, nhật ký, phân quyền và mẫu hợp đồng. Mỗi màn được chụp ở 1440×900, 1280×720, 768×1024 và 390×844, cả sáng/tối.

Có thể chụp nhanh một nhóm thay vì chạy toàn bộ:

```bash
VISUAL_CASES=approval,dispute,verification VISUAL_WIDTHS=1440,390 \
  VISUAL_THEMES=light VISUAL_OUT=playwright-report/review-quick \
  VISUAL_ASSERT=1 node scripts/visual-review.mjs
```

Chỉ chạy với fixture file riêng đã có CT0105 PDF thật như hướng dẫn đầu script; không chạy script tạo/sửa dữ liệu thử trên production. Script xuất ảnh gốc, gallery theo vai trò, `results.json` và `layout-audit.json`. Kiểm tự động phát hiện tràn ngang, thiếu tiêu đề, nút thiếu nhãn và kích thước khung PDF; đánh giá độ dễ đọc và bố cục vẫn cần mở ảnh thật. Hướng dẫn và ảnh khoanh vùng được chụp lại bằng các script `guide-screenshots.mjs` và `refinement-smoke.mjs`.

Kết quả kiểm chứng trong đợt này:

- Typecheck, lint không warning, kiểm định dạng và build đều đạt; 148 test nền tảng đạt (77 Python, 71 Node).
- Browser smoke đạt 36 màn/kịch bản; luồng PDF thật và đọc/trích xuất có 11 ảnh kiểm chứng, gồm cả trường hợp lệch tên người ký bị từ chối.
- Bộ 144 bố cục đạt, không thiếu ảnh/không có lỗi đo được. Mở ảnh đại diện phê duyệt, tranh chấp, số hóa và kiểm tra chữ ký để kiểm trực quan, gồm các ca mobile/theme tối đã phát hiện lỗi.
- Chụp lại 72 ảnh hướng dẫn; hai ảnh tranh chấp được làm mới thêm sau khi chỉnh khoảng trống bộ đếm. Các ảnh gốc và báo cáo theo vai trò nằm trong `playwright-report/guide`, `playwright-report/refinement` và `playwright-report/visual-review` (không đưa dữ liệu test vào Git).

Các kiểm thử dùng dữ liệu file riêng trong `/tmp` và extractor local. Kết quả này xác nhận bản build và luồng cục bộ; không phải xác nhận bản Render đã cập nhật hay chất lượng một provider ký/AI chưa tích hợp.
