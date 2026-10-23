# Giải thích quyết định và số tiền

Mở một mốc trong chi tiết hợp đồng rồi chọn **Truy vết quyết định**. Trang giải thích kết quả engine đã lưu, điều kiện thiếu và bằng chứng; không có ô sửa quyết định hay số tiền bằng tay.

![Quyết định CT0103 mốc 2 sau khi tài chính phê duyệt](../../../public/guide/images/decision.webp)

## Đọc kết quả trước

| Kết quả | Ý nghĩa                                          | Việc cần làm                          |
| ------- | ------------------------------------------------ | ------------------------------------- |
| RELEASE | Đủ mọi điều kiện, được trả toàn bộ kế hoạch      | Tài chính xem xét chuyển kế toán      |
| PENALTY | Đủ điều kiện nhưng hoàn thành trễ, khấu trừ phạt | Kiểm tra công thức rồi chuyển kế toán |
| HOLD    | Chưa đủ hoặc có điều kiện chặn                   | Đọc mã lý do và điều kiện thiếu       |
| REJECT  | Có từ chối hợp lệ, kết quả bị khoá               | Đọc lý do từ chối và nhật ký          |

Đối chiếu mã hợp đồng, số mốc, trạng thái, mã lý do và mã rule. “Chờ chứng từ” và “Chờ phê duyệt” đều có thể là HOLD nhưng cách xử lý khác nhau.

## Kiểm tra số tiền

![Bảng tính tiền của mốc](../../../public/guide/images/decision-amounts.webp)

Đọc lần lượt: tiền kế hoạch, hạn, ân hạn, ngày hoàn thành, ngày trễ, tỷ lệ mỗi ngày, trần phạt, tiền phạt và tiền được trả. Đơn vị tiền là **triệu VND**.

Ví dụ CT0103 mốc 2: kế hoạch **740,00**; hạn **12/10/2026**; ân hạn **2 ngày**; hoàn thành **16/10/2026**; trễ **2 ngày**. Phạt `740 × 0,15% × 2 = 2,22`; trần `740 × 8% = 59,20`; được trả **737,78**. Tiền được làm tròn HALF_UP đến 0,01 triệu.

Ngày hoàn thành lấy từ thời điểm đã đủ bằng chứng bắt buộc hợp lệ; không đơn giản là sự kiện cuối hay ngày người duyệt bấm nút. Khi vẫn thiếu bằng chứng, kết quả giữ và không được chuyển chi.

## Đọc 8 rule theo thứ tự

![Các rule, điều kiện và trạng thái khớp](../../../public/guide/images/decision-rules.webp)

Engine xét ưu tiên **10 → 80**, dừng ở rule đầu tiên khớp: tranh chấp mở; từ chối; sai thẩm quyền; thiếu sự kiện; thiếu phê duyệt; trễ hạn; đủ điều kiện; còn lại. **Khớp** là rule ra quyết định. **Không khớp** đã được xét và sai. **Chưa xét** nằm sau rule đã khớp, không có nghĩa bản thân điều kiện đó sai.

## Kiểm tra bằng chứng và phát lại

![Sự kiện được engine phân loại](../../../public/guide/images/decision-events.webp)

Các sự kiện được phân biệt hợp lệ, sai thẩm quyền, bị vô hiệu hoặc không dùng làm bằng chứng. Một tệp được đính kèm chưa thay thế được sự kiện đúng loại, đúng bên ghi và trạng thái hợp lệ.

Bấm **Diễn biến theo thời gian** để chạy lại theo từng thời điểm. Mỗi dòng là kết quả sau các sự kiện đã biết tại thời điểm đó; đọc từ trên xuống để thấy mốc chuyển HOLD sang RELEASE/PENALTY vì sự kiện nào. Đây là giải thích, không phục hồi dữ liệu về thời điểm cũ.

![Phát lại theo thời gian](../../../public/guide/images/decision-replay.webp)

![Lịch sử trạng thái và mã lượt chạy](../../../public/guide/images/decision-history.webp)

## Chuyển kế toán

Tài chính có nút **Chuyển kế toán** khi kết quả RELEASE hoặc PENALTY. Sau khi chuyển, mốc được khoá và ghi mã khoản chi; không thể chuyển lần hai. Đây là ghi nhận bàn giao kế toán trong demo, chưa phải lệnh chuyển khoản ngân hàng.

![Nút chuyển kế toán trên mốc đủ điều kiện](../../../public/guide/images/transfer.webp)

Nếu lý do là sai thẩm quyền, xem [Ngoại lệ BR-19](/guide/exceptions). Nếu có tranh chấp, xem [Tranh chấp](/guide/dispute). Mốc vẫn thiếu điều kiện sau xử lý thì tiếp tục HOLD; không có quyền ép RELEASE.
