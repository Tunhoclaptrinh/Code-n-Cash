# Phân quyền và xem tài liệu thực — 24/10/2026

## Kết luận đối chiếu

Không nên khẳng định tên vai trò trên UI là do đề bắt buộc. Mục 17 của đặc tả nội bộ được đánh dấu **THIẾT KẾ (A20)**: đội tự thiết kế người dùng hệ thống. Lớp bắt buộc là ma trận thẩm quyền tạo sự kiện theo Data Pack (mục 4.2) và các điều kiện engine, kiểm tra đúng bên/đúng hợp đồng/ACTIVE. Xem `docs/04_DAC_TA_NGHIEP_VU.md`, mục 4.2 và 17.

| Phần | Có thể linh hoạt | Ràng buộc giữ ở server |
| --- | --- | --- |
| Nhãn vai trò, menu và phân công người | Có | Không suy quyền từ menu hoặc request do client gửi |
| Quyền màn hình/chức năng | Có thể cấu hình thông qua `packages/contracts/permissions.json` và triển khai lại | API dùng cùng ma trận để kiểm tra quyền; web chỉ quyết định hiển thị |
| Phạm vi all/org/own/assigned | Có mô hình phạm vi | Truy cập bản ghi phải kiểm tổ chức/hợp đồng/người được gán |
| Thẩm quyền tạo event | Theo ma trận đề/Data Pack | Không cho quyền CRUD hoặc role tùy biến vượt qua điều kiện engine |
| Ngoại lệ | Phân công kiểm soát viên | Hai người khác nhau; không tự duyệt; không là bên hợp đồng |
| Quản trị cấu hình | Có thể thêm người quản trị | Tách quản trị khỏi xử lý ngoại lệ; người thứ hai duyệt phiên bản |
| Kiểm toán | Chọn người đọc | Không ghi/sửa quyết định và audit |

Hiện hệ thống dùng ma trận tĩnh; chưa có trình cấp quyền động qua UI. Tính năng đó có thể bổ sung nhưng phải kiểm phạm vi và ràng buộc nghiệp vụ độc lập với grant. Không nên đưa tùy chọn “toàn quyền” để bỏ qua engine, SoD hoặc sửa quyết định.

Đường dẫn tham khảo `/run/media/tuans-ubuntu/Data_65/Base` không hiện diện trong phiên làm việc này. Ổ đang mount là `Volume_89`; chưa tìm thấy bản Base tương ứng. Vì vậy chưa có kết luận đã đối chiếu backend/web của Base đó, và chưa sao chép cơ chế phân quyền từ nguồn này.

## Hướng dẫn và ảnh dọc

Ảnh trong bài viết giới hạn theo chiều cao viewport, giữ tỷ lệ (`object-fit: contain`) và bấm để phóng to. Trang hướng dẫn có vùng cuộn nội dung riêng, giữ chỗ cho scrollbar; drawer hướng dẫn cũng có scrollbar. Ảnh dọc không còn kéo toàn bộ bài thành ảnh rất dài.

Script cập nhật: `scripts/guide-screenshots.mjs` (`pnpm guide:screenshots`). Script chụp UI thật bằng Chrome/CDP, đánh khung đỏ và số, tạo manifest cùng báo cáo có các bước lỗi/đánh dấu không tìm thấy. Chạy trên kho dữ liệu kiểm thử mới vì script thực hiện phê duyệt/ký/giải quyết tranh chấp. Không chạy với kho demo đang trình diễn. Ảnh cũ được sao lưu trong `/tmp/codecash-guide-before-preview` cho đợt này.

## Preview thực

- PDF được hiển thị từ bytes của tệp. DOCX được LibreOffice chuyển thành PDF trong thư mục/profile tạm, có timeout và dọn tệp sau khi hoàn thành.
- Chọn tệp hoặc tạo DOCX mẫu tại trang tải hợp đồng để xem. Chi tiết hợp đồng có tab **Tài liệu gốc** để xem tài liệu đã lưu.
- Endpoint `contract-files` kiểm quyền tham gia hợp đồng trước khi liệt kê/xem tệp, kể cả nhà cung cấp không có quyền thư viện tài liệu toàn cục. API preview tài liệu đã lưu kiểm hash trước khi trả PDF; truy cập local preview cần quyền upload. Không dùng URL chứa access token.
- Bản PDF kết xuất không thay đổi tệp gốc, hash hoặc chữ ký gốc. Hợp đồng Data Pack không kèm bytes tài liệu phải hiển thị chưa có tệp, không tạo bản minh họa để giả làm tài liệu thật.
- Máy chạy API cần LibreOffice Writer và fonts; Dockerfile đã thêm dependency. Khi không kết xuất được, UI báo lỗi thay vì hiện sơ đồ như tài liệu thật.
- Canvas gán tọa độ ký chuyên biệt vẫn là thành phần workflow riêng. Preview thực chưa đồng nghĩa đã đóng chữ ký CA/PAdES vào PDF; tích hợp đó vẫn cần adapter và kiểm chứng riêng.

## Kết quả xác minh

`pnpm check` đạt 107 test (53 Python + 54 test nền tảng), bao gồm render PDF bằng LibreOffice và kiểm tra phạm vi tệp. Browser smoke đạt 34 màn/kịch bản, có kiểm tra chiều cao ảnh và vùng cuộn hướng dẫn. Đã chụp lại 64 ảnh: manifest không có bước lỗi hoặc thiếu đánh dấu. Báo cáo ảnh ở `playwright-report/guide/index.html`; bộ ảnh theo vai trò ở `playwright-report/guide/roles.html`. Bản xem thử cách ly ở cổng 5300; xem thêm thay đổi mẫu động/phụ lục tại tài liệu 13.
