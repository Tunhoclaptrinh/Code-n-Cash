# Nộp chứng từ

Trang **Nộp chứng từ** dành cho cán bộ hợp đồng bên mua và NCC. Mở từ việc được giao để vào đúng hợp đồng và mốc. Mỗi ô tương ứng một loại sự kiện cần thiết của bên mình.

![Chứng từ: 1 — ô cần nộp; 2 — nút nộp](../../../public/guide/images/evidence.webp)

## Chuẩn bị đúng bằng chứng

| Người nộp               | Ví dụ loại chứng từ                                                           |
| ----------------------- | ----------------------------------------------------------------------------- |
| Cán bộ hợp đồng bên mua | Xác nhận khởi động, duyệt yêu cầu, UAT đạt, biên bản nghiệm thu               |
| Nhà cung cấp            | Giao hàng, hoá đơn, go-live, kích hoạt, hoàn thành dịch vụ, hoàn tất bảo hành |

API xác định bên ghi từ người đăng nhập. NCC không thể nộp biên bản nghiệm thu thay bên mua; người phê duyệt cũng không nộp thay NCC. Sự kiện hợp đồng đã ký được hệ thống tạo sau chữ ký cuối.

## Thực hiện từng bước

1. Đối chiếu tên hợp đồng, số mốc, hạn và các chứng từ bắt buộc.
2. Chọn tệp ở từng ô đang chờ. Chờ tải tệp xong và kiểm tra tên tệp trước khi sang ô tiếp theo.
3. Đọc các chứng từ đã có để tránh nộp trùng; một ô đã hoàn tất không có nghĩa mọi ô đã đủ.
4. Đọc **Nếu nộp ngay bây giờ (engine chạy thử)**. Dự báo này cho thấy còn thiếu gì sau khi nộp.
5. Khi nút **Nộp chứng từ** bật, bấm nộp; chờ thông báo thành công và kết quả được đánh giá lại.

![Sẵn sàng nộp: 1 — tệp đã tải; 2 — kết quả xem trước; 3 — nộp](../../../public/guide/images/evidence-ready.webp)

## Ví dụ CT0104 mốc 2

Đăng nhập `supplier@phuminh.vn`. Chọn **Xác nhận hoàn thành dịch vụ** và **Hoá đơn**, tải hai tệp tương ứng. Xem trước có thể vẫn là HOLD vì chờ chủ hợp đồng phê duyệt. Sau khi nộp, đăng nhập `owner@novaan.vn` để làm bước phê duyệt.

Hạn mốc là 11/10/2026, ân hạn 7 ngày. Nếu nộp ngày 23/10/2026 thì trễ 5 ngày; trên dữ liệu mới, sau khi chủ hợp đồng duyệt, phạt 2,40 triệu và trả 477,60 triệu. Ngày nộp khác làm số ngày và tiền phạt khác.

## Khi không nộp được

- Nút còn tắt: kiểm tra đủ tệp và quá trình tải lên đã hoàn tất.
- Không có ô đúng loại: kiểm tra tài khoản bên mua/NCC; không đổi loại sự kiện để lách quyền.
- Mốc đã từ chối hoặc đã chuyển kế toán: mốc bị khoá, không nhận chứng từ để đổi kết quả.
- Báo lỗi quyền/phạm vi: quay lại [Vai trò](/guide/roles) để chọn đúng tổ chức.

> **Sau khi nộp vẫn HOLD:** mở [Quyết định](/guide/decision) và đọc lý do mới. Nộp chứng từ không tự cấp phê duyệt, không đóng tranh chấp và không vô hiệu sự kiện sai thẩm quyền.

Thông tin tải lên và sự kiện mới có nguồn **Tạo trong app**, được ghi vào nhật ký. Quay lại **Việc cần làm** để xác nhận việc đã được xử lý; người tiếp theo sẽ nhận việc theo điều kiện còn thiếu.
