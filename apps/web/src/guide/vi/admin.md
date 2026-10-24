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

> **Giới hạn cấu hình:** ma trận quyền chỉ hiển thị để đối chiếu; rule có luồng soạn, chạy thử và duyệt phiên bản riêng. Tham số nhập trong hồ sơ hợp đồng đi vào mốc nghiệp vụ; bản ghi “tham số” tạo tùy ý ở quản trị không tự thay engine. Provider mới cần được tích hợp và kiểm chứng riêng.

Lỗi `MANAGED_RECORD` nghĩa là bản ghi thuộc nguồn được bảo vệ; mở đúng trang nghiệp vụ thay vì thử nhập đè. Nếu không có nút ghi, kiểm tra bạn đang dùng kiểm toán hay quản trị. Xem [Vai trò](/guide/roles) và [Công cụ bảng](/guide/tables).

## Điền dữ liệu dùng thử

Form thêm mới để trống. Nút **Điền mẫu toàn bộ** duy nhất ở đầu form điền tất cả ô trống; kiểm tra lại rồi tự bấm lưu. Nút không tự tạo tài khoản, đổi quyền, reset mật khẩu hoặc phát hành rule. Dữ liệu tham chiếu được lấy từ danh mục bạn được quyền xem. Phiên bản rule chỉ được gửi duyệt khi không làm đổi baseline 405 mốc, khớp mẫu và bất biến; kiểm tra này chưa xác nhận ground truth ẩn.

## Soạn điều kiện và công thức quy tắc

Mở **Phiên bản quy tắc và mẫu mốc**, chọn **Soạn phiên bản mới**, nhập tên/lý do rồi mở tab **Biểu thức quy tắc**. Người soạn chỉ sửa bản nháp của mình; người có quyền đọc có thể tra cứu và chạy thử. Các quyết định vẫn do engine xử lý.

![Chọn rule: 1 — quy trình và loại mốc; 2 — rule theo ưu tiên; 3 — điều kiện](../../../public/guide/images/rules-editor.webp)

Chọn quy trình/loại mốc (1), rồi chọn rule (2). Xét từ ưu tiên 10 đến 80 và dừng tại rule đầu tiên đúng. Tranh chấp mở được HOLD trước khi xét phạt hoặc trả tiền. Phạm vi, thứ tự, quyết định và mã lý do khóa theo Data Pack. Mô tả là tham chiếu, không tự viết lại khi đổi biểu thức.

![Công thức: 1 — tiền phạt; 2 — tiền được trả](../../../public/guide/images/rules-formulas.webp)

Điều kiện phải trả **TRUE/FALSE** (hoặc **ELSE** ở rule cuối). Engine tính tiền phạt (1) trước, làm tròn 2 chữ số rồi đưa vào `penalty_amount_vnd_mn` để tính tiền được trả (2). Cả hai theo **triệu VND**. Cuộn trong hộp cấu hình để xem các phần bên dưới.

![Tra cứu: 1 — tìm biến; 2 — kiểu, đơn vị, ví dụ và nguồn](../../../public/guide/images/rules-variables.webp)

Bấm **Biến, cú pháp và ví dụ** để tìm biến (1), đọc kiểu, đơn vị, nguồn và ví dụ (2). Ô **Chèn biến tại con trỏ** chèn đúng tên; nút số biến dưới mỗi biểu thức mở danh sách để tra nghĩa. Không tự đặt tên biến mới. Tỷ lệ đủ chứng từ `1.0` là 100%; tỷ lệ phạt `0.10` là 0,10%/ngày và cần chia 100 trong công thức. Ngày hoàn thành lấy required event hợp lệ cần thiết, không lấy event workflow cuối.

![Lỗi: 1 — rule cần sửa; 2 — biểu thức lỗi và giải thích](../../../public/guide/images/rules-syntax-error.webp)

Bấm **Kiểm tra cú pháp** để kiểm cả 384 biểu thức. Bấm lỗi (1) để tới rule tương ứng. Ví dụ `open_dispute == 1` sai kiểu; dùng `open_dispute == TRUE` nếu muốn kiểm tranh chấp mở. Lỗi có dòng/cột tại ô (2). **Khôi phục bản lưu** chỉ khôi phục ô đang sửa. Hệ thống kiểm cả đơn vị: không cộng tiền với ngày, phần trăm cần đổi bằng `/ 100` hoặc `× 0.01`, số ngày phải nguyên. Hợp kiểu/đơn vị vẫn cần chạy thử và rà soát ý định nghiệp vụ; mẫu số dùng biến có thể bằng 0.

![Sai đơn vị: 1 — biểu thức cộng tiền với ngày; 2 — lỗi cần sửa](../../../public/guide/images/rules-unit-error.webp)

![Chạy thử: 1 — kết quả toàn pack; 2 — gửi duyệt](../../../public/guide/images/rules-preview.webp)

Bấm **Chạy thử tác động**: kiểm cú pháp, chạy cả 405 mốc, so 20 mẫu và so quyết định/lý do/trạng thái/tiền với baseline. Có thay đổi thì mở danh sách tối đa 30 mốc để đối chiếu; bản làm đổi kết quả pack bị chặn gửi duyệt. Thay mẫu mốc chỉ áp dụng cho hồ sơ mới, không viết lại mốc BTC. Sửa bất kỳ ô cấu hình nào sẽ bỏ kết quả chạy thử cũ; phải chạy lại trước khi gửi duyệt (2). Người quản trị thứ hai mới được duyệt phát hành. Khớp 20 mẫu và giữ baseline không phải chứng nhận đúng toàn bộ ground truth ẩn.
