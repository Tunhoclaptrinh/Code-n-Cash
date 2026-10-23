# Soạn hợp đồng, rà soát và ký

Luồng gồm **Tải lên → Vị trí ký → Rà soát điều khoản → Ký số → Có hiệu lực**. Chủ hợp đồng và cán bộ hợp đồng chuẩn bị hồ sơ; từng người ký chỉ thao tác ở lượt được gán.

## 1. Tải hợp đồng và nhập tham số

![Hồ sơ hợp đồng mới](../../../public/guide/images/upload-form.webp)

1. Mở **Tải hợp đồng lên** hoặc việc hoàn tất CT0101.
2. Kiểm tra tên, bên mua, NCC, loại hợp đồng, giá trị và thời gian. Tiền nhập theo triệu VND.
3. Chọn chính sách phê duyệt, số ngày ân hạn, tỷ lệ phạt mỗi ngày và trần phạt. Những tham số này được đưa xuống các mốc có áp dụng phạt.
4. Tải tệp hợp đồng; xem tên tệp và chờ tải xong trước khi lưu.
5. Chọn người ký, thứ tự, kiểm tra có đại diện cả hai bên. Luồng hỗ trợ tối đa 4 người; mẫu nhanh giúp điền thứ tự rồi vẫn cần bạn rà lại.

![Danh sách người ký và mẫu nhanh](../../../public/guide/images/upload-signers.webp)

Người ký và vai trò phê duyệt thanh toán là hai cấu hình khác nhau. Ký hợp đồng không tự tạo phê duyệt chi cho mốc.

## 2. Đặt vị trí ký

![Vị trí các chữ ký trên tài liệu](../../../public/guide/images/upload-positions.webp)

Chọn từng người ký, đặt ô chữ ký ở trang cho phép và kiểm tra không chồng lên vùng nội dung bị chặn hoặc chữ ký khác. Lưu vị trí rồi sang bước rà soát. Nếu hồ sơ chưa đủ dữ liệu hoặc vị trí chưa hợp lệ, sửa tại bước tương ứng trước khi tiếp tục.

## 3. Rà soát điều khoản và khoá

![Rà soát: 1 — hạn cần xác nhận; 2 — xác nhận điều khoản](../../../public/guide/images/upload-digitize.webp)

Đối chiếu tổng giá trị, tỷ lệ và số tiền từng mốc, loại chứng từ, chính sách phê duyệt, phạt và ngày đến hạn. Mốc có thuật ngữ tương đối như “12 tháng” cần nhập ngày cụ thể. Nếu để trống hạn được phép thiếu, mốc có thể bị HOLD vì thiếu cấu trúc; không tự suy ra ngày để hoàn tất demo.

> **Phạm vi hiện tại:** bước “số hoá” dùng mẫu quy trình suy từ Data Pack và tham số bạn đã nhập. Ứng dụng chưa dùng OCR/NLP/LLM để đọc thật nội dung PDF. Vị trí điều khoản trong bản demo là dữ liệu minh hoạ; phải đối chiếu tài liệu thực trước khi xác nhận.

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

> **Chữ ký demo:** VNPT SmartCA/Viettel MySign và kết quả chữ ký trong hợp đồng hiện là mô phỏng trạng thái. Chưa có xác thực chứng thư, OCSP/CRL hay ký PDF với nhà cung cấp thật; không dùng kết quả “hợp lệ” của demo làm kết luận về chữ ký số thực tế.

Sau khi hợp đồng có hiệu lực, quay lại [Việc cần làm](/guide/tasks) để nộp chứng từ và phê duyệt mốc đầu.
