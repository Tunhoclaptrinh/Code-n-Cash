# Khung proposal Blueprint — 5–10 trang PDF

**Người tổng hợp:** Bùi Phương Thúy. **Review:** Lâm về tuân thủ/KPI, Hoàng về nghiệp vụ, Tuấn về kỹ thuật, Mai Anh về quyền/an toàn.

Tên cơ sở theo đề: `HSSK_<TenDoi>_D.pdf`; kiểm thông báo BTC trước khi xuất bản cuối. Khung dưới gợi ý 9 trang, có thể gộp để phù hợp giới hạn.

| Trang | Nội dung chính | Đầu vào từ đội |
| --- | --- | --- |
| 1 | Bìa, thông tin đội, tóm tắt bài toán/giải pháp/phạm vi mô phỏng | Thúy, Lâm |
| 2 | Bối cảnh, vấn đề, insight và giá trị dự kiến; use case trường học | Hoàng, Thúy |
| 3 | Kiến trúc, dữ liệu, vai trò, luồng Contract → Milestone → Event → Rule → Decision → Audit | Hoàng, Tuấn, Mai Anh |
| 4 | State machine, rule first-match, quyền/quorum, dispute/dedup, công thức phạt | Hoàng, Tuấn |
| 5 | Đầu ra CSV, dashboard/audit mẫu; kiểm soát riêng tư và an toàn | Hà Phương, Mai Anh |
| 6 | KPI/cách đo, kết quả đã kiểm, tập mẫu và giới hạn | Lâm, Mai Anh |
| 7 | Kịch bản áp dụng tại khoa/trường, cách đo giá trị với baseline | Hoàng, Thúy |
| 8 | Roadmap MVP 2–3 tuần, phân công sáu người, rủi ro và phương án demo | Lâm, cả đội |
| 9 | Minh chứng chọn lọc và hướng phát triển có giới hạn | Hà Phương, Tuấn, Mai Anh |

Chỉ đưa AI/ký số/hash chain vào phần đã thực hiện nếu có minh chứng; phần chưa làm ghi roadmap. Hash chain không bảo đảm bất biến tuyệt đối; khóa ký thử nghiệm không chứng minh tích hợp ký số pháp lý đầy đủ.

Kết quả chưa đo ghi **[cần đo]**, không điền sẵn 100%, 0%, <15 ms hay giảm 80% thời gian. Accuracy trên 20 mẫu phải ghi rõ 20 mẫu; không suy thành độ chính xác trên toàn 405 mốc. Trên 405 mốc có thể báo coverage, kiểm tra định dạng/invariant và trace.

Roadmap MVP 2–3 tuần là yêu cầu của đề, tách khỏi đợt chuẩn bị bài bảy ngày; ghi rõ phần demo đã chứng minh và phần phát triển tiếp. Use case mô phỏng không gọi là pilot đã thực hiện.
