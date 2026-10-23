# Chạy Data Pack và đọc KPI

Trang **Kết quả Data Pack** chạy engine trên bộ dữ liệu chính thức hoặc bộ CSV/ZIP bạn tải lên. Kết quả này phục vụ kiểm chứng và xuất bài; khác với danh sách hợp đồng sống có thêm thao tác demo trong app.

![Data Pack: 1 — đánh giá; 2 — tải kết quả; 3 — nguồn dữ liệu; 4 — tải bộ mới](../../../public/guide/images/data.webp)

## Chạy bộ chính thức

1. Kiểm tra nguồn là **Data Pack chính thức**.
2. Bấm **Đánh giá dữ liệu** nếu tài khoản có quyền; chờ lượt chạy hoàn tất.
3. Đọc số hợp đồng, mốc, sự kiện và bảng kết quả. Bộ gốc có **100 hợp đồng, 405 mốc, 1.134 sự kiện**; seed demo không làm thay các số này.
4. Tìm/lọc một mốc, bấm biểu tượng xem để mở trace.
5. Dùng **Tải kết quả** để tải tệp đầu ra cần dùng.

![KPI và phạm vi nhãn đối chiếu](../../../public/guide/images/data-kpi.webp)

## Đọc KPI đúng phạm vi

Trên 20 mẫu công khai, engine khớp 20/20 quyết định và 20/20 số tiền; UPR 0/10 và giữ thừa 0/10 theo các nhóm có nhãn. Đây là kiểm chứng trên **20 mẫu có đáp án**, không phải tuyên bố đúng toàn bộ 405 mốc hoặc hidden test.

Bộ không có `decision_sample.csv` không có đủ nhãn để tính độ chính xác; đừng hiểu KPI không có dữ liệu là 100%. Tổng số RELEASE/HOLD/REJECT/PENALTY là thống kê quyết định, không tự tạo nhãn chuẩn.

## Tải bộ dữ liệu khác

![Hộp nhận bộ dữ liệu và báo đủ/thiếu tệp](../../../public/guide/images/data-upload.webp)

1. Bấm **Tải bộ dữ liệu lên**, chọn CSV hoặc ZIP theo cấu trúc được hỗ trợ.
2. Cần `contracts.csv`, `parties.csv`, `milestones.csv`, `events.csv`, `payment_rules.csv`.
3. Có thể thêm `decision_sample.csv`, `submission_output_template.csv` và `hidden_test_ids_*.csv`.
4. Đọc lỗi thiếu tệp, thiếu cột hoặc dữ liệu không hợp lệ; sửa tại nguồn và tải lại.
5. Chọn bộ vừa tải, đánh giá, đối chiếu trace rồi tải đầu ra.

Bộ tải lên để chạy đánh giá riêng; không phải thao tác nhập ghi đè các hợp đồng sống đang dùng cho công việc. Khi có danh sách hidden-test IDs, engine vẫn đọc toàn bộ dữ liệu liên quan nhưng đầu ra chỉ lấy mốc trong danh sách.

## Trace và các tệp đầu ra

![Chi tiết kết quả của một mốc](../../../public/guide/images/data-trace.webp)

| Tệp                     | Nội dung                                      |
| ----------------------- | --------------------------------------------- |
| `submission_output.csv` | Kết quả theo template, giữ đúng thứ tự 22 cột |
| `audit.json`            | Facts, rule và diễn giải từng mốc             |
| `metrics.json`          | Thống kê, KPI và thông tin đánh giá           |

Xuất từ thanh công cụ bảng dùng tìm/lọc hiện tại; tải bộ đầu ra dùng kết quả lượt đánh giá. Kiểm tra bạn đang dùng chức năng nào trước khi gửi bài.

Nếu nút đánh giá bị ẩn, kiểm tra quyền: chủ hợp đồng, tài chính và kiểm soát viên có thể chạy; cán bộ hợp đồng, phê duyệt cấp 2 và kiểm toán chủ yếu xem theo quyền được cấp. NCC không có trang này.
