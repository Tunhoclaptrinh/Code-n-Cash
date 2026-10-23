# Kiểm tra toàn vẹn

Kiểm soát viên và kiểm toán mở **Kiểm tra toàn vẹn** để đối chiếu dữ liệu với các dấu băm đã lưu. Trang hỗ trợ phát hiện thay đổi ngoài luồng ứng dụng; kết quả phải được hiểu trong phạm vi dữ liệu đang được kiểm tra.

![Toàn vẹn: 1 — chuỗi nhật ký; 2 — sự kiện app; 3 — dữ liệu BTC; 4 — đối soát quyết định; 5 — chạy lại](../../../public/guide/images/integrity.webp)

## Chạy và đọc bốn khối

1. Bấm **Kiểm tra lại**, đợi hoàn tất và đọc thời điểm kiểm tra.
2. **Chuỗi nhật ký kiểm toán:** kiểm số thứ tự, liên kết với dấu băm trước đó và nội dung từng bản ghi. Thay nội dung hoặc đứt liên kết sẽ được báo.
3. **Chứng từ ghi trong app:** đối chiếu nội dung bản ghi sự kiện với dấu băm đã niêm phong khi tạo. Đây là kiểm bản ghi sự kiện; không đồng nghĩa đã xác minh chữ ký pháp lý hoặc nội dung mọi tệp PDF.
4. **Dữ liệu gốc của BTC:** so các dòng nguồn Data Pack với bản niêm phong lúc nhập, giúp phát hiện sửa dữ liệu nền.
5. **Đối soát quyết định:** chạy lại engine và so với kết quả đang lưu, có xét các mốc bị khoá. Đọc chi tiết chênh lệch nếu có.

## So với mã đã lưu độc lập

Lưu **số thứ tự** và **mã băm đầu chuỗi** ở một nơi độc lập với cơ sở dữ liệu ứng dụng. Ở lần kiểm sau, nhập đúng cặp đó vào phần so sánh mốc đã lưu.

| Kết quả   | Cách hiểu                                                                 |
| --------- | ------------------------------------------------------------------------- |
| MATCH     | Bản ghi tại số thứ tự đó khớp dấu đã lưu                                  |
| MISMATCH  | Cùng số thứ tự nhưng dấu băm khác; cần điều tra                           |
| NOT_FOUND | Không tìm thấy số thứ tự đã lưu, có thể thiếu lịch sử hoặc sai môi trường |

Đầu chuỗi hiện tại thay đổi khi có thao tác mới; hãy so tại đúng số thứ tự cũ, không so dấu cũ với đầu mới mà bỏ qua số thứ tự.

## Khi phát hiện bất thường

Ghi nhận môi trường, thời điểm, khối lỗi, số thứ tự hoặc mã sự kiện; xuất nhật ký để điều tra. Đối chiếu bản sao lưu hoặc mốc niêm phong độc lập trước khi phục hồi. Không sửa bản ghi trực tiếp để biến kết quả thành xanh vì sẽ làm mất dấu vết.

> **Giới hạn:** người có quyền thay toàn bộ cơ sở dữ liệu và tính lại cả chuỗi có thể tạo ra chuỗi tự nhất quán. Không có dấu băm được lưu độc lập thì kiểm tra nội bộ không chứng minh được lịch sử chưa từng bị viết lại. Bản demo chưa gửi dấu lên blockchain hay dịch vụ dấu thời gian.

Kết quả toàn vẹn cũng không chứng minh một chứng từ phản ánh sự kiện có thật; thẩm quyền và nội dung nghiệp vụ vẫn phải được kiểm tra. Xem [Nhật ký](/guide/activity), [Ngoại lệ](/guide/exceptions) và [Kiểm tra chữ ký](/guide/signing).
