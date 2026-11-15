# Nội dung bàn giao và bằng chứng

Theo yêu cầu người dùng; mặc định hai `.drawio` cùng mô hình/bố cục, PNG/SVG mỗi trang của cả hai, README và tài liệu `.md`. PDF là tùy chọn, không mặc định thay thế nguồn chỉnh sửa được. Không áp số trang/pool/lane từ ví dụ.

Tài liệu cần có:

- Đề/mô tả nguồn, phạm vi và bảng requirement → participant/action/data/condition/result → phần tử → kịch bản. Đánh dấu fact, assumption, derived hoặc ngoài phạm vi.
- Pool/lane, trigger/outcomes, task types, gateway/event và lý do chọn; khi nào dữ liệu quyết định có sẵn.
- Main/alternative/exception, loop/concurrency và time boundary; trạng thái kết thúc và hành vi bị cấm. Walkthrough không được gọi là engine simulation.
- Assumptions, unresolved questions, abstract subprocess entry/exit contract và ai cần review nghiệp vụ thực tế.
- Cách tự vẽ lại, palette/màu, nguồn tham khảo, liên kết hai bản và ảnh. Khi có yêu cầu nộp, ghi rõ kích thước/in, số trang và thông tin phải điền theo mẫu.
- Provenance: source digest, phiên bản/digest công cụ skill, draw.io commit/viewer digest, text mode, render directories và nội dung đã thực sự kiểm tra.

Kết quả tách riêng **business coverage**, **notation**, **palette/equivalence**, **ảnh/layout** và **tool regression**. Ghi fail/skip/unsupported/manual-review còn lại, không dùng một cờ pass chung thay xác nhận từng lớp. Sau sửa nguồn phải dựng lại ảnh; sau sửa SVG ngoài renderer phải báo artifact khác bằng chứng.

Khi chỉ yêu cầu review, trả finding và proposal, không ghi đè. Khi đóng gói, không lấy bài khác, nguồn vendor, cache, profile Chrome hoặc dữ liệu riêng ngoài phạm vi; relative links phải được giữ cùng tài nguyên.
