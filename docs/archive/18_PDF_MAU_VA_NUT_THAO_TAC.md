# PDF mẫu và nút thao tác — 24/10/2026

## PDF dùng thử

Đã xuất lại bốn PDF từ chính bytes DOCX hiện tại bằng LibreOffice qua API preview thật, chưa có chữ ký:

| Số người ký | PDF | DOCX chỉnh sửa |
| --- | --- | --- |
| 1 | [Tải PDF](../artifacts/contract-samples/CodeCash-1-signers.pdf) | [Tải DOCX](../artifacts/contract-samples/CodeCash-1-signers.docx) |
| 2 | [Tải PDF](../artifacts/contract-samples/CodeCash-2-signers.pdf) | [Tải DOCX](../artifacts/contract-samples/CodeCash-2-signers.docx) |
| 3 | [Tải PDF](../artifacts/contract-samples/CodeCash-3-signers.pdf) | [Tải DOCX](../artifacts/contract-samples/CodeCash-3-signers.docx) |
| 4 | [Tải PDF](../artifacts/contract-samples/CodeCash-4-signers.pdf) | [Tải DOCX](../artifacts/contract-samples/CodeCash-4-signers.docx) |

[Tải cả bốn PDF trong ZIP](../artifacts/contract-samples/CodeCash-PDF-1-4-nguoi-ky.zip). Manifest trong cùng thư mục ghi nội dung, tên và thứ tự người ký. Các PDF đã được đọc bằng `pdftotext`, đối chiếu tiêu đề và tên từng người; đã xem trực quan trang ký. Bộ artifact được sinh lại, không phải dữ liệu BTC.

Tạo lại bằng `API_BASE_URL=http://127.0.0.1:3247/api/v1 pnpm samples:generate` trên API thử `STORAGE_DRIVER=file`. Script xuất cả DOCX lẫn PDF; không lưu hay kích hoạt hợp đồng. Không có token được truyền vào thì script kiểm driver trước khi đăng nhập demo để tránh dùng nhầm Mongo.

## Quy ước nút theo UniFlow

Không áp dụng một kiểu cho mọi vị trí. Nút thanh công cụ/form như **Thêm mới, Nhập, Xuất, Lưu** giữ icon và chữ; cột thao tác dùng icon nhỏ trên một hàng, có tooltip và tên truy cập bằng bàn phím. Menu hamburger vẫn ghi đầy đủ tên thao tác.

Trước đây `Space wrap` kèm hai nhãn dài trong từng hàng làm cột thao tác rộng 240–300 px và đẩy nút xuống dòng. Nay dùng `TableRowActions` tại app: 104 px cho cụm hai nút, 72 px cho một nút, không wrap. Áp dụng cho quản trị tài nguyên, hợp đồng, việc cần làm, ngoại lệ, nhật ký, dữ liệu, phân quyền và phiên bản rule. Giữ nguyên quyền và handler/API. Không sửa `packages/ui`; dùng native Ant Design Button để giữ Enter/Space, focus và aria-label, kết hợp tooltip/menu theo cách trình bày của base.

Đã kiểm trực tiếp **Thêm mới** ở sáng và tối: chữ trắng `rgb(255,255,255)` trên nền xanh `rgb(49,91,234)`, nhãn còn nguyên và mở đúng form. Các nút Nhập/Xuất/Bộ lọc/Làm mới có nhãn. Không xác nhận lỗi trắng nhãn còn tồn tại trên bản build hiện tại; ảnh mới và số đo màu là bằng chứng, tránh thay CSS base khi chưa tái hiện lỗi.

## Kiểm chứng

- `pnpm check`: 120 test, typecheck/lint/format/build đạt.
- Browser smoke: 34 màn/kịch bản đạt; kiểm cụm icon có aria-label, cùng hàng, chiều rộng/chiều cao gọn và nhãn toolbar không trùng màu nền.
- Kiểm thêm menu có chữ và tooltip mở bằng focus bàn phím; nhãn Thêm mới ở cả sáng/tối.
- Bộ hướng dẫn đã chụp lại 66 ảnh gốc và 66 ảnh khoanh vùng. [Gallery theo vai trò](../playwright-report/guide/roles/index.html).
- [Ảnh sáng](../artifacts/browser/table-actions-light.png), [ảnh tối](../artifacts/browser/table-actions-dark.png), [ảnh quản trị có khoanh vùng](../apps/web/public/guide/images/admin-organizations.webp).

Bản xem vẫn tại http://localhost:5319. Tải lại trang để nhận bundle mới. Các lượt kiểm tra trong đợt này dùng kho file riêng trong /tmp.
