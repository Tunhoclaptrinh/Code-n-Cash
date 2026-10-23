# Quản trị hệ thống và ma trận quyền

Quản trị hệ thống dùng tài khoản `sysadmin@codecash.vn`; kiểm toán có quyền đọc và xuất. Vai trò này tách khỏi người xử lý ngoại lệ và người duyệt chi.

![Quản trị: 1 — giới hạn bản ghi; 2 — tab; 3 — thêm; 4 — nhập; 5 — xuất; 6 — nguồn; 7 — thao tác](../../../public/guide/images/admin-organizations.webp)

## Chọn đúng tài nguyên

Các tab quản lý tổ chức, người dùng, hồ sơ hợp đồng, mẫu mốc, tham số, tài liệu và nhật ký quản trị. Đổi tab bắt đầu trạng thái tìm/lọc mới. Xem nhãn nguồn trước khi sửa: bản ghi Data Pack và bản ghi do luồng nghiệp vụ quản lý chỉ được xem/xuất, không sửa trực tiếp tại đây.

Hợp đồng nghiệp vụ phải thay đổi tại các trang hợp đồng, số hoá, ký, nộp hoặc phê duyệt. Không dùng bảng tài nguyên để sửa quyết định, trạng thái hay nhật ký.

## Thêm và sửa bản ghi được phép

1. Chọn tab rồi bấm **Thêm mới**.
2. Điền trường bắt buộc; trường tham chiếu cho phép tìm tổ chức hoặc bản ghi liên quan.
3. Kiểm tra loại tổ chức và vai trò, đặc biệt với người dùng.
4. Lưu, đợi phản hồi và kiểm tra dòng vừa tạo.
5. Để sửa, dùng biểu tượng sửa của dòng được phép; bản ghi bị quản lý chỉ hiện xem.

![Biểu mẫu thêm tổ chức](../../../public/guide/images/admin-create.webp)

## Nhập hàng loạt

![Nhập tài nguyên: tệp mẫu và xem trước](../../../public/guide/images/admin-import.webp)

Tải mẫu của đúng tài nguyên, điền cột theo mẫu rồi chọn tệp. Xem trước từng dòng và lỗi kiểu dữ liệu/tham chiếu trước khi xác nhận nhập. Chỉ nhập các dòng hợp lệ theo màn hình; kiểm tra tổng dòng thành công và thất bại sau khi chạy. Xuất dữ liệu trước nếu cần đối chiếu thay đổi.

Nhập tài nguyên quản trị khác với tải Data Pack để engine đánh giá. Hai chức năng có mục đích và cấu trúc tệp riêng.

## Quản lý người dùng

![Thao tác người dùng ở menu cuối dòng](../../../public/guide/images/admin-users.webp)

Mở tab **Người dùng**. Dùng biểu tượng sửa để thay thông tin được phép; menu thêm ở cuối dòng có xem chi tiết và đặt lại mật khẩu theo quyền. Khi khoá tài khoản, đọc xác nhận và kiểm tra đúng người. Cấp đúng tổ chức và vai trò cần thiết, không dùng tài khoản OPS cho người duyệt chi bên mua.

## Đọc ma trận quyền

![Ma trận các vai trò và hành động](../../../public/guide/images/admin-permissions.webp)

Ma trận cho biết vai trò nào được xem, tạo, sửa, nhập, xuất và chạy hành động. Tìm nhóm như kiểm soát, hợp đồng hoặc tài khoản. Đây là màn đọc quyền hiện có, không phải nơi bấm bật/tắt quyền động.

> **Giới hạn cấu hình:** rule đánh giá và ma trận quyền không sửa qua màn hình này. Tham số nhập trong hồ sơ hợp đồng đi vào mốc nghiệp vụ; bản ghi “tham số” tạo tuỳ ý ở quản trị không tự thay engine. Muốn thêm phiên bản rule hoặc provider tích hợp phải phát triển và review riêng.

Lỗi `MANAGED_RECORD` nghĩa là bản ghi thuộc nguồn được bảo vệ; mở đúng trang nghiệp vụ thay vì thử nhập đè. Nếu không có nút ghi, kiểm tra bạn đang dùng kiểm toán hay quản trị. Xem [Vai trò](/guide/roles) và [Công cụ bảng](/guide/tables).
