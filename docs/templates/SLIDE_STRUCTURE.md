# Khung slide — tối đa 15 trang PDF, dự kiến trình bày không quá 5 phút

BTC trả lời ngày 25/10/2026: tối đa 15 trang; phần Trình bày & vấn đáp tính 10 điểm; dự kiến mỗi đội trình bày không quá 5 phút. Thời lượng/lịch chính thức còn chờ thông báo thống nhất. Chọn **8 slide chính**, thêm tối đa 7 trang phụ lục nếu cần, không cố đọc đủ 15 trang trong 5 phút.

**Thúy** tổng hợp; **Hà Phương** chuẩn bị ảnh/demo; **Hoàng** duyệt logic và **Lâm** duyệt KPI/phạm vi tuyên bố. Bố cục đi theo gợi ý BTC: Bài toán → Giải pháp → Logic xử lý → KPI → Demo/Mockup → Kế hoạch MVP.

| Slide chính | Nội dung và bằng chứng | Ngân sách thời gian |
| --- | --- | --- |
| 1 | Tên giải pháp, đội và một câu mô tả rủi ro thanh toán sai điều kiện | 20 giây |
| 2 | Bài toán, bên mua/NCC, insight từ Data Pack và giá trị dự kiến | 30 giây |
| 3 | Giải pháp: Contract → Milestone → Events → Validate → Rule → Decision → Amount → Audit | 45 giây |
| 4 | Logic: first-match, dispute/quorum, completion từ required events, ví dụ penalty Decimal | 60 giây |
| 5 | KPI thật: 20 mẫu có nhãn, độ phủ 405 mốc, giới hạn HIDDEN/HOLDOUT; dẫn run/fingerprint | 35 giây |
| 6 | Demo ngắn hoặc clip: HOLD → thêm đúng chứng từ/phê duyệt → engine tính lại → trace/tiền; có dự phòng ảnh | 45 giây |
| 7 | Phần làm thật và mô phỏng; AI chỉ đề xuất có nguồn, ký số demo; điểm nối cho engine/AI | 40 giây |
| 8 | Kế hoạch MVP, phân công và bước tiếp theo; thông điệp kết thúc | 25 giây |

Tổng ngân sách 300 giây. Luyện trình bày dưới ngân sách này để có khoảng chuyển slide; không coi 5 phút là lịch chính thức hay tự gộp thời gian vấn đáp khi BTC chưa xác nhận.

Phụ lục có thể gồm: tám rule và ELSE; biến/công thức/ràng buộc; phân quyền/audit; phạm vi dữ liệu và giả định; kiến trúc/contract tích hợp; KPI chi tiết; roadmap/rủi ro. Dừng ở tối đa 15 trang cả phụ lục.

Dùng ảnh/KPI từ cùng phiên bản chạy. Chưa đo thì ghi [cần đo], chưa triển khai thì ghi đề xuất/roadmap. Không viết “accuracy 100% trên 405”, “đã huấn luyện AI” hoặc “chữ ký số pháp lý đã xác minh” nếu chưa có bằng chứng tương ứng.

Câu trả lời chuẩn bị cho Q&A:

- **Có phải train model?** Chưa có yêu cầu bắt buộc trong phần BTC trả lời. Lõi là rule engine; AI đọc tài liệu là tùy chọn, không thay quyết định.
- **ELSE đâu trong event?** ELSE là nhánh cuối khi các rule trước không khớp, trả HOLD để kiểm tra; không có event ELSE.
- **Ground truth đâu?** BTC công khai 20 mẫu; phần còn lại giữ để chấm. Dự đoán/baseline do đội sinh không phải ground truth ẩn.
- **Module Hoàng/Lâm tích hợp thế nào?** Theo [bàn giao 29](../29_BAN_GIAO_TICH_HOP_ENGINE_VA_AI.md), có contract/gate riêng, giữ profile BTC và transaction/audit của ứng dụng.
