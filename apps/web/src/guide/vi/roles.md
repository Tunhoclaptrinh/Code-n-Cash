# Vai trò, phạm vi và kịch bản thử

Quyền trong CodeCash gắn với người đã đăng nhập, tổ chức và vai trò của người đó. Chọn tài khoản khác giúp thử cả luồng bàn giao, chứ không chỉ đổi tên hiển thị.

## Chọn người theo việc cần thử

| Tài khoản demo           | Vai trò                 | Việc nên thử trên dữ liệu mới                                          |
| ------------------------ | ----------------------- | ---------------------------------------------------------------------- |
| `owner@novaan.vn`        | Chủ hợp đồng            | Đóng tranh chấp CT0019 mốc 3; duyệt chi theo chính sách; soạn hợp đồng |
| `finance@novaan.vn`      | Phê duyệt tài chính     | Duyệt CT0103 mốc 2; chuyển kế toán CT0103 mốc 1                        |
| `secondary@novaan.vn`    | Phê duyệt cấp 2         | Chờ NCC ký CT0102, rồi ký bước cuối và duyệt mốc theo chính sách       |
| `legal@novaan.vn`        | Cán bộ hợp đồng bên mua | Hồ sơ CT0101; nghiệm thu CT0084 mốc 3; chứng từ bên mua                |
| `supplier@phuminh.vn`    | Nhà cung cấp            | Chứng từ CT0104 mốc 2; ký CT0102                                       |
| `admin@codecash.vn`      | Kiểm soát viên          | Đề xuất vô hiệu sự kiện sai thẩm quyền CT0090 mốc 3                    |
| `controller@codecash.vn` | Kiểm soát viên thứ hai  | Duyệt đề xuất của người kiểm soát thứ nhất                             |
| `sysadmin@codecash.vn`   | Quản trị hệ thống       | Quản lý tài khoản, tổ chức và bản ghi cấu hình được phép sửa           |
| `auditor@codecash.vn`    | Kiểm toán               | Xem toàn hệ thống, kiểm tra toàn vẹn, xuất dữ liệu                     |

Hai tài khoản kiểm soát cùng vai trò nhưng là hai người khác nhau. Hệ thống có **8 vai trò**, không phải 9 vai trò.

## Đọc menu theo vai trò

![Menu của chủ hợp đồng](../../../public/guide/images/nav-owner.webp)

Chủ hợp đồng, tài chính, phê duyệt cấp 2 và cán bộ hợp đồng xem hợp đồng của bên mua mình. Chỉ chủ hợp đồng và cán bộ hợp đồng thấy bản nháp. NCC chỉ thấy hợp đồng mình tham gia và không thấy bản nháp bên mua. Không thể mở mã hợp đồng của tổ chức khác để vượt phạm vi.

![Menu nhà cung cấp](../../../public/guide/images/nav-supplier.webp)

NCC nộp giao hàng, hoá đơn, hoàn thành dịch vụ và các loại chứng từ thuộc bên mình. Cán bộ hợp đồng nộp nghiệm thu, UAT và chứng từ thuộc bên mua. Người phê duyệt tạo phê duyệt theo vai trò trong chính sách; quyền ký hợp đồng được gán riêng theo từng bước.

## Ba vai trò nội bộ

![Menu kiểm soát viên](../../../public/guide/images/nav-admin.webp)

- **Kiểm soát viên:** xem mọi hợp đồng, đề xuất và duyệt ngoại lệ BR-19; không duyệt chi, không quản lý tài khoản.
- **Quản trị hệ thống:** quản lý cấu hình và tài khoản; không xử lý ngoại lệ hoặc ghi nghiệp vụ thanh toán.
- **Kiểm toán:** chỉ đọc, có thể kiểm tra toàn vẹn và xuất dữ liệu; không được ghi nghiệp vụ hoặc chạy đánh giá để lưu kết quả mới.

![Menu quản trị hệ thống](../../../public/guide/images/nav-sysadmin.webp)

![Menu kiểm toán](../../../public/guide/images/nav-auditor.webp)

## Phân biệt bốn hành động dễ nhầm

| Hành động      | Tác dụng                                                    | Người thực hiện                    |
| -------------- | ----------------------------------------------------------- | ---------------------------------- |
| Ký hợp đồng    | Hoàn tất chữ ký theo thứ tự; chữ ký cuối kích hoạt hợp đồng | Người được gán ở bước ký hiện tại  |
| Nộp chứng từ   | Thêm bằng chứng đúng loại và đúng bên                       | Cán bộ hợp đồng hoặc NCC           |
| Phê duyệt chi  | Bổ sung phê duyệt còn thiếu để engine đánh giá              | Vai trò phê duyệt trong chính sách |
| Chuyển kế toán | Ghi nhận bàn giao khoản đủ điều kiện chi, khoá mốc          | Phê duyệt tài chính                |

## Cách demo việc bàn giao

1. Dùng NCC nộp chứng từ CT0104 mốc 2.
2. Đăng xuất, đăng nhập chủ hợp đồng: việc phê duyệt tương ứng xuất hiện.
3. Sau khi duyệt, xem quyết định và tiền phạt; ngày trễ phụ thuộc ngày nộp thực tế.
4. Đăng nhập tài chính để chuyển mốc đủ điều kiện sang kế toán.

> **Khi bị từ chối quyền:** kiểm tra tổ chức, vai trò và thứ tự ký. Đổi sang đúng tài khoản được giao; không gán cho một tài khoản nhiều trách nhiệm chỉ để vượt kiểm soát. Một người không thể tự đề xuất rồi tự duyệt ngoại lệ.
