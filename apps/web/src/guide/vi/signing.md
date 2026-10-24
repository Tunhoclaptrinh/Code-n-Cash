# Soạn hợp đồng, rà soát và ký

Luồng gồm **Tải lên → Vị trí ký → Rà soát điều khoản → Ký số → Có hiệu lực**. Chủ hợp đồng và cán bộ hợp đồng chuẩn bị hồ sơ; từng người ký chỉ thao tác ở lượt được gán.

## 1. Tải hợp đồng và nhập tham số

![Hồ sơ hợp đồng mới](../../../public/guide/images/upload-form.webp)

1. Mở **Tải hợp đồng lên** hoặc việc hoàn tất CT0101.
2. Kiểm tra tên, bên mua, NCC, loại hợp đồng, giá trị và thời gian. Tiền nhập theo triệu VND.
3. Chọn chính sách phê duyệt, số ngày ân hạn, tỷ lệ phạt mỗi ngày và trần phạt. Những tham số này được đưa xuống các mốc có áp dụng phạt.
4. Tải tệp hợp đồng; xem tên tệp và chờ tải xong trước khi lưu.
5. Chọn từ 1–4 người ký. Một người ký hoàn tất toàn bộ lượt ký; từ 2 người phải có đại diện cả hai bên. Chọn mẫu hợp đồng từ danh sách do quản trị cấu hình; có thể thêm/bớt người ký và chỉnh nội dung riêng. Bấm **Tạo hợp đồng mẫu** để sinh DOCX, xem trước và tải về. Sửa dữ liệu sau khi sinh tệp thì phải tạo lại hoặc tải tệp thay thế.

![Danh sách người ký và mẫu nhanh](../../../public/guide/images/upload-signers.webp)

Người ký và vai trò phê duyệt thanh toán là hai cấu hình khác nhau. Ký hợp đồng không tự tạo phê duyệt chi cho mốc.

## 2. Đặt vị trí ký

![Vị trí các chữ ký trên tài liệu](../../../public/guide/images/upload-positions.webp)

Chọn từng người ký, đặt ô chữ ký ở trang cho phép và kiểm tra không chồng lên vùng nội dung bị chặn hoặc chữ ký khác. Lưu vị trí rồi sang bước rà soát. Nếu hồ sơ chưa đủ dữ liệu hoặc vị trí chưa hợp lệ, sửa tại bước tương ứng trước khi tiếp tục.

## 3. Rà soát điều khoản và khoá

![Rà soát: 1 — hạn cần xác nhận; 2 — xác nhận điều khoản](../../../public/guide/images/upload-digitize.webp)

Đối chiếu tổng giá trị, tỷ lệ và số tiền từng mốc, loại chứng từ, chính sách phê duyệt, phạt và ngày đến hạn. Mốc có thuật ngữ tương đối như “12 tháng” cần nhập ngày cụ thể. Nếu để trống hạn được phép thiếu, mốc có thể bị HOLD vì thiếu cấu trúc; không tự suy ra ngày để hoàn tất demo.

> **Phạm vi hiện tại:** trích xuất đọc text từ PDF/DOCX thật và yêu cầu người dùng kiểm tra, chỉnh và xác nhận. Bản scan cần OCR chưa được kết nối. Mốc nghiệp vụ vẫn lấy từ mẫu quy trình Data Pack. Canvas vị trí ký là sơ đồ quy ước, chưa phải vị trí chữ ký PAdES trên PDF.

Bấm **Xác nhận** tạo các mốc thật và khoá điều khoản, chuyển hợp đồng sang **Đang ký**. Số tiền các mốc cộng đúng giá trị hợp đồng; mốc cuối nhận phần dư làm tròn.

## 4. Ký đúng lượt

![Trình tự ký sau khi khoá điều khoản](../../../public/guide/images/signing-flow.webp)

![CT0102 đang chờ nhà cung cấp ký](../../../public/guide/images/signing-turn.webp)

1. Đăng nhập người đang có nhãn đến lượt; người khác chỉ xem tiến trình.
2. Mở bước ký của mình, đọc tài liệu và chọn phương thức phù hợp. Bước cuối yêu cầu chữ ký số, không chỉ ảnh chữ ký.
3. Gửi yêu cầu, thực hiện xác nhận mô phỏng theo màn hình; kiểm tra trạng thái hoàn tất trước khi đổi tài khoản.
4. Người tiếp theo nhận lượt. Chữ ký cuối kích hoạt hợp đồng và tạo sự kiện `CONTRACT_SIGNED` đúng bên mua.

![Chọn phương thức ký](../../../public/guide/images/signing-method.webp)

Thử CT0102 bằng `supplier@phuminh.vn` ở bước 2, rồi `secondary@novaan.vn` ở bước cuối. Ký chưa đến lượt bị chặn. Huỷ luồng ký là quyền của người quản lý hồ sơ; cần đọc xác nhận và lý do trước khi thực hiện.

## 5. Kiểm tra chữ ký

![Thông tin chữ ký đã ghi trong hợp đồng](../../../public/guide/images/verify.webp)

Mở **Kiểm tra chữ ký**, đối chiếu người, thứ tự, phương thức, thời điểm và thời điểm hiệu lực. Kiểm PDF bên ngoài chỉ nhận ra cấu trúc thì hiển thị **chưa xác minh**.

> **Chữ ký demo:** Tên phương thức VNPT SmartCA/Viettel MySign hiện là mô phỏng. Bằng chứng Ed25519 gắn tệp gốc được tạo và kiểm tra thật bằng khóa thử cục bộ. Chưa có xác thực chứng thư, OCSP/CRL hay ký PDF với nhà cung cấp thật; không dùng kết quả “hợp lệ” của demo làm kết luận về chữ ký số thực tế.

Sau khi hợp đồng có hiệu lực, quay lại [Việc cần làm](/guide/tasks) để nộp chứng từ và phê duyệt mốc đầu.

## Xem tài liệu thật

![Bản PDF kết xuất từ tệp hợp đồng thực](../../../public/guide/images/upload-real-preview.webp)

1. Chọn PDF/DOCX hoặc bấm **Tạo hợp đồng mẫu**. Khung **Xem trước** hiển thị PDF thật; DOCX được chuyển thành PDF, không dùng hình minh họa.
2. Cuộn hoặc đổi trang trong trình xem để kiểm tra nội dung; bấm **Tải bản PDF xem trước** nếu cần đối chiếu. Bản PDF này là bản kết xuất, không thay đổi bytes/hash của tệp gốc.
3. Sau khi lưu tệp, mở chi tiết hợp đồng → **Tài liệu gốc** để xem lại tài liệu đã tải lên. Hợp đồng trong Data Pack không có tệp đính kèm sẽ báo chưa có tệp.

## Điền nhanh nhưng vẫn chủ động kiểm tra

![Form mới trống: 1 — điền các ô còn trống](../../../public/guide/images/upload-form.webp)

![Dữ liệu mẫu đã điền vào form, chưa được lưu](../../../public/guide/images/upload-demo-filled.webp)

Màn **Tải hợp đồng lên** mới bắt đầu trống; mã hồ sơ và dữ liệu hệ thống là trường chỉ đọc. Bấm nút **Điền mẫu toàn bộ** duy nhất ở đầu form để điền tất cả ô còn trống, kể cả người ký chưa chọn. Nội dung đã nhập được giữ nguyên; thao tác không lưu/gửi. Trong danh sách người ký, mở **Thao tác** để chuyển lên, chuyển xuống hoặc bỏ người ký; thứ tự được đánh số từ trên xuống. Hồ sơ mở từ việc cần làm hoặc **Hoàn tất bản nháp** giữ dữ liệu đã lưu.

Sau khi tải tài liệu, **Nạp đề xuất** dùng giá trị trích xuất thực để bạn rà soát; đây không phải dữ liệu demo. Ngày chưa xác nhận có nút nạp ngày gợi ý. Vị trí ký mới để trống, dùng **Điền vị trí ký mẫu** hoặc đặt thủ công trước khi lưu.

![Tài liệu hợp đồng: 1 — nội dung riêng; 2 — chọn hoặc thay tệp](../../../public/guide/images/upload-document.webp)
