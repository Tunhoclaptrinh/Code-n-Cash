# Kịch bản thuyết trình 7 phút

Tài liệu tập dượt nội bộ, không nộp. Theo bộ slide 15 trang ([CodeCash_Vong3_Pitch.html](CodeCash_Vong3_Pitch.html); bản `.pptx`/`.pdf` ở `CodeAndCash_VONG3/04_Document/Slide/`). Trên bản HTML, phím N hiện ghi chú người nói.

BTC yêu cầu slide "ngắn gọn, trực quan, đúng trọng tâm, phục vụ Demo" và ưu tiên phần demo, kết quả thực tế. Vì vậy slide 1–8 đi nhanh (2 phút 30 giây), demo trực tiếp chiếm 2 phút 30 giây, phần bằng chứng 2 phút. Câu BTC muốn nghe xuyên suốt: "Điểm mạnh nhất của sản phẩm là gì và chứng minh như thế nào?" Câu trả lời của đội: **không chi tiền khi chưa đủ căn cứ, và chứng minh được vì sao.**

## Phân bổ

| Slide | Nội dung | Mốc giờ | Thời lượng |
|---|---|---|---|
| 1 | Bìa | 0:00 | 10 giây |
| 2 | Problem & Value | 0:10 | 25 giây |
| 3 | Solution Overview | 0:35 | 25 giây |
| 4 | Kiến trúc | 1:00 | 20 giây |
| 5 | Chín bước chấm một mốc | 1:20 | 20 giây |
| 6 | Luật và tính tiền | 1:40 | 20 giây |
| 7 | Thẩm quyền và phân quyền | 2:00 | 15 giây |
| 8 | Key Features | 2:15 | 15 giây |
| 9 → web | Ví dụ CT0103, chuyển sang demo trực tiếp | 2:30 | 2 phút 30 giây |
| 10 | Tình huống khó | 5:00 | 20 giây |
| 11 | Đầu ra, truy vết, kiểm chứng | 5:20 | 20 giây |
| 12 | Evidence & KPI | 5:40 | 25 giây |
| 13 | Baseline và kiểm thử cài lỗi | 6:05 | 20 giây |
| 14 | Impact & Next Step | 6:25 | 25 giây |
| 15 | Kết | 6:50 | 10 giây |

## Lời nói từng slide

Lời dưới đây là bản nói tự nhiên, không đọc nguyên văn. Chữ **đậm** là ý bắt buộc phải nói.

**Slide 1 · Bìa (10 giây)**
"Chúng tôi là đội Code & Cash. CodeCash chạy hợp đồng có điều kiện thanh toán từ lúc ký đến lúc chi. **Chưa đủ căn cứ thì không chi, và mọi quyết định đều giải thích, truy vết được.**"

**Slide 2 · Problem & Value (25 giây)**
"Giao trễ 4 ngày, ân hạn 2 ngày, phạt bao nhiêu? Biên bản nghiệm thu do ai lập mới hợp lệ? Đang tranh chấp có được chi không? Hôm nay những câu này được kiểm bằng tay, nên dễ chi sai và không trả lời được ai duyệt, dựa trên chứng từ nào. Người dùng gồm bên mua, nhà cung cấp và bộ phận kiểm soát. Giá trị: **không chi sai, giải thích được, không ai sửa lén.** Hệ thống chạy trên toàn bộ Data Pack: 100 hợp đồng, 405 mốc, 1.134 sự kiện."

**Slide 3 · Solution Overview (25 giây)**
"Mỗi thao tác là một sự kiện. Sau mỗi sự kiện, engine chấm lại mốc theo bộ luật và ra một trong bốn quyết định, kèm số tiền và lý do. Ba nguyên tắc: **luật là dữ liệu**, không gắn cứng theo hợp đồng; **nghi ngờ thì tạm giữ**; và **không ai sửa kết quả**: muốn đổi phải có sự kiện mới của đúng bên, hoặc ngoại lệ có hai người duyệt."

**Slide 4 · Kiến trúc (20 giây)**
"Trình duyệt không quyết định gì. API xử lý nghiệp vụ và phân quyền, engine Python tính quyết định và tiền bằng số thập phân chính xác. Khung viền liền là phần đội tự xây dựng; khung gạch đứt là mô phỏng hoặc dịch vụ ngoài. Ký số và cổng thanh toán là mô phỏng. **AI chỉ đề xuất điều khoản, không tham gia quyết định thanh toán.**"

**Slide 5 · Chín bước (20 giây)**
"Engine lọc chứng từ trước: khử trùng lặp, loại chứng từ sai thẩm quyền. Sau đó kiểm các yếu tố chặn, rồi mới chọn luật và tính tiền. Hai chi tiết hay bị làm sai: **đếm phê duyệt theo vai trò, không theo số người**, và **ngày hoàn thành lấy theo chứng từ, không theo lúc duyệt**."

**Slide 6 · Luật và tính tiền (20 giây)**
"Đây là bộ luật của BTC: tám luật chạy theo ưu tiên, dừng ở luật đầu tiên khớp. Năm luật đầu là yếu tố chặn, luôn xét trước phạt. Tiền phạt có trần, làm tròn trước khi trừ, nên được chi cộng phạt luôn bằng giá trị mốc. Hai chốt an toàn chặn mọi luật trả tiền nếu còn tranh chấp hay thiếu điều kiện, kể cả khi bộ luật bị viết sai."

**Slide 7 · Phân quyền (15 giây)**
"Hai lớp quyền: bên nào được lập chứng từ gì theo Data Pack, do engine kiểm; và người dùng nào được làm gì, do API kiểm, với 8 vai trò. **Người lập chứng từ không phải người duyệt chi**; người đề xuất vô hiệu không tự duyệt đề xuất của mình."

**Slide 8 · Key Features (15 giây)**
"Cột trái đều đã chạy được trên dữ liệu thật. Cột phải tách rõ phần mô phỏng và phần định hướng: ký qua tổ chức chứng thực được cấp phép, nối cổng ngân hàng thật. Bây giờ xin demo trực tiếp."

**Slide 9 → Demo trực tiếp (2 phút 30 giây)**
Để slide 9 trên màn 10 giây: "Đây là ca sắp demo: mốc giao hàng 740 triệu, giao trễ 2 ngày sau ân hạn." Rồi chuyển sang web và làm theo [KICH_BAN_DEMO.md](../KICH_BAN_DEMO.md) mục 3, bước 1–8. Người thao tác bấm, người trình bày nói. Khi quay lại slide, nói: "Đó là một ca. Cùng engine đó chạy trên cả 405 mốc."

**Slide 10 · Tình huống khó (20 giây)**
"Khi dữ liệu thiếu, bất thường hay còn tranh chấp, hệ thống không đoán. Nó giữ tiền và chỉ rõ ai phải làm gì tiếp. Chứng từ sai thẩm quyền được xử lý bằng hai người: chủ hợp đồng đề xuất, một kiểm soát viên khác duyệt, nhật ký ghi lại cả hai."

**Slide 11 · Truy vết (20 giây)**
"Mỗi dòng trong 405 dòng có luật, căn cứ và trace về dữ liệu đầu vào. Ai cũng chạy lại được bằng công cụ Python độc lập. Độ tin cậy: 385 mốc là 1,00; 15 mốc là 0,80 vì phụ thuộc một điểm BTC chưa chốt về hoá đơn. **Độ tin cậy không bao giờ đổi quyết định.**"

**Slide 12 · KPI (25 giây)**
"Ba con số: **quyết định đúng 20 trên 20, chi sai bằng 0, số tiền khớp tuyệt đối.** Và giới hạn, đội tự nói trước: 20 mẫu là quá ít, khoảng tin cậy 95% là 83,9 đến 100%, và engine được viết khi đã đọc 20 mẫu này. 33 kịch bản tổng hợp do đội gán đáp án, nên chỉ đo độ phủ. Độ chính xác thật do tập ẩn của BTC quyết định."

**Slide 13 · Baseline và cài lỗi (20 giây)**
"Một hệ luôn chi đủ cũng đúng được 8 trên 20, nhưng chi sai cả 10 mốc chưa đủ điều kiện. Để biết bộ kiểm thử có tác dụng, đội cài 16 lỗi thật vào engine: 20 mẫu của BTC chỉ bắt được 7; bộ ca tổng hợp lần đầu bắt 11. **Con số khách quan là 11 trên 16.**"

**Slide 14 · Impact (25 giây)**
"Trên chính Data Pack, engine giữ lại 42 mốc với hơn 56 tỷ đồng chưa đủ điều kiện, và trừ phạt đúng công thức 15 mốc trễ hạn. Chấm lại cả 405 mốc dưới 1 giây. Triển khai được bằng Docker Compose; đổi luật bằng dữ liệu. Hướng tiếp theo: đưa nhật ký và niêm phong quyết định lên sổ cái blockchain dùng chung, để không bên nào sửa một mình được. Giới hạn: ít nhãn, hai điểm BTC chưa chốt, ký số và chi tiền còn là mô phỏng."

**Slide 15 · Kết (10 giây)**
"**Điểm mạnh nhất của CodeCash: không chi tiền khi chưa đủ căn cứ, và chứng minh được vì sao.** Mời Ban giám khảo chọn bất kỳ hợp đồng, mốc hoặc KPI nào để kiểm chứng trực tiếp." Giữ slide này trên màn khi vào Q&A.

## Phân vai đề xuất

| Người | Việc |
|---|---|
| Người trình bày | Nói toàn bộ, cầm nhịp giờ |
| Người thao tác | Điều khiển web trong demo và Q&A; chạy lệnh CLI khi BGK yêu cầu |
| Người hỗ trợ | Bấm giờ, giơ ký hiệu khi còn 1 phút; mở video dự phòng nếu web lỗi; tra `KICH_BAN_DEMO.md` mục 5 và 6 khi BGK hỏi |
