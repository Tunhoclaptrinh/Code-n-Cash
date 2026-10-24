# Đồng bộ nút và mật độ giao diện — 25/10/2026

## Vấn đề đã tìm thấy

Theme base đặt nút mặc định 38 px; CSS app đặt `small` 32 px và `large` 44 px. Vì vậy hai nút có cùng vai trò có thể khác chiều cao, cỡ chữ và bo góc. Một số link quay lại tự vẽ cao 40 px, đứng cạnh nút Ant Design 44 px. Màn quản trị mẫu vẫn có các nút Lên/Xuống/Bỏ có khung và chữ dài, trong khi màn tạo hợp đồng đã dùng icon trực tiếp.

## Chuẩn đang áp dụng

| Vị trí | Quy ước |
| --- | --- |
| Thanh công cụ, form, modal, hành động nghiệp vụ | Cao 32 px, chữ 13 px, bo góc 6 px, khoảng icon/chữ 6 px. Nút mặc định và `small` cùng kích thước. |
| Thêm mới, Nhập, Xuất, Lưu, Tải tài liệu | Có chữ rõ ràng; hành động chính dùng primary, hủy/quay lại dùng secondary. |
| Thao tác bảng | Icon nhỏ có tooltip/aria-label, cùng hàng; menu hamburger có chữ trong từng mục. |
| Sắp xếp người ký/vai trò ký | Dùng chung `SignerOrderActions`: mũi tên trực tiếp, xóa link đỏ không khung. Vô hiệu hóa lên ở đầu và xuống ở cuối. |
| Đăng nhập và chào lần đầu | Giữ nút lớn 44 px có chủ đích; đây là các màn tập trung vào một hành động. |
| Mô phỏng điện thoại ký | Giữ kích thước chạm của giao diện điện thoại; không áp nút toolbar desktop lên màn thiết bị. |

Ứng dụng truyền `actionTheme` qua ConfigProvider bên trong UiProvider, chỉ đổi token Button; không giảm đồng loạt kích thước trường nhập và không sửa `packages/ui`. Các link nghiệp vụ tự vẽ được đưa về cùng chiều cao/cỡ chữ. Form cấu hình vai trò ký chuyển từ các dòng wrap sang grid 24 px → Select co giãn → cụm icon cố định.

## Nạp dữ liệu thực

**Nạp đề xuất** ở màn rà soát tài liệu là nút nghiệp vụ riêng, dùng kết quả bộ trích xuất đọc từ bytes tài liệu đã tải lên. Không dùng biểu tượng/tooltip điền dữ liệu demo cho thao tác này. Chỉ điền các ô trống, giữ nội dung người dùng đã nhập; không có đề xuất thì nút bị vô hiệu hóa. Người dùng vẫn xác nhận trước khi khóa điều khoản.

Không thêm mô phỏng AI. Bộ trích xuất hiện vẫn là `LocalTermExtractor`, chưa gọi Gemini. Sinh DOCX, render PDF, đọc tệp, lưu bytes/hash và xác nhận đề xuất vẫn dùng các luồng thực hiện có.

## Kiểm chứng

`scripts/lib/button-audit.mjs` đo cả chiều cao thực tế bên cạnh kiểm nút rỗng, độ tương phản và tên thao tác. Nút Ant Design thường/nhỏ phải đạt 32 px; lớn có chủ đích 44 px; IconButton của base giữ 30 px. Kiểm trên ứng dụng chạy thật, sáng/tối, các trang và modal. Đây là kiểm lỗi hiển thị, không phải chứng nhận đầy đủ về khả năng truy cập.

Chạy `pnpm check`, browser smoke trên kho file riêng và chụp lại ảnh hướng dẫn. Kết quả từng ngữ cảnh ở [button-audit.json](../artifacts/browser/button-audit.json); ảnh và gallery ở [hướng dẫn theo vai trò](../playwright-report/guide/roles/index.html). Không dùng dữ liệu Mongo/hồ sơ người dùng để dựng kịch bản kiểm.

Phương án AI được tách riêng tại [23 — Ứng dụng Gemini](23_DE_XUAT_UNG_DUNG_GEMINI.md).


Kết quả trên bản này: `pnpm check` đạt **140 test** (77 Python + 63 foundation/API), typecheck/lint/format/build đạt. Browser smoke đạt **36 màn/kịch bản**; đo **82 ngữ cảnh** sáng/tối ở 390 và 1440 px, **1.424 lượt quan sát nút**, không phát hiện lỗi theo bộ đo. Các nút nghiệp vụ được quan sát đều cao 32 px. Thứ tự/người ký được kiểm thêm bố cục tại 1024 và 1280 px trong cùng bộ browser. Giữ bản demo người dùng ở cổng 5353; dữ liệu kiểm thử được tách riêng.

Hướng dẫn đã chụp lại **72 ảnh** từ bản UI này, giữ ảnh gốc và khoanh vùng; 0 bước lỗi, 0 đánh dấu thiếu. Gallery có đủ 72 mục theo vai trò.
