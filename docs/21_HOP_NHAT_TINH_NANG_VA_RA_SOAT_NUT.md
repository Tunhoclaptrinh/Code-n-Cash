# Hợp nhất tính năng và rà soát nút — 25/10/2026

## Phạm vi và lựa chọn

Nhánh `feat/monorepo-antd-foundation` có commit local `6de989e` chưa vào nhánh trình soạn rule. Nền monorepo/Ant Design đã có trên main; phần còn thiếu là các cải tiến nghiệp vụ/UI tiếp theo. Hợp nhất bằng merge có xử lý từng phần giao nhau, không lấy nguyên một nhánh đè lên nhánh kia.

| Phần | Lựa chọn và lý do |
| --- | --- |
| Mẫu hợp đồng | Nhập CRUD mẫu động, quyền riêng, bật/tắt, phiên bản/snapshot và danh mục chọn mẫu. Quản trị sửa mẫu không viết lại hồ sơ cũ. |
| Hồ sơ/tài liệu | Nhập form trống, một nút điền mẫu các ô trống, hợp đồng 1–4 người ký, sinh DOCX/PDF thật, lưu bytes/hash, preview thật và bằng chứng ký. |
| Bảng thao tác | Giữ cụm icon nhỏ cùng hàng, tooltip/aria-label; menu hamburger. Không thêm các nhãn dài vào từng hàng. |
| Thanh công cụ/form | Giữ nhãn chữ của Thêm mới, Nhập, Xuất, Lưu, Tải lên. Không chuyển đồng loạt thành nút chỉ icon. |
| Menu người ký | Giữ nút **Thao tác** có chữ; đổi icon ba chấm còn sót thành hamburger. |
| Trình soạn rule | Giữ bố cục chọn phạm vi → thứ tự rule → biểu thức/công thức, từ điển biến và bảng tác động dễ đọc hiện tại; nhập thêm nút điền mẫu cho form tạo phiên bản. |
| Kiểm tra công thức | Giữ bộ kiểm kiểu/đơn vị/phần trăm/ngày nguyên, Decimal, runtime và rollback mới hơn. Nhập policy `BTC_FULL_PACK_V1` và đối chiếu hash cấu hình trước khi phát hành; giữ kiểm đủ 405 mốc, mẫu, trạng thái, lý do và số tiền. |
| Hướng dẫn | Kết hợp hướng dẫn mẫu động với phần công thức mới; ảnh chụp từ bản hợp nhất, có ảnh gốc và khoanh vùng. |

Không sửa component base trong `packages/ui`. Thay đổi mở rộng đặt tại app và sử dụng API/handler nghiệp vụ; không quyết định thanh toán ở trình duyệt. Bản sửa riêng của người dùng tại tài liệu 03 được giữ nguyên nội dung và để ngoài commit hợp nhất.

## Cách rà nút

`scripts/lib/button-audit.mjs` được gọi từ browser smoke trên trang thực, ở cả sáng và tối. Kiểm nút đang hiển thị và được phép bấm: có chữ hoặc glyph, màu nội dung so với nền tổng hợp qua các phần tử cha, nhãn truy cập của thao tác bảng. Ngưỡng tương phản 1.5 chỉ nhằm bắt lỗi gần như mất nội dung; đây không phải chứng nhận WCAG. Nút disabled không bị ép sáng như nút đang dùng.

Đồng thời kiểm thanh công cụ có chữ, cụm thao tác bảng không xuống dòng, giới hạn kích thước, bố cục desktop/mobile và các handler thật. Ảnh sáng/tối lưu trong `artifacts/browser/buttons-*.png`; dữ liệu từng lần quan sát ở [button-audit.json](../artifacts/browser/button-audit.json).

## Kết quả kiểm chứng

- Typecheck, lint, format và build đạt; **140 test** đạt (77 Python + 63 foundation/API). Có kiểm tạo mẫu, pin phiên bản, xóa mẫu, DOCX/PDF, ký tuần tự 1–4 người, quyền, rollback và công thức.
- Browser smoke: **36 màn/kịch bản**, desktop/mobile; **52 ngữ cảnh sáng/tối**, tổng **907 lượt quan sát nút**, 0 lỗi theo bộ kiểm trên. Đây là số lượt quan sát, không phải 907 nút khác nhau. Kiểm riêng trình soạn rule cũng đạt.
- HTTP smoke đạt: quyền, CRUD, mẫu động, version cũ, payload rule đầy đủ, preview và nghiệp vụ. Kiểm bổ sung giới hạn JSON 4 MB và JSON sai trả mã lỗi đúng.
- Rà Data Pack: đủ **405 mốc**, **22 cột**, khớp **20/20 mẫu**, 0 lỗi bất biến; 348 RELEASE, 15 PENALTY, 36 HOLD, 6 REJECT. Hash nguồn khớp manifest BTC. [Báo cáo](../artifacts/integration-review/btc-review.json).
- Hướng dẫn có **72 ảnh**, 0 bước lỗi, 0 đánh dấu thiếu. [Gallery theo vai trò](../playwright-report/guide/roles/index.html), [manifest](../apps/web/public/guide/images/manifest.json). Ảnh có thay đổi menu người ký được chụp lại sau khi đổi icon.
- Bộ mẫu đã sinh lại: [PDF 1 người](../artifacts/contract-samples/CodeCash-1-signers.pdf), [2 người](../artifacts/contract-samples/CodeCash-2-signers.pdf), [3 người](../artifacts/contract-samples/CodeCash-3-signers.pdf), [4 người](../artifacts/contract-samples/CodeCash-4-signers.pdf), [ZIP](../artifacts/contract-samples/CodeCash-PDF-1-4-nguoi-ky.zip). Tệp chưa ký, là dữ liệu dùng thử của đội.

Các kiểm thử ghi dữ liệu dùng API `STORAGE_DRIVER=file` và kho mới trong `/tmp`; không chạy vào Mongo hay hồ sơ người dùng. Script browser chọn trực tiếp nội dung textarea trước khi nhập để tránh Ctrl+A chọn sai vùng và báo lỗi cú pháp không đúng kịch bản kiểm.

Giới hạn nghiệp vụ/tích hợp vẫn theo tài liệu [13](13_MAU_HOP_DONG_DONG_VA_TICH_HOP_KY.md) và [15](15_XAC_NHAN_BTC_VA_GIA_DINH.md): vị trí ký là sơ đồ quy ước, chưa có CA/PAdES/OCR scan hoàn chỉnh; kết quả public/baseline không xác nhận ground truth ẩn.
