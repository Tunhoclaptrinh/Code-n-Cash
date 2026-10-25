# Xác nhận BTC và những điều chưa được xác nhận

Nguồn: nội dung đội đã hỏi và BTC trả lời, do người dùng chuyển nguyên văn trong phiên làm việc ngày 24 và 25/10/2026 (giờ Bangkok). Đây là nguồn đội cung cấp; repo chưa kèm ảnh/link/thời điểm gốc của cuộc trao đổi. Khi đưa vào hồ sơ nộp, đội giữ lại bằng chứng kênh hỏi đáp. Không suy rộng những câu trả lời này thành xác nhận mọi giả định của hệ thống.

## 1. Ngày hoàn thành thực tế — A03 đã được làm rõ

BTC xác nhận: ngày/thời điểm hoàn thành là **thời điểm muộn nhất trong các required event hợp lệ cần thiết để milestone hoàn thành điều kiện nghiệp vụ**, không phải event cuối cùng của milestone.

Ví dụ BTC: DELIVERY 10/10, INVOICE 11/10, ACCEPTANCE 14/10, APPROVAL 16/10 → actual completion 14/10. APPROVAL, DISPUTE_RESOLVED và event quản trị muộn hơn không tự đẩy ngày hoàn thành. Trễ sau ân hạn tính bằng hiệu ngày so với `due_date + grace_period_days`, chỉ lấy phần lớn hơn 0.

Áp dụng: BR-11 giữ bản hợp lệ sớm nhất của từng loại required event sau dedup, rồi lấy mốc thời gian muộn nhất của bộ này. Nếu chưa đủ required events thì chưa có completion. Cách chọn bản khi có nhiều chứng từ khác nhau cùng loại vẫn là quy ước đội cần nêu, không được gán tất cả chi tiết đó là lời BTC.

Kiểm thử: `tests/test_btc_clarifications.py` dựng đúng ví dụ, thêm resolve ngày 20/10; completion vẫn 14/10 và số ngày phạt không tăng theo approval/resolve.

## 2. Dispute — tách Bronze và extension Silver

BTC xác nhận Bronze không bắt buộc một mô hình phân quyền riêng cho người giải quyết dispute. Chỉ cần xử lý đúng event trong Data Pack: dispute mở → HOLD; `DISPUTE_RESOLVED` tham chiếu dispute tương ứng thì gỡ trạng thái mở và tiếp tục kiểm điều kiện khác.

Đội được thêm stakeholder ở Silver/Gold, nhưng phải mô tả ai được OPEN/RESOLVE, lưu audit và không thay đổi/mâu thuẫn logic chuẩn hay ground truth chấm.

Áp dụng:

- Profile bài nộp đọc linked event RESOLVED: đúng trạng thái, reference, milestone/hợp đồng và không trước lúc mở. Không áp thêm vai trò resolver do ứng dụng tự định nghĩa.
- Profile workflow Silver hiện cho người đủ quyền bên mua xử lý; vẫn kiểm active, tổ chức, phân quyền và audit. Không tự cấp quyền cho supplier, controller hay sysadmin qua nút điền mẫu.
- Tám event resolve trong dữ liệu gốc đều do BUYER; tách hai profile không làm đổi kết quả 405 mốc. Có test synthetic chỉ ra hai profile khác nhau khi supplier resolve; đây là dữ liệu tự tạo, không phải hidden ground truth.
- REJECTION vẫn theo `parties.csv`, status và role đúng hợp đồng. BTC chưa xác nhận mọi giả định liên quan rejection chỉ bằng câu trả lời về dispute.

## 3. Confidence — A14 đã được làm rõ về ý nghĩa và thang đo

BTC xác nhận `0.0 ≤ confidence_score ≤ 1.0`, là độ tin cậy hệ thống tự gán cho quyết định. BTC không bắt buộc công thức, đội cần giải thích cách tính. Confidence không thay quyết định: dispute mở vẫn HOLD dù confidence cao.

Quy ước hiện tại của đội, giữ nguyên từ baseline:

| Điểm | Điều kiện | Diễn giải |
| --- | --- | --- |
| 1.00 | Không có issue và không gắn cờ giả định A05/A07/A08 | Chắc chắn theo rule/facts đang chọn, không phải xác suất đúng đáp án BTC |
| 0.80 | Có một trong các cờ giả định nêu trên | Cần lưu ý điểm diễn giải chưa được BTC làm rõ |
| 0.50 | Có lỗi cấu trúc/bất thường | Cần rà dữ liệu; không cho điểm số mở thanh toán |

Trên pack hiện tại: 359 mốc 1.00, 46 mốc 0.80, 0 mốc 0.50. Chưa có calibration hay ground truth đầy đủ để diễn giải điểm thành xác suất hoặc dùng làm accuracy.

## 4. Hidden/Holdout — A16 đã được làm rõ

BTC xác nhận **405 milestone = 20 PUBLIC + 250 HIDDEN + 135 HOLDOUT**. Hidden không phải bộ hợp đồng/event hoàn toàn mới; schema và logic tuân theo Data Pack đã công bố. Điều bị giấu là ground truth và danh sách chia mốc vào tập HIDDEN/HOLDOUT.

Áp dụng: xử lý tất cả milestone trong `submission_output_template.csv`, xuất đủ 405 dòng, không hard-code 20 scenario và không tự chọn 250 dòng. 385 mốc không có nhãn không thể phân loại mốc nào HIDDEN hoặc HOLDOUT bằng suy đoán. Tệp metadata trong manifest chỉ cho biết một artifact tồn tại, không cung cấp nội dung artifact BTC giữ riêng.

## 5. ELSE là nhánh mặc định, không phải event

BTC làm rõ ngày 25/10: khi không có rule nào trước đó khớp thì dùng rule cuối. Trạng thái chưa đủ rõ để trả tiền cần HOLD để kiểm tra; không tạo event, loại mốc hay scenario mang tên ELSE. Sample công khai không bắt buộc có ca đi vào nhánh này.

Áp dụng: giữ first-match theo priority; ELSE cuối phạm vi (priority 80) → HOLD / UNRESOLVED_CONDITION, payable và penalty đều bằng 0. Test bổ sung dựng ca mà các điều kiện trước đều FALSE, kiểm rule mặc định chạy dù chỉ có DELIVERY/INVOICE, không có event ELSE. Dữ liệu này là test tự tạo; không sửa Data Pack hay sample công khai.

## 6. Ground truth và câu hỏi có phải huấn luyện mô hình không

BTC giải thích ground truth là đáp án chuẩn/tham chiếu để chấm kết quả milestone, ví dụ decision, reason và payable. BTC không cung cấp toàn bộ nhãn và đội không phải tự tạo ground truth cho toàn bộ dữ liệu.

**Diễn giải của đội:** đoạn BTC nhắc thuật ngữ trong học máy không bổ sung một yêu cầu bắt buộc huấn luyện mô hình. Chưa có chỉ dẫn nào trong phần trao đổi được cung cấp buộc thay rule engine bằng ML. Lõi Bronze tiếp tục chạy luật công khai trên toàn bộ Data Pack. Hai mươi mẫu dùng để kiểm chứng, không biến thành bảng tra quyết định hay bộ huấn luyện cho 405 mốc.

AI đọc hợp đồng là phần bổ trợ khác: đề xuất trường và nguồn trang/đoạn trích; không sinh quyết định thanh toán. Dùng model có sẵn qua adapter không có nghĩa đội đã tự huấn luyện model. Nếu sau này làm training/fine-tuning thì cần kế hoạch dữ liệu gán nhãn và đánh giá riêng; không gọi dự đoán của chính engine là ground truth BTC.

## 7. Slide và thời gian trình bày

BTC nhắc slide tối đa 15 trang, phần Trình bày & vấn đáp tính 10 điểm; thời lượng chính thức sẽ thông báo cùng phương án sơ khảo. **Dự kiến không quá 5 phút**, chưa phải xác nhận lịch/giờ cụ thể.

Đội dùng 8 slide chính trong 5 phút, phần còn lại làm phụ lục, theo Bài toán → Giải pháp → Logic xử lý → KPI → Demo/Mockup → Kế hoạch MVP. Khung và thời lượng từng slide ở [khung slide](templates/SLIDE_STRUCTURE.md).

## 8. Những điều các câu trả lời chưa giải quyết

| Mã | Điều còn mở | Cách đang dùng | Ảnh hưởng đo được |
| --- | --- | --- | --- |
| A01 | Ma trận thẩm quyền 4 loại required event chưa có sample | Theo party thực và quy trình trong Data Pack; bỏ cách hiểu literal cột quyền gây lệch sample | 80 mốc cần nêu căn cứ; dùng literal cho mọi loại làm đổi 108 kết quả và chỉ khớp 15/20 mẫu |
| A04 | Nhiều event/chứng từ cùng loại, dedup và bản đại diện | Giữ bản hợp lệ sớm nhất mỗi loại sau dedup theo khóa đã nêu trong spec | Đã kiểm ca synthetic; không suy công thức dedup được BTC xác nhận |
| A05 | Dispute theo milestone hay lan toàn hợp đồng | Theo milestone, như scope rule và sample | Nếu lan hợp đồng: 31 mốc đổi kết quả |
| A07 | Chế độ làm tròn số thập phân | ROUND_HALF_UP, penalty trước rồi trừ | HALF_EVEN làm MS0396 lệch 0.01 triệu VND |
| A08 | `invoice_required=TRUE` nhưng required list không có INVOICE | Theo required list/DSL, không tự thêm event | 15 mốc ACTIVATION đổi sang HOLD nếu bắt thêm INVOICE |
| A13 | BTC chấm cú pháp text conditions/evidence như thế nào | Giữ token DSL và delimiter `;`, giải thích chi tiết ở audit | Chưa có evaluator kín để đối chiếu |
| A15 | Cách nộp CSV/source/video, hạn chính thức | Chuẩn bị CSV và hai PDF theo đề, xác minh kênh nộp | Không suy từ câu trả lời về hidden test |

Không dùng việc “0 bất biến vi phạm” hoặc “20/20 mẫu” để đóng các điểm này. Báo cáo kỹ thuật và thứ tự ưu tiên ở [14 — Rà soát Đồng/Bạc/Vàng](14_RA_SOAT_BTC_DONG_BAC_VANG.md).
