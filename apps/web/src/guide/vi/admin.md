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

## Quản lý mẫu hợp đồng

![Danh mục mẫu: 1 — thêm mẫu; 2 — sửa hoặc mở menu xóa](../../../public/guide/images/admin-contract-templates.webp)

Mở tab **Mẫu hợp đồng** bằng tài khoản quản trị. Thêm, sửa, xóa hoặc tắt mẫu; nhập/xuất dùng cùng công cụ bảng. Cấu hình loại hợp đồng, giá trị gợi ý, chính sách phê duyệt, phạt, thứ tự vai trò ký và nội dung bổ sung. Mẫu nhiều người ký phải có đại diện hai bên; người lập hồ sơ sẽ chọn người ký cụ thể.

![Sửa mẫu: 1 — thứ tự vai trò ký; 2 — nội dung bổ sung](../../../public/guide/images/admin-template-editor.webp)

Nội dung là văn bản; dùng biến trong hai dấu ngoặc nhọn như `{{title}}`, `{{buyer}}`, `{{supplier}}`, `{{valueMillion}}`. Lưu xong, người lập hồ sơ chọn mẫu ở màn tải lên và điều chỉnh riêng. Sửa/xóa mẫu không đổi hồ sơ đã lưu. Có thể tắt mẫu để ngừng dùng cho hồ sơ mới.

## Quản lý người dùng

![Thao tác người dùng ở menu cuối dòng](../../../public/guide/images/admin-users.webp)

Mở tab **Người dùng**. Dùng biểu tượng sửa để thay thông tin được phép; menu thêm ở cuối dòng có xem chi tiết và đặt lại mật khẩu theo quyền. Khi khoá tài khoản, đọc xác nhận và kiểm tra đúng người. Cấp đúng tổ chức và vai trò cần thiết, không dùng tài khoản OPS cho người duyệt chi bên mua.

## Đọc ma trận quyền

![Ma trận các vai trò và hành động](../../../public/guide/images/admin-permissions.webp)

Ma trận cho biết vai trò nào được xem, tạo, sửa, nhập, xuất và chạy hành động. Tìm nhóm như kiểm soát, hợp đồng hoặc tài khoản. Đây là màn đọc quyền hiện có, không phải nơi bấm bật/tắt quyền động.

> **Giới hạn cấu hình:** ma trận quyền chỉ hiển thị để đối chiếu; rule có luồng phiên bản riêng. Tham số nhập trong hồ sơ hợp đồng đi vào mốc nghiệp vụ; bản ghi “tham số” tạo tuỳ ý ở quản trị không tự thay engine. Muốn thêm phiên bản rule hoặc provider tích hợp phải phát triển và review riêng.

Lỗi `MANAGED_RECORD` nghĩa là bản ghi thuộc nguồn được bảo vệ; mở đúng trang nghiệp vụ thay vì thử nhập đè. Nếu không có nút ghi, kiểm tra bạn đang dùng kiểm toán hay quản trị. Xem [Vai trò](/guide/roles) và [Công cụ bảng](/guide/tables).

## Điền dữ liệu dùng thử

Form thêm mới để trống. Nút **Điền mẫu toàn bộ** duy nhất ở đầu form điền tất cả ô trống; kiểm tra lại rồi tự bấm lưu. Nút không tự tạo tài khoản, đổi quyền, reset mật khẩu hoặc phát hành rule. Dữ liệu tham chiếu được lấy từ danh mục bạn được quyền xem. Phiên bản rule chỉ được gửi duyệt khi không làm đổi baseline 405 mốc, khớp mẫu và bất biến; kiểm tra này chưa xác nhận ground truth ẩn.
