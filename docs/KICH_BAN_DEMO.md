# Kịch bản demo

Dùng cho phần Demo/Mockup của buổi trình bày (slide 12) và cho buổi chạy thử với BGK nếu có. Mọi bước dùng tài khoản demo (menu "Tài khoản demo" ở trang đăng nhập, tìm được theo tên, email, công ty hoặc mã hợp đồng). Tập trước ít nhất hai lần trên bản deploy sẽ trình bày.

## Chuẩn bị (trước buổi trình bày)

1. Đăng nhập `sysadmin@codecash.vn`, mở menu tài khoản, chọn **Khôi phục dữ liệu demo**. Dữ liệu và nhật ký cũ được lưu trữ, hệ thống nạp lại dữ liệu ban đầu.
2. Mở sẵn trang đăng nhập ở hai tab (bên mua và nhà cung cấp) để chuyển vai trò nhanh.
3. Kiểm tra màn **Kết quả Data Pack** đã có số liệu (RELEASE 348, PENALTY 15, HOLD 36, REJECT 6).

## Bản 60 giây (trong 5 phút trình bày)

| Thời lượng | Tài khoản | Màn hình | Nói gì |
| --- | --- | --- | --- |
| 20 giây | `finance@novaan.vn` | CT0103, mốc 2 (giao hàng): văn bản hợp đồng bên trái; bên phải là kết quả nếu phê duyệt, bằng chứng, vai trò phê duyệt | Trước khi bấm, engine chạy thử: Chi sau trừ phạt (PENALTY), phạt 2,22 triệu vì giao hàng trễ 2 ngày sau ân hạn; phê duyệt muộn không làm tăng phạt. Bấm phê duyệt: engine chạy lại và ghi nhận |
| 20 giây | `controller@codecash.vn` | Kết quả Data Pack | 405 mốc, KPI kèm cỡ mẫu, bộ ca tổng hợp; tải CSV đầu ra |
| 20 giây | `auditor@codecash.vn` | Nhật ký hoạt động, Kiểm tra toàn vẹn | Thao tác vừa rồi có trong nhật ký, chuỗi băm hợp lệ; kiểm toán chỉ đọc |

## Bản đầy đủ (khoảng 5 phút, khi được chạy thử riêng)

| # | Tài khoản | Việc | Điểm nhấn |
| --- | --- | --- | --- |
| 1 | `supplier@phuminh.vn` | Việc cần làm, CT0102, ký bước 2 bằng một lần bấm; sang trang kiểm tra chữ ký | Ký theo trình tự, chữ ký gắn với nội dung văn bản |
| 2 | `finance@novaan.vn` | CT0103 mốc 2, phê duyệt | Ngày hoàn thành không tính phê duyệt; Chi sau trừ phạt (PENALTY) 2,22 triệu |
| 3 | `supplier@phuminh.vn` | Mở tranh chấp ở một mốc đang đủ điều kiện | Mốc chuyển Tạm giữ (HOLD); không mở được tranh chấp thứ hai khi đang có tranh chấp |
| 4 | `owner@novaan.vn` | Giải quyết tranh chấp đó | Engine đánh giá lại; mốc trở lại quyết định trước tranh chấp |
| 5 | `controller@codecash.vn` | Kết quả Data Pack, mở một dòng PENALTY | Luật áp dụng, bằng chứng, điều kiện đạt và thiếu, confidence |
| 6 | `auditor@codecash.vn` | Nhật ký hoạt động, Kiểm tra toàn vẹn | Mọi thao tác đã ghi, chuỗi băm hợp lệ |

## Câu hỏi thường gặp

| Câu hỏi | Trả lời ngắn |
| --- | --- |
| Macro-F1 bằng 1 có phải overfit? | Engine là bộ luật, không học từ 20 mẫu. Đội đo thêm trên 5.373 ca kiểm tra dựng từ 405 mốc, chia theo hợp đồng, đáp án suy từ bảng luật; rủi ro còn lại nằm ở cách hiểu đề, được đo bằng độ nhạy và phản ánh vào confidence |
| ELSE xảy ra khi nào? | Khi không luật nào khớp hoặc dữ liệu lỗi; luôn HOLD để người kiểm tra |
| Ai đóng tranh chấp? | Bên mua (chủ hợp đồng hoặc pháp chế); sự kiện đóng phải tham chiếu đúng tranh chấp |
| Confidence dùng để làm gì? | Ưu tiên người rà soát; không bao giờ đổi quyết định |
| Áp dụng ở khoa, trường thế nào? | Thí điểm với hợp đồng mua sắm, dịch vụ của khoa trong 3 tuần (đặc tả nghiệp vụ, mục kế hoạch MVP trong báo cáo) |
