# Đối chiếu 8 loại mốc chưa có nhãn công khai

Ngày 24/10/2026, spec 1.1. Nguồn là `01_data/{contracts,parties,milestones,events,payment_rules}.csv` trong Data Pack BTC. Đây là đối chiếu raw event với cách hiểu hiện tại của đội, **không phải đáp án BTC** và không phân loại ID nào HIDDEN/HOLDOUT.

Các ví dụ dưới đây đều có đủ điều kiện theo baseline và không bị dispute/rejection/sai actor. Việc cả 8 ví dụ ra RELEASE không thay cho kiểm ca HOLD/REJECT/PENALTY; các ca đó nằm trong mẫu công khai và test biên. Không chọn ví dụ theo ground truth ẩn.

## 1. Bằng chứng đầu vào và kết quả suy ra

| Loại / mốc | Required events và actor thực | Approval cần/đã có | Completion theo required events | Hạn + grace | Kết quả suy ra / triệu VND |
| --- | --- | --- | --- | --- | --- |
| SIGNING / MS0001 | EV00001 CONTRACT_SIGNED, B009, 24/04/2026 09:20 CONFIRMED | Không cần | 24/04/2026 | 26/04 + 2 ngày = 28/04 | RELEASE, payable 258.00, penalty 0.00 |
| DELIVERY / MS0002 | EV00002 DELIVERY S021 05/06 09:50; EV00003 INVOICE S021 06/06 10:20, đều CONFIRMED | Không cần | 06/06/2026 | 08/06 + 2 = 10/06 | RELEASE, payable 516.00, penalty 0.00 |
| WARRANTY / MS0004 | EV00005 WARRANTY_COMPLETED S021 28/07 09:50 CONFIRMED | Không cần | 28/07/2026 | 30/07 + 2 = 01/08 | RELEASE, payable 129.00, penalty 0.00; không bật phạt |
| REQUIREMENTS_APPROVAL / MS0014 | EV00023 REQUIREMENTS_APPROVED B007 06/04 09:20 CONFIRMED | Không cần | 06/04/2026 | 06/04 + 10 = 16/04 | RELEASE, payable 2002.50, penalty 0.00 |
| GO_LIVE_ACCEPTANCE / MS0016 | EV00027 GO_LIVE S005 07/07; EV00028 ACCEPTANCE B007 08/07; EV00029 INVOICE S005 09/07, đều CONFIRMED | Không cần | 09/07/2026 11:10 | 10/07 + 10 = 20/07 | RELEASE, payable 5340.00, penalty 0.00 |
| WARRANTY_CLOSE / MS0017 | EV00030 WARRANTY_COMPLETED S005 04/08 09:30 CONFIRMED | Không cần | 04/08/2026 | 07/08 + 10 = 17/08 | RELEASE, payable 1335.00, penalty 0.00; không bật phạt |
| KICKOFF / MS0018 | EV00031 CONTRACT_SIGNED B010 27/06; EV00032 KICKOFF_CONFIRMED B010 28/06 10:10, đều CONFIRMED | CONTRACT_OWNER; EV00033 A028 28/06 17:10 APPROVED | **28/06 10:10**, không lấy 17:10 của approval | 30/06 + 5 = 05/07 | RELEASE, payable 337.50, penalty 0.00 |
| ACTIVATION / MS0047 | EV00115 CONTRACT_SIGNED B009 08/08; EV00116 SERVICE_ACTIVATED S013 09/08 10:10, đều CONFIRMED | CONTRACT_OWNER + SECONDARY_APPROVER; EV00117 A025 và EV00118 A027 cùng 09/08 APPROVED | **09/08 10:10**, không lấy 17:20 của approval | 09/08 + 7 = 16/08 | RELEASE, payable 921.00, penalty 0.00; không bật phạt |

Các actor BUYER/SUPPLIER được đối chiếu với đúng hai bên của hợp đồng, approver đối chiếu `parent_party_id`, role và quyền duyệt trong `parties.csv`. Không dùng chuỗi actor_role do event tự khai để quyết định quyền.

## 2. Điều cần lưu ý khi đọc bảng

- MS0014, MS0016, MS0018 và MS0047 dùng các loại event còn liên quan A01. Sự nhất quán của raw data và quy trình là căn cứ của đội; bốn câu trả lời BTC chưa trực tiếp xác nhận ma trận thẩm quyền cho các loại này.
- MS0047 có `invoice_required=TRUE` nhưng required list và DSL chỉ có CONTRACT_SIGNED + SERVICE_ACTIVATED. Không thêm INVOICE vào rule vì một cột flag; ghi A08 và chờ BTC làm rõ. Vì vậy confidence của trường hợp này là 0.80 theo heuristic, không phải xác suất.
- Approval muộn hơn completion trong MS0018/MS0047 nhưng cùng ngày: có thể vẫn ra cùng số ngày trễ nếu cài sai timestamp. Cần test khác ngày theo ví dụ BTC để phát hiện lỗi, không chỉ nhìn kết quả RELEASE.
- Mỗi `release_rule_code` lấy đúng bộ rule active, priority first-match. Không dùng thứ tự milestone để buộc mốc sau phải chờ mốc trước nếu CSV không quy định.

## 3. Tái kiểm và ký duyệt của đội

Chạy `python3 tools/ra_soat_btc.py` để xác định 8 loại chưa có sample, rồi tìm các ID trên trong `artifacts/btc-review/audit.json` và CSV gốc. Đối chiếu event, actor, timestamp, quorum, due/grace, rule ID và số tiền. Các thành viên nghiệp vụ nên rà bảng trước khi đưa vào proposal; tài liệu không khẳng định đội đã có chữ ký duyệt hay đáp án hidden.
