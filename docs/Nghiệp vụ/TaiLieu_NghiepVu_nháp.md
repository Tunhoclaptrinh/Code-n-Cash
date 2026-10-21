# CASE 4 — SMART CONTRACT WORKFLOW
## Tài liệu định nghĩa và phân tích nghiệp vụ

| Mục | Nội dung |
|---|---|
| Cuộc thi | Festival Chuyển đổi số 2026 — Vòng sơ khảo — Bảng D — Case 4 |
| Phiên bản | 0.1 (bản nháp để cả đội thống nhất) |
| Ngày lập | 20/10/2026 |
| Nguồn | Đề thi Bảng D; Data Pack v1.0 (snapshot 18/10/2026): README, data dictionary, 5 file dữ liệu, 2 file mẫu, 1 file template |
| Đối tượng đọc | Toàn đội thi (nghiệp vụ, kỹ thuật, thuyết trình) |
| Mục đích | Thống nhất **cách hiểu bài toán, thuật ngữ và quy tắc nghiệp vụ** trước khi thiết kế giải pháp |

### Quy ước nhãn độ tin cậy

Mỗi khẳng định quan trọng trong tài liệu mang một nhãn để đội biết nên tin đến mức nào.

| Nhãn | Ý nghĩa |
|---|---|
| **[ĐỀ]** | Nêu trực tiếp trong đề thi hoặc README của BTC |
| **[DỮ LIỆU]** | Đã kiểm chứng bằng cách chạy trên toàn bộ Data Pack |
| **[SAMPLE]** | Suy ra từ 20 dòng mẫu công khai (khớp 20/20 nhưng chưa phải toàn bộ ground truth) |
| **[GIẢ ĐỊNH]** | Đội tạm chọn, cần xác nhận với BTC hoặc ghi rõ trong hồ sơ (xem mục 13) |

### Quy ước ngôn ngữ

- Thuật ngữ nghiệp vụ dùng tiếng Việt, kèm tên tiếng Anh/tên trường dữ liệu lần đầu xuất hiện, ví dụ: *mốc thanh toán (milestone)*.
- Bốn quyết định luôn viết hoa, giữ nguyên tiếng Anh: **RELEASE, HOLD, REJECT, PENALTY**.
- Đơn vị tiền luôn là **triệu VND** (hậu tố `_vnd_mn`). Tỷ lệ phần trăm lưu dạng số phần trăm (0.10 nghĩa là 0,10%, không phải 10%).
- Mã định danh viết dạng `code`: `CT0001` (hợp đồng), `MS0001` (milestone), `EV00001` (event), `PR0001` (rule).

---

## 1. Tóm tắt điều hành

**Bài toán.** Trong mua bán và cung ứng, tiền được trả theo từng mốc (ký, giao hàng, nghiệm thu, bảo hành...). Kiểm tra thủ công dễ dẫn tới trả tiền khi chưa đủ điều kiện, xử lý chậm và thiếu dấu vết. Đội cần mô phỏng một hệ thống **tự động kiểm tra điều kiện của từng mốc, ra quyết định và giải thích được quyết định đó**.

**Cốt lõi nghiệp vụ trong một câu.** *Với mỗi mốc thanh toán, hệ thống gom các sự kiện làm bằng chứng, loại bỏ sự kiện lặp và sự kiện sai thẩm quyền, rồi áp dụng bộ rule theo thứ tự ưu tiên để ra một trong bốn quyết định kèm số tiền và lý do.*

**Năm điều cần nhớ.**

1. Đơn vị ra quyết định là **milestone** (405 mốc), không phải hợp đồng. **[ĐỀ]**
2. Rule chạy theo **first-match**, ưu tiên từ 10 đến 80: *chặn trước, tính tiền sau*. **[ĐỀ]**
3. Khi dữ liệu thiếu hoặc không rõ, mặc định **HOLD**, không bao giờ tự RELEASE. **[ĐỀ]**
4. Trọng tâm KPI là **Unauthorized Payment Rate gần 0**: sai theo hướng "giữ thừa" an toàn hơn sai theo hướng "trả nhầm". **[ĐỀ]**
5. Không được hard-code theo 20 sample công khai, vì BTC có ground truth và hidden test riêng. **[ĐỀ]**

**Kết quả thăm dò.** Một engine nháp chỉ dùng chính các rule trong dữ liệu khớp **20/20** sample về quyết định, lý do, số tiền thanh toán và tiền phạt. Điều này cho thấy các rule công khai đủ để tái hiện logic của BTC. **[SAMPLE]**

---

## 2. Bối cảnh và phạm vi

### 2.1. Vấn đề nghiệp vụ

Thanh toán thường gắn với các mốc như ký hợp đồng, giao hàng, nghiệm thu, phê duyệt và bảo hành. Kiểm tra thủ công có thể dẫn tới: **[ĐỀ]**

- thanh toán khi chưa đủ điều kiện;
- xử lý chậm;
- khó theo dõi trạng thái;
- thiếu lịch sử kiểm tra (audit trail).

### 2.2. Mục tiêu của hệ thống

- Mô hình hóa chuỗi **Hợp đồng → Milestone → Sự kiện → Kiểm tra rule → Quyết định → Audit log**.
- Kiểm tra: sự kiện bắt buộc, quyền của người tạo sự kiện, ngưỡng phê duyệt, tranh chấp/từ chối và điều kiện thời hạn.
- Ra quyết định RELEASE / HOLD / REJECT / PENALTY theo thứ tự ưu tiên của rule.
- Tính số tiền được thanh toán và tiền phạt khi vi phạm thời hạn.
- Truy vết được: quyết định dựa trên sự kiện nào, rule nào, người nào.

### 2.3. Ngoài phạm vi

- Không bắt buộc blockchain, Solidity, tiền mã hóa hoặc ví điện tử. **[ĐỀ]**
- Kết quả **không phải** quyết định pháp lý, thanh toán hay giải ngân thực tế. Toàn bộ dữ liệu là giả lập. **[ĐỀ]**

### 2.4. Nguyên tắc thiết kế

| Nguyên tắc | Hệ quả |
|---|---|
| An toàn trước, nhanh sau | Có nghi ngờ thì HOLD |
| Giải thích được | Mỗi quyết định gắn với rule, sự kiện và người tạo sự kiện |
| Không hard-code | Rule đọc từ dữ liệu, không viết điều kiện theo mã milestone cụ thể |
| Đơn giản nhưng đúng | Đề đánh giá cao workflow đúng logic hơn giải pháp công nghệ phức tạp |

---

## 3. Bảng thuật ngữ nghiệp vụ

| Thuật ngữ (tên trường) | Định nghĩa | Không nhầm với |
|---|---|---|
| **Hợp đồng** (`contract`) | Thỏa thuận mua bán/cung ứng giữa một bên mua và một nhà cung cấp, có giá trị tổng và các tham số chung (phê duyệt, phạt). Có 100 hợp đồng. | Milestone: hợp đồng là cả thỏa thuận, milestone là một giai đoạn của nó |
| **Mốc thanh toán** (`milestone`) | Một giai đoạn của hợp đồng gắn với một việc cụ thể, một hạn và một phần giá trị hợp đồng. Hoàn thành đúng điều kiện thì phần tiền đó được thanh toán. Có 405 mốc. **Đây là đơn vị ra quyết định.** | Event: milestone là "kết quả cần đạt", event là "việc đã xảy ra" |
| **Sự kiện** (`event`) | Một sự việc đã xảy ra và được ghi lại: giao hàng, hóa đơn, nghiệm thu, phê duyệt, từ chối, mở/đóng tranh chấp... Có 1.134 sự kiện. | |
| **Bằng chứng** (`evidence`) | Sự kiện **hợp lệ** được dùng để chứng minh một điều kiện đã đạt. Chỉ sự kiện qua khử trùng lặp và kiểm tra thẩm quyền mới là bằng chứng. | Sự kiện thô: có sự kiện không phải bằng chứng (bản lặp, sai thẩm quyền) |
| **Sự kiện bắt buộc** (`required_event_types`) | Danh sách loại sự kiện mà milestone phải có. Mỗi loại cần ít nhất một sự kiện hợp lệ. | Sự kiện hỗ trợ (phê duyệt, tranh chấp, từ chối) |
| **Bên tham gia / người tạo sự kiện** (`party` / `actor`) | Tổ chức hoặc vai trò tạo ra sự kiện. Có 3 loại: bên mua, nhà cung cấp, người phê duyệt. | |
| **Phê duyệt** (`APPROVAL`) | Sự kiện do người phê duyệt có quyền xác nhận cho phép thanh toán một milestone. | Nghiệm thu: nghiệm thu do bên mua xác nhận chất lượng, phê duyệt là cho phép chi tiền |
| **Ngưỡng phê duyệt** (`quorum`) | Số phê duyệt hợp lệ tối thiểu để milestone được thanh toán (0, 1 hoặc 2). Mỗi người phê duyệt chỉ tính một lần. | Số lượng sự kiện APPROVAL thô |
| **Tranh chấp** (`dispute`) | Một bên phản đối milestone, được ghi bằng `DISPUTE_OPENED`. Đang mở khi chưa có `DISPUTE_RESOLVED` tham chiếu tới nó. Dispute đang mở chặn thanh toán. | Từ chối |
| **Từ chối** (`rejection`) | Người phê duyệt từ chối milestone (`REJECTION`). Kết quả là REJECT, milestone chưa được thanh toán. | Tranh chấp: tranh chấp có thể được giải quyết để quy trình tiếp tục, từ chối thì là kết luận |
| **Ân hạn** (`grace_period_days`) | Số ngày sau hạn (`due_date`) mà chưa bị tính phạt. | Hạn thanh toán |
| **Phạt chậm** (`penalty`) | Khoản trừ vào tiền milestone khi hoàn thành muộn hơn hạn cộng ân hạn. Chỉ áp dụng nếu `late_penalty_applicable = TRUE`. | |
| **Giá trị kế hoạch** (`planned_payment_vnd_mn`) | Số tiền dự kiến thanh toán cho milestone nếu mọi điều kiện đạt. | Số tiền thực được thanh toán |
| **Số tiền được thanh toán** (`payable_amount_vnd_mn`) | Số tiền hệ thống cho phép thanh toán sau khi áp dụng quyết định: RELEASE bằng giá trị kế hoạch, PENALTY bằng kế hoạch trừ phạt, HOLD và REJECT bằng 0. | |
| **RELEASE** | Đủ điều kiện, cho thanh toán toàn bộ giá trị kế hoạch. | |
| **HOLD** | Tạm giữ thanh toán vì thiếu điều kiện hoặc có yếu tố chặn. Có thể tiếp tục khi điều kiện được bổ sung. | REJECT |
| **REJECT** | Từ chối milestone do có rejection hợp lệ. Chưa được thanh toán. | HOLD |
| **PENALTY** | Milestone được xử lý nhưng bị khấu trừ do hoàn thành trễ hạn. Vẫn có một phần tiền được thanh toán. | |
| **Khử trùng lặp** (`deduplication`) | Gộp các sự kiện cùng một sự việc bị ghi nhiều lần thành một bằng chứng. | Xóa dữ liệu |
| **Sự kiện sai thẩm quyền** (`unauthorized event`) | Sự kiện bắt buộc do một bên không có quyền tạo loại sự kiện đó. Không được tính là bằng chứng hợp lệ. | Sự kiện bị thiếu |
| **Rule first-match** | Duyệt rule theo ưu tiên tăng dần, rule đầu tiên có điều kiện đúng thì áp dụng và dừng. | |
| **Dấu vết kiểm toán** (`audit trail`) | Bản ghi cho biết ai, khi nào, dựa trên sự kiện và rule nào đã dẫn tới quyết định. | |
| **Snapshot** | Thời điểm dữ liệu được chốt: 18/10/2026. | Thời điểm các sự kiện xảy ra (có sự kiện mang ngày sau snapshot, xem mục 12) |
| **Ngày hoàn thành thực tế** | Ngày của sự kiện bắt buộc hợp lệ muộn nhất của milestone. Dùng để xét trễ hạn. **[SAMPLE]** | Ngày phê duyệt |

---

## 4. Các bên tham gia và quyền hạn

### 4.1. Ba loại bên

| Loại | Số lượng | Làm gì trong quy trình |
|---|---|---|
| Bên mua (`BUYER`) | 10 | Ký hợp đồng, xác nhận khởi động, nghiệm thu, giải quyết tranh chấp |
| Nhà cung cấp (`SUPPLIER`) | 25 | Giao hàng/dịch vụ, gửi hóa đơn, hoàn tất bảo hành |
| Người phê duyệt (`APPROVER`) | 30 | Phê duyệt hoặc từ chối thanh toán. Mỗi người thuộc về một bên mua |

Ba vai trò phê duyệt, mỗi vai có 10 người: `CONTRACT_OWNER` (chủ hợp đồng), `FINANCE_APPROVER` (phê duyệt tài chính), `SECONDARY_APPROVER` (phê duyệt thứ hai). **[DỮ LIỆU]**

### 4.2. Ma trận "loại sự kiện → bên được phép tạo"

Bảng này được suy ra từ hành vi thực tế của dữ liệu và tương thích với ví dụ trong README (DELIVERY do SUPPLIER, ACCEPTANCE do BUYER, APPROVAL do APPROVER). **[DỮ LIỆU]**

| Loại sự kiện | Bên tạo hợp lệ | Ghi chú |
|---|---|---|
| `CONTRACT_SIGNED`, `KICKOFF_CONFIRMED`, `REQUIREMENTS_APPROVED`, `UAT_PASSED`, `ACCEPTANCE` | Bên mua | |
| `DELIVERY`, `INVOICE`, `GO_LIVE`, `SERVICE_ACTIVATED`, `SERVICE_COMPLETED`, `WARRANTY_COMPLETED` | Nhà cung cấp | |
| `APPROVAL` | Người phê duyệt, có vai trò thuộc `required_approval_roles` của milestone | Phải thuộc đúng bên mua của hợp đồng |
| `REJECTION` | Người phê duyệt (6/6 trường hợp do `CONTRACT_OWNER`) | |
| `DISPUTE_OPENED` | Bên mua (12) hoặc nhà cung cấp (6) | Cần bên có quyền mở tranh chấp |
| `DISPUTE_RESOLVED` | Bên mua (8/8 trường hợp) | Phải tham chiếu tới một `DISPUTE_OPENED` |

**Bằng chứng kiểm tra bổ sung:** mọi sự kiện của bên mua/nhà cung cấp đều do **đúng bên mua/nhà cung cấp của hợp đồng đó** tạo, và mọi approver thuộc đúng bên mua của hợp đồng (497/497 phê duyệt). **[DỮ LIỆU]** Vì vậy kiểm tra "đúng bên của hợp đồng" nên được đưa vào để bắt các trường hợp ẩn.

### 4.3. Chính sách phê duyệt

Chính sách đặt ở cấp hợp đồng và được cụ thể hóa tại từng milestone. **[DỮ LIỆU]**

| Chính sách (`approval_policy`) | Số hợp đồng | Số milestone | Cần phê duyệt | Ngưỡng | Vai trò được tính | Tự động RELEASE |
|---|---|---|---|---|---|---|
| `AUTO_IF_ALL_CONDITIONS` | 16 | 66 | Không | 0 | (không có) | Có |
| `SINGLE_BUYER_APPROVAL` | 40 | 163 | Có | 1 | `CONTRACT_OWNER` | Không |
| `DUAL_APPROVAL` | 27 | 108 | Có | 2 | `CONTRACT_OWNER` và `SECONDARY_APPROVER` | Không |
| `FINANCE_PLUS_OWNER` | 17 | 68 | Có | 2 | `CONTRACT_OWNER` và `FINANCE_APPROVER` | Không |

Quy tắc đọc: với ngưỡng 2, cần **hai phê duyệt hợp lệ**; theo README, hai phê duyệt phải tương ứng với hai vai trò liệt kê. **[ĐỀ]**

### 4.4. Cảnh báo về cột `allowed_event_types`

Cột `allowed_event_types` trong `parties.csv` **không nhất quán** với hành vi của dữ liệu: nếu dùng nó để kiểm quyền, 119 sự kiện sẽ bị đánh dấu sai thẩm quyền (gồm toàn bộ `GO_LIVE`, `KICKOFF_CONFIRMED`, `UAT_PASSED`, `SERVICE_ACTIVATED`...) dù chúng hợp lệ. Chỉ có **6 sự kiện thật sự sai bên** (xem mục 11.4). **[DỮ LIỆU]**

→ Kiểm quyền bằng ma trận ở mục 4.2, không bằng cột `allowed_event_types`.

---

## 5. Mô hình dữ liệu và liên kết

### 5.1. Sơ đồ quan hệ

```
                    parties (65)
                    party_id (PK)
                   ▲     ▲      ▲
      buyer_id ────┘     │      └──── actor_party_id
      supplier_id        │             │
                         │             │
contracts (100) ──1:n──► milestones (405) ──1:n──► events (1.134)
 contract_id (PK)        milestone_id (PK)         event_id (PK)
 rule_set_id             contract_id (FK)          contract_id (FK)
                         release_rule_code         milestone_id (FK)
                                │                  reference_event_id ──┐
                                │                         ▲             │
                                ▼                         └─────────────┘
                         payment_rules (128)         (sự kiện tham chiếu sự kiện)
                         release_rule_code
```

### 5.2. Bảng khóa

| Từ | Đến | Quan hệ | Dùng để |
|---|---|---|---|
| `milestones.contract_id` | `contracts.contract_id` | nhiều-1 | Lấy giá trị, chính sách phê duyệt, tham số phạt |
| `events.milestone_id` | `milestones.milestone_id` | nhiều-1 | **Gom bằng chứng cho từng mốc** |
| `events.contract_id` | `contracts.contract_id` | nhiều-1 | Kiểm tra sự kiện thuộc đúng hợp đồng |
| `contracts.buyer_id`, `supplier_id` | `parties.party_id` | nhiều-1 | Xác định hai bên của hợp đồng |
| `events.actor_party_id` | `parties.party_id` | nhiều-1 | Kiểm tra quyền người tạo sự kiện |
| `parties.parent_party_id` | `parties.party_id` | nhiều-1 | Người phê duyệt thuộc bên mua nào |
| `events.reference_event_id` | `events.event_id` | nhiều-1 | `DISPUTE_RESOLVED` trỏ về `DISPUTE_OPENED` |
| `milestones.release_rule_code` | `payment_rules.release_rule_code` | 1-nhiều (8 rule) | Lấy bộ 8 rule của milestone |

`release_rule_code` có dạng `<rule_set_id>:<milestone_type>`, ví dụ `R_GOODS_STD:ACCEPTANCE`. Có 16 mã, mỗi mã có đúng 8 rule. **[DỮ LIỆU]**

### 5.3. Kiểm tra tính toàn vẹn **[DỮ LIỆU]**

| Kiểm tra | Kết quả |
|---|---|
| Khóa chính trùng | Không |
| Khóa ngoại mồ côi (events → hợp đồng, milestone, party; tham chiếu giữa các event) | Không |
| Sự kiện có `contract_id` khác hợp đồng của milestone | 0 |
| Tổng `payment_percent` mỗi hợp đồng | Đều bằng 100% |
| Tổng tiền các milestone so với giá trị hợp đồng | Khớp cho cả 100 hợp đồng |
| `milestone_id` trong template so với `milestones.csv` | Khớp đúng 405 |
| Milestone không có sự kiện nào | 0 |
| Ân hạn và mức phạt mỗi ngày ở milestone khác với hợp đồng | Không |

### 5.4. Quy ước dữ liệu **[ĐỀ]**

- Ngày: `YYYY-MM-DD`. Thời điểm: `YYYY-MM-DDTHH:MM:SS`.
- Tiền: triệu VND. `1250.00` là 1.250 triệu VND (1,25 tỷ).
- Mã dạng `CTdddd`, `MSdddd`, `EVddddd`, `PRdddd`, `Bddd`, `Sddd`, `Addd`.

---

## 6. Cấu trúc workflow theo loại hợp đồng

Mỗi loại hợp đồng dùng một mẫu workflow cố định và một bộ rule. 

### 6.1. Hàng hóa — `WF_GOODS_4STAGE`

| STT | Milestone | Sự kiện bắt buộc |
|---|---|---|
| 1 | `SIGNING` | `CONTRACT_SIGNED` |
| 2 | `DELIVERY` | `DELIVERY`, `INVOICE` |
| 3 | `ACCEPTANCE` | `ACCEPTANCE` |
| 4 | `WARRANTY` | `WARRANTY_COMPLETED` |

### 6.2. Dịch vụ — `WF_SERVICE_4STAGE`

| STT | Milestone | Sự kiện bắt buộc |
|---|---|---|
| 1 | `KICKOFF` | `CONTRACT_SIGNED`, `KICKOFF_CONFIRMED` |
| 2 | `INTERIM_DELIVERY` | `DELIVERY`, `INVOICE` |
| 3 | `FINAL_ACCEPTANCE` | `ACCEPTANCE`, `INVOICE` |
| 4 | `WARRANTY_CLOSE` | `WARRANTY_COMPLETED` |

### 6.3. Triển khai phần mềm — `WF_SOFTWARE_5STAGE`

| STT | Milestone | Sự kiện bắt buộc |
|---|---|---|
| 1 | `SIGNING` | `CONTRACT_SIGNED` |
| 2 | `REQUIREMENTS_APPROVAL` | `REQUIREMENTS_APPROVED` |
| 3 | `UAT_PASS` | `UAT_PASSED`, `INVOICE` |
| 4 | `GO_LIVE_ACCEPTANCE` | `GO_LIVE`, `ACCEPTANCE`, `INVOICE` |
| 5 | `WARRANTY_CLOSE` | `WARRANTY_COMPLETED` |

### 6.4. Bảo trì — `WF_MAINTENANCE_3STAGE`

| STT | Milestone | Sự kiện bắt buộc |
|---|---|---|
| 1 | `ACTIVATION` | `CONTRACT_SIGNED`, `SERVICE_ACTIVATED` |
| 2 | `SERVICE_COMPLETION` | `SERVICE_COMPLETED`, `INVOICE` |
| 3 | `FINAL_ACCEPTANCE` | `ACCEPTANCE` |

**Nhận xét nghiệp vụ.** Mỗi milestone có 8 rules, nếu bị penalty thì mức phạt sẽ là:
$$\text{penalty\_amount\_vnd\_mn} = \min\left( \frac{\text{days\_late\_after\_grace} \times \text{penalty\_rate\_pct\_per\_day}}{100} \times \text{planned\_payment\_vnd\_mn},\, \frac{\text{max\_penalty\_pct}}{100} \times \text{planned\_payment\_vnd\_mn} \right)$$
, và số tiền thanh toán là:
$$\max\left( 0,\, \text{planned\_payment\_vnd\_mn} - \text{penalty\_amount\_vnd\_mn} \right)$$
, nếu Release thì số tiền thanh toán là: $$\text{planned\_payment\_vnd\_mn}$$


---

## 7. Quy trình nghiệp vụ

### 7.1. Vòng đời của một hợp đồng

```
Ký hợp đồng
   │
   ▼
Chia thành các milestone ───────────────┐
   │                                    │
   ▼                                    │
[Với mỗi milestone, theo thứ tự]        │
   │                                    │
   ├─► Các bên thực hiện việc ──► ghi nhận SỰ KIỆN (giao hàng, hóa đơn,
   │                              nghiệm thu, phê duyệt, tranh chấp...)
   │
   ├─► HỆ THỐNG đánh giá milestone (mục 7.2)
   │
   ├─► Ra QUYẾT ĐỊNH: RELEASE / HOLD / REJECT / PENALTY
   │
   └─► Ghi AUDIT LOG; cập nhật trạng thái; HOLD thì chờ bổ sung và đánh giá lại
```

### 7.2. Quy trình xử lý một milestone (8 bước)

| Bước | Hành động | Dữ liệu dùng | Kết quả |
|---|---|---|---|
| 1 | Lấy thông tin milestone và hợp đồng | `milestones`, `contracts` | Điều kiện cần, chính sách phê duyệt, tham số phạt |
| 2 | Lấy mọi sự kiện của milestone | `events` theo `milestone_id` | Danh sách sự kiện thô |
| 3 | **Khử trùng lặp** | khóa mục 8 (BR-03) | Danh sách sự kiện không trùng |
| 4 | **Kiểm tra thẩm quyền** | `parties`, ma trận mục 4.2 | Sự kiện hợp lệ / sai thẩm quyền |
| 5 | **Xác định dispute và rejection** | `DISPUTE_*`, `REJECTION`, `reference_event_id` | Có dispute đang mở? Có rejection hợp lệ? |
| 6 | **Kiểm tra sự kiện bắt buộc và phê duyệt** | `required_event_types`, quorum, vai trò | Thiếu gì? Đủ quorum chưa? |
| 7 | **Xác định ngày hoàn thành và tính phạt** | ngày của sự kiện bắt buộc muộn nhất, hạn, ân hạn | Số ngày trễ, tiền phạt |
| 8 | **Áp dụng rule theo ưu tiên (first-match)** | `payment_rules` | Quyết định, mã lý do, số tiền, rule áp dụng |

Sau bước 8: ghi audit log (mã truy vết, rule, sự kiện làm bằng chứng, thời điểm, thời gian xử lý).

### 7.3. Ai làm gì trong một mốc điển hình (hàng hóa — giao hàng) (Cần check với nghiệp vụ thực tế - Tránh hard code và đảm bảo ground truth)

| Thứ tự | Bên | Việc làm | Sự kiện ghi nhận |
|---|---|---|---|
| 1 | Nhà cung cấp | Giao hàng | `DELIVERY` |
| 2 | Nhà cung cấp | Gửi hóa đơn | `INVOICE` |
| 3 | Người phê duyệt (chủ hợp đồng, và người thứ hai nếu hợp đồng yêu cầu) | Cho phép thanh toán | `APPROVAL` (1 hoặc 2) |
| 4 | Hệ thống | Đối chiếu và ra quyết định | Audit log |

Ví dụ thật: hợp đồng `CT0001`, milestone `MS0002` — `EV00002` (DELIVERY) và `EV00003` (INVOICE) cùng do `S021` tạo, đúng nhà cung cấp của hợp đồng. **[DỮ LIỆU]**

### 7.4. Vòng đời trạng thái milestone **[GIẢ ĐỊNH]**

README gợi ý bộ trạng thái dưới đây; cách ánh xạ từ quyết định sang trạng thái là đề xuất của đội, cần ghi rõ trong hồ sơ nếu dùng.

| Quyết định / lý do | Trạng thái đề xuất |
|---|---|
| RELEASE | `ELIGIBLE_FOR_PAYMENT` |
| PENALTY | `PAID_WITH_PENALTY` |
| REJECT | `REJECTED` |
| HOLD — thiếu sự kiện bắt buộc | `WAITING_EVIDENCE` |
| HOLD — chưa đủ quorum | `WAITING_APPROVAL` |
| HOLD — dispute đang mở hoặc sự kiện sai thẩm quyền | `ON_HOLD` |

Các trạng thái còn lại trong README (`PLANNED`, `IN_PROGRESS`, `COMPLETED`) dùng cho giai đoạn trước/sau khi đánh giá.

---

## 8. Quy tắc nghiệp vụ

### 8.1. Thứ tự ưu tiên của rule **[ĐỀ]**

Rule giống hệt nhau ở cả 16 mã `release_rule_code`; chỉ phạm vi áp dụng khác nhau. **[DỮ LIỆU]**

| Ưu tiên | Điều kiện | Quyết định | Mã lý do | Điều kiện | Lý do nghiệp vụ |
|---|---|---|---|---|---|
| 10 | Có dispute đang mở | HOLD | `OPEN_DISPUTE` | open_dispute == TRUE | Đang có tranh chấp thì không chi tiền |
| 20 | Có rejection hợp lệ | REJECT | `REJECTION_PRESENT` |valid_rejection_count > 0 | Người có thẩm quyền đã từ chối |
| 30 | Sự kiện bắt buộc do bên sai thẩm quyền | HOLD |`UNAUTHORIZED_EVENT` | unauthorized_required_event_count > 0| Bằng chứng không đáng tin, cần kiểm tra |
| 40 | Thiếu sự kiện bắt buộc | HOLD | `MISSING_REQUIRED_EVENT` | required_event_completion_rate < 1.0 | Chưa đủ chứng từ |
| 50 | Chưa đạt quorum phê duyệt | HOLD | `APPROVAL_QUORUM_NOT_MET` | approval_required == TRUE AND valid_approval_count < required_approval_quorum | Chưa đủ người chịu trách nhiệm xác nhận |
| 60 | Hoàn thành trễ vượt ân hạn | PENALTY | `LATE_COMPLETION` | late_penalty_applicable == TRUE AND actual_completion_date > due_date + grace_period_days | Đủ điều kiện nhưng vi phạm thời hạn: trả sau khi trừ phạt |
| 70 | Đủ mọi điều kiện | RELEASE | `ALL_CONDITIONS_MET` | all_required_conditions_met == TRUE AND open_dispute == FALSE AND valid_rejection_count == 0 | Chi đủ |
| 80 | Còn lại | HOLD | `UNRESOLVED_CONDITION` | ELSE | Không rõ thì giữ lại |

**Triết lý của thứ tự:** *chặn trước, tính tiền sau.* Các yếu tố ngăn thanh toán sai (10 đến 50) luôn được kiểm tra trước việc tính tiền phạt (60). Nếu cùng lúc có dispute mở và rejection, kết quả là HOLD vì dispute có ưu tiên 10. **[DỮ LIỆU]**

### 8.2. Danh mục quy tắc chi tiết

**BR-01. Mỗi milestone được đánh giá độc lập và nhận đúng một quyết định.** **[ĐỀ]**

**BR-02. Rule áp dụng theo first-match.** Duyệt theo `priority` tăng dần; rule đầu tiên có điều kiện đúng quyết định kết quả và dừng. **[ĐỀ]**

**BR-03. Khử trùng lặp sự kiện.**
- Hai sự kiện là một sự việc nếu trùng cả 4 yếu tố: `milestone_id`, `event_type`, `document_id`, `actor_party_id`.
- Giữ sự kiện **đến sớm nhất**, bỏ các bản gửi lại.
- Không dựa vào nội dung `event_note` ("Repeated submission received") để nhận diện, vì đó chỉ là dấu hiệu của dữ liệu mẫu.
- Lý do: duplicate không được tính nhiều lần và không làm phát sinh thanh toán nhiều lần. Duplicate **không** làm milestone bị HOLD nếu sau khi khử trùng vẫn đủ bằng chứng. **[ĐỀ]** (khóa khử trùng cụ thể: **[SAMPLE]**, khớp với SC019, SC020)

**BR-04. Sự kiện hợp lệ.** Sự kiện được tính là bằng chứng khi đồng thời thỏa:
1. `event_type` thuộc `required_event_types` của milestone;
2. trạng thái sự kiện hợp lệ;
3. người tạo đúng loại bên (ma trận mục 4.2) và đúng bên của hợp đồng;
4. không phải bản lặp (BR-03). **[ĐỀ]**

**BR-05. Sự kiện bắt buộc đầy đủ.** `condition_logic = ALL`: mỗi loại sự kiện bắt buộc cần ít nhất một sự kiện hợp lệ sau khử trùng. **[DỮ LIỆU]**

**BR-06. Phân biệt "sai thẩm quyền" và "thiếu".**
- *Sai thẩm quyền*: loại sự kiện bắt buộc có xuất hiện nhưng chỉ do bên không đúng quyền tạo (ví dụ `UAT_PASSED` do nhà cung cấp tạo).
- *Thiếu*: loại sự kiện bắt buộc không có sự kiện nào.
- Hai trường hợp cho hai mã lý do khác nhau (ưu tiên 30 và 40). **[SAMPLE]**

**BR-07. Dispute.**
- `DISPUTE_OPENED` là đang mở khi **không có** `DISPUTE_RESOLVED` nào có `reference_event_id` trỏ tới nó.
- Dispute đang mở → HOLD.
- Sau khi được giải quyết, quy trình tiếp tục đánh giá các điều kiện còn lại; sự kiện dispute đã đóng không còn nằm trong danh sách bằng chứng. **[ĐỀ]**, **[SAMPLE]** (SC009, SC010)

**BR-08. Rejection.** Có `REJECTION` hợp lệ (do người phê duyệt) → REJECT, payable bằng 0. **[ĐỀ]**

**BR-09. Phê duyệt và quorum.** Nếu `approval_required = TRUE`:
- chỉ tính `APPROVAL` có `actor_role` thuộc `required_approval_roles`;
- mỗi người phê duyệt chỉ tính một lần;
- người phê duyệt phải thuộc bên mua của hợp đồng;
- số phê duyệt hợp lệ phải đạt `required_approval_quorum`. **[ĐỀ]**, **[DỮ LIỆU]**

**BR-10. Ngày hoàn thành thực tế.** Là **ngày** (bỏ phần giờ) của sự kiện bắt buộc hợp lệ có thời điểm muộn nhất. Không tính `APPROVAL`. Ví dụ `MS0020` có `ACCEPTANCE` ngày 12/11 và `INVOICE` ngày 13/11, hoàn thành thực tế là 13/11. **[SAMPLE]** (khớp cả hai ca phạt công khai)

**BR-11. Phạt chậm.**
- Điều kiện: `late_penalty_applicable = TRUE` **và** ngày hoàn thành thực tế **lớn hơn** `due_date + grace_period_days`. **[ĐỀ]**
- Số ngày trễ: `days_late = ngày_hoàn_thành − (due_date + grace_period_days)`. **[ĐỀ]**
- Tiền phạt:

```
penalty = min( days_late × penalty_rate_pct_per_day / 100 × planned_payment ,
               max_penalty_pct / 100 × planned_payment )
```
- Làm tròn 2 chữ số thập phân. **[SAMPLE]**
Các trường phần trăm lưu theo giá trị phần trăm.

Ví dụ:

```text
0.10
```

ở `penalty_rate_pct_per_day` nghĩa là:

**0,10%/ngày**

không phải 10%.
- Ngày hoàn thành bằng đúng `due_date + grace` chưa bị phạt (điều kiện là "lớn hơn"). **[ĐỀ]**
- Milestone không áp dụng phạt thì không bao giờ có PENALTY, dù trễ.

**BR-12. Số tiền được thanh toán.**

| Quyết định | `payable_amount_vnd_mn` | `penalty_amount_vnd_mn` |
|---|---|---|
| RELEASE | = giá trị kế hoạch | 0 |
| PENALTY | = max(0, kế hoạch − phạt) | = phạt |
| HOLD | 0 | 0 |
| REJECT | 0 | 0 |

**[ĐỀ]**

**BR-13. Mặc định an toàn.** Khi điều kiện không rõ hoặc không rơi vào rule nào, kết quả là HOLD (rule 80). Không bao giờ tự RELEASE khi chưa chắc. **[ĐỀ]**

**BR-14. Truy vết.** Mỗi quyết định ghi: milestone, rule áp dụng, các sự kiện làm bằng chứng, người tạo, số tiền, thời điểm xử lý, mã truy vết. **[ĐỀ]**

**BR-15. Không dùng snapshot để loại sự kiện.** Mọi sự kiện trong dữ liệu được coi là đã xảy ra, kể cả sự kiện mang ngày sau 18/10/2026. Sample SC005 (`MS0020`) có sự kiện hoàn thành ngày 13/11/2026, tức sau snapshot, nhưng vẫn mang nhãn PENALTY với số ngày trễ tính theo chính sự kiện đó. Ngoài ra 19 sự kiện của các milestone thuộc 20 sample cũng mang ngày sau snapshot. **[SAMPLE]**, **[GIẢ ĐỊNH]**

**BR-16. Không hard-code.** Không viết điều kiện theo mã milestone, mã scenario hay mã hợp đồng cụ thể; rule đọc từ `payment_rules.csv`. **[ĐỀ]**

### 8.3. Danh sách bằng chứng (`evidence_event_ids`) **[SAMPLE]**

Qua đối chiếu 20 dòng mẫu, danh sách bằng chứng gồm:
- các sự kiện bắt buộc hợp lệ (đã khử trùng lặp);
- các phê duyệt hợp lệ;
- thêm sự kiện **dispute đang mở** hoặc **rejection** khi đó là lý do quyết định.

Không đưa vào: bản lặp, sự kiện sai thẩm quyền, sự kiện dispute đã giải quyết.

### 8.4. Ví dụ tính phạt

Milestone `MS0020` (`CT0005`): kế hoạch 900 triệu, hạn 02/11/2026, ân hạn 5 ngày, mức phạt 0,15%/ngày.

| Bước | Tính | Kết quả |
|---|---|---|
| Hạn cuối không phạt | 02/11 + 5 ngày | 07/11/2026 |
| Ngày hoàn thành thực tế | `INVOICE` (`EV00038`) ngày 13/11 | 13/11/2026 |
| Số ngày trễ sau ân hạn | 13/11 − 07/11 | 6 ngày |
| Tiền phạt | 6 × 0,15 / 100 × 900 | **8,10** triệu |
| Trần phạt | max_penalty_pct × 900 / 100 | Không chạm trần |
| Số tiền được thanh toán | 900 − 8,10 | **891,90** triệu |

Kết quả khớp đáp án mẫu `SC005`. **[SAMPLE]**

---

## 9. Bảng quyết định tổng hợp

| # | Điều kiện (theo thứ tự kiểm tra) | Quyết định | Mã lý do | Payable | Penalty | Trạng thái đề xuất |
|---|---|---|---|---|---|---|
| 1 | Có dispute đang mở | HOLD | `OPEN_DISPUTE` | 0 | 0 | `ON_HOLD` |
| 2 | Có rejection hợp lệ | REJECT | `REJECTION_PRESENT` | 0 | 0 | `REJECTED` |
| 3 | Sự kiện bắt buộc do bên sai thẩm quyền | HOLD | `UNAUTHORIZED_EVENT` | 0 | 0 | `ON_HOLD` |
| 4 | Thiếu sự kiện bắt buộc | HOLD | `MISSING_REQUIRED_EVENT` | 0 | 0 | `WAITING_EVIDENCE` |
| 5 | Cần phê duyệt và chưa đủ quorum | HOLD | `APPROVAL_QUORUM_NOT_MET` | 0 | 0 | `WAITING_APPROVAL` |
| 6 | Áp dụng phạt và trễ quá ân hạn | PENALTY | `LATE_COMPLETION` | kế hoạch − phạt | phạt | `PAID_WITH_PENALTY` |
| 7 | Đủ mọi điều kiện | RELEASE | `ALL_CONDITIONS_MET` | kế hoạch | 0 | `ELIGIBLE_FOR_PAYMENT` |
| 8 | Còn lại | HOLD | `UNRESOLVED_CONDITION` | 0 | 0 | `ON_HOLD` |

---

## 10. Tình huống minh họa từ 20 sample công khai (Có thể đọc nếu muốn hiểu hơn)

| Nhóm tình huống | Sample | Milestone | Dữ kiện chính | Kết quả |
|---|---|---|---|---|
| Đủ điều kiện | SC001 | `MS0003` | Có `ACCEPTANCE` hợp lệ (`EV00004`), không dispute, không cần phê duyệt | RELEASE 387 |
| Trễ hạn | SC005 | `MS0020` | Hoàn thành trễ 6 ngày sau ân hạn | PENALTY, phạt 8,10, trả 891,90 |
| Trễ hạn | SC006 | `MS0041` | Trễ 3 ngày sau ân hạn, kế hoạch 1.472 | PENALTY, phạt 6,62, trả 1.465,38 |
| Dispute đang mở | SC007 | `MS0011` | Đủ sự kiện và 1/1 phê duyệt nhưng có dispute chưa đóng | HOLD, payable 0 |
| Dispute đã giải quyết | SC009 | `MS0024` | Dispute có sự kiện giải quyết tham chiếu; điều kiện còn lại đủ | RELEASE 2.250 |
| Thiếu sự kiện | SC011 | `MS0045` | 0/1 sự kiện bắt buộc hợp lệ | HOLD |
| Thiếu sự kiện | SC012 | `MS0098` | 1/2 sự kiện bắt buộc hợp lệ | HOLD |
| Thiếu phê duyệt | SC013 | `MS0048` | Đủ sự kiện, mới 1/2 phê duyệt | HOLD |
| Từ chối | SC015 | `MS0007` | Có `REJECTION` hợp lệ (`EV00010`) | REJECT, payable 0 |
| Sai thẩm quyền | SC017 | `MS0067` | 2 sự kiện bắt buộc, 1 hợp lệ, 1 do bên sai tạo (`EV00177`) | HOLD |
| Sự kiện lặp | SC019 | `MS0172` | `EV00484` là bản lặp của `EV00482` (cùng chứng từ `DN-CT0043-02`); bỏ bản lặp thì vẫn đủ | RELEASE 752,5 (một lần) |

Điểm đáng chú ý của SC019: cùng một lô hàng bị gửi hai lần cách nhau 2 phút. Hệ thống chỉ tính một bằng chứng; nếu đếm theo số dòng sẽ tính là hai bằng chứng và có thể RELEASE sai khi còn thiếu `INVOICE`.

---

## 11. Phân tích dữ liệu (Giảm tải)

### 11.1. Quy mô

| Đối tượng | Số lượng |
|---|---|
| Hợp đồng | 100 (hàng hóa 40, dịch vụ 25, phần mềm 20, bảo trì 15) |
| Party | 65 (bên mua 10, nhà cung cấp 25, người phê duyệt 30) |
| Milestone | 405 |
| Rule | 128 (16 mã × 8 rule), tất cả đang hoạt động |
| Sự kiện | 1.134 (trung bình khoảng 2,8 sự kiện mỗi milestone) |
| Giá trị hợp đồng | từ 360 đến 13.650 triệu; trung bình khoảng 4.223 triệu; tổng 422.340 triệu |

Phân bố sự kiện: `APPROVAL` 497, `INVOICE` 140, `CONTRACT_SIGNED` 100, `ACCEPTANCE` 97, `WARRANTY_COMPLETED` 85, `DELIVERY` 68, `KICKOFF_CONFIRMED` 25, `GO_LIVE` 20, `REQUIREMENTS_APPROVED` 20, `UAT_PASSED` 20, `DISPUTE_OPENED` 18, `SERVICE_COMPLETED` 15, `SERVICE_ACTIVATED` 15, `DISPUTE_RESOLVED` 8, `REJECTION` 6. **[DỮ LIỆU]**

### 11.2. Thời gian **[DỮ LIỆU]**

| Chỉ tiêu | Kết quả |
|---|---|
| Khoảng thời gian của sự kiện | 24/01/2026 đến 27/05/2027 |
| Sự kiện có ngày sau snapshot 18/10/2026 | 267 (khoảng 23,5%), thuộc 93 milestone |
| Milestone có hạn sau snapshot | 95 |
| Phê duyệt có thời điểm sớm hơn sự kiện bắt buộc cuối | 0 trên 497 |
| Sự kiện trước ngày ký hợp đồng | 0 |
| Thời gian giải quyết dispute (đã giải quyết) | đều 2 ngày |

### 11.3. Phân bố quyết định ước tính

Số liệu dưới đây do **engine nháp** của đội tính ra bằng các rule công khai (khớp 20/20 sample). Đây **không** phải ground truth của BTC. **[SAMPLE]**

| Quyết định | Mã lý do | Số milestone |
|---|---|---|
| RELEASE | `ALL_CONDITIONS_MET` | 348 |
| PENALTY | `LATE_COMPLETION` | 15 |
| HOLD | `OPEN_DISPUTE` | 10 |
| HOLD | `MISSING_REQUIRED_EVENT` | 10 |
| HOLD | `APPROVAL_QUORUM_NOT_MET` | 10 |
| HOLD | `UNAUTHORIZED_EVENT` | 6 |
| REJECT | `REJECTION_PRESENT` | 6 |
| **Tổng** | | **405** |

Về tiền: tổng giá trị kế hoạch 422.340 triệu; tổng được thanh toán ước tính (RELEASE + PENALTY) khoảng **365.786 triệu**; tổng phạt ước tính khoảng **102 triệu**.

Các con số bất thường rất "tròn" (10 / 10 / 10 / 6 / 6 / 15, cùng 5 cặp sự kiện lặp) cho thấy BTC cài các tình huống theo số lượng có chủ đích. Nhiều khả năng hidden test cũng có cấu trúc tương tự. **[GIẢ ĐỊNH]**

### 11.4. Danh mục bất thường trong dữ liệu **[DỮ LIỆU]**

| Loại | Số lượng | Dấu hiệu nhận biết |
|---|---|---|
| Sự kiện lặp | 5 cặp (5 sự kiện thừa) | Cùng milestone, loại, chứng từ, người tạo; cách nhau 2 phút |
| Sự kiện sai bên | 6 | Cả 6 có `event_source = MANUAL_ENTRY` |
| Dispute mở | 18 | 8 đã giải quyết, 10 còn mở |
| Rejection | 6 | Đều do `CONTRACT_OWNER` |
| Milestone thiếu sự kiện bắt buộc | 10 | Thiếu loại sự kiện theo `required_event_types` |
| Milestone thiếu phê duyệt | 10 | Phê duyệt hợp lệ nhỏ hơn quorum |
| Milestone trễ hạn bị phạt | 15 | Trễ từ 2 đến 7 ngày sau ân hạn |

Sáu sự kiện sai bên: `ACCEPTANCE` do nhà cung cấp tạo (2), `DELIVERY` do bên mua tạo (2), `SERVICE_COMPLETED` do bên mua tạo (1), `UAT_PASSED` do nhà cung cấp tạo (1). Danh sách milestone ở Phụ lục B.

**Lưu ý:** `MANUAL_ENTRY` trùng khớp với 6 sự kiện sai bên trong dữ liệu hiện tại, nhưng **không được dùng làm tiêu chí loại sự kiện**, vì đó là dấu hiệu của dữ liệu mẫu chứ không phải quy tắc nghiệp vụ. Hidden test có thể có sự kiện sai bên nhưng đi qua kênh khác.

---

## 12. Các bẫy và lưu ý

| # | Bẫy | Hậu quả nếu sai | Cách xử lý | Nhãn |
|---|---|---|---|---|
| T1 | Kiểm quyền bằng cột `allowed_event_types` của `parties` | 119 sự kiện hợp lệ bị đánh sai thẩm quyền, kéo theo hàng loạt HOLD sai | Dùng ma trận mục 4.2 | [DỮ LIỆU] |
| T2 | Lọc bỏ sự kiện có ngày sau snapshot | Mất bằng chứng của 93 milestone, kể cả ca phạt công khai SC005 | Không lọc theo snapshot (BR-15) | [SAMPLE] |
| T3 | Dùng ngày phê duyệt hoặc ngày sự kiện sớm nhất làm ngày hoàn thành | Sai số ngày trễ và tiền phạt | Dùng ngày sự kiện bắt buộc hợp lệ muộn nhất (BR-10) | [SAMPLE] |
| T4 | Đếm sự kiện theo số dòng | Đếm trùng bằng chứng, có thể RELEASE khi còn thiếu | Khử trùng lặp trước khi đếm (BR-03) | [ĐỀ] |
| T5 | Coi mọi `DISPUTE_OPENED` là đang mở | HOLD sai cho 8 milestone đã giải quyết | Đối chiếu `reference_event_id` (BR-07) | [ĐỀ] |
| T6 | Đếm phê duyệt không xét vai trò và người | Quorum đạt giả | Lọc theo vai trò, đếm mỗi người một lần (BR-09) | [ĐỀ] |
| T7 | Quên chia 100 các tỷ lệ phần trăm | Tiền phạt lớn gấp 100 lần | `rate / 100`, `max / 100` | [ĐỀ] |
| T8 | Dùng `event_note` hoặc `event_source` để nhận diện lỗi | Hỏng khi gặp dữ liệu ẩn | Chỉ dùng các quy tắc nghiệp vụ | [GIẢ ĐỊNH] |
| T9 | Phạt cho milestone không áp dụng phạt | Penalty sai | Kiểm `late_penalty_applicable` | [DỮ LIỆU] |
| T10 | Chưa cài đặt trần phạt vì dữ liệu hiện tại chưa chạm trần | Hidden test có ca chạm trần sẽ sai. Trong dữ liệu công khai, trễ tối đa 8 ngày với mức 0,20%/ngày cao nhất là 1,6%, thấp hơn trần nhỏ nhất (5%) | Vẫn cài `min(...)` | [DỮ LIỆU] |
| T11 | Sửa số dòng hoặc khóa trong template | Vi phạm quy định nộp | Không đổi `contract_id`, `milestone_id`, số dòng (405) | [ĐỀ] |
| T12 | Coi milestone không có sample là bình thường | Sai ở 385 milestone còn lại | Đánh giá mọi milestone bằng cùng bộ rule | [ĐỀ] |
| T13 | So sánh trễ hạn bằng "lớn hơn hoặc bằng" | Phạt oan ca đúng hạn chót | Trễ khi ngày hoàn thành **lớn hơn** hạn + ân hạn. Dữ liệu công khai không có ca sát biên (0 ca) nên hidden test có thể kiểm tra | [ĐỀ] |
| T14 | Tên manifest và thư mục template trong README khác thư mục thật (`dataset_manifest_final.csv`, `04_output_templates`) | Nhầm đường dẫn | Dùng đường dẫn thực tế | [DỮ LIỆU] |

---

## 13. Giả định và câu hỏi cần xác nhận với BTC

| # | Điểm chưa rõ | Cách xử lý tạm | Rủi ro nếu hiểu khác |
|---|---|---|---|
| A1 | Định nghĩa "ngày hoàn thành thực tế" (data dictionary không có trường này) | Ngày của sự kiện bắt buộc hợp lệ muộn nhất | Lệch số ngày trễ và tiền phạt |
| A2 | Xử lý sự kiện có ngày sau snapshot 18/10/2026 | Coi như đã xảy ra | Nếu BTC loại chúng, nhiều milestone phải đổi sang HOLD |
| A3 | Thành phần chính xác của `evidence_event_ids` | Theo mục 8.3 | Lệch chỉ số Audit Trace |
| A4 | Khóa khử trùng lặp và bản được giữ | 4 trường, giữ bản sớm nhất | Lệch danh sách bằng chứng |
| A5 | Làm tròn tiền phạt | 2 chữ số thập phân (khớp 2 ca mẫu) | Lệch vài phần trăm triệu |
| A6 | Có so sánh theo ngày hay theo thời điểm khi xét trễ hạn | Theo ngày (bỏ giờ) | Lệch ca sát hạn |
| A7 | Ai có quyền giải quyết dispute | Trong dữ liệu chỉ bên mua; không giả định thêm | Dispute do bên không có quyền giải quyết |
| A8 | Định dạng `conditions_met` và `missing_conditions` | Danh sách phân cách bằng dấu `;`, thống nhất toàn file | Không ảnh hưởng điểm nếu không bị chấm tự động |
| A9 | Bộ trạng thái milestone | Theo mục 7.4, ghi rõ ánh xạ trong hồ sơ | README cho phép bộ khác nếu có mô tả |
| A10 | Ý nghĩa `confidence_score` | Quy ước của đội, ghi rõ | |
| A11 | Vòng sơ khảo (Blueprint) có chấm file dự đoán 405 dòng hay chỉ chấm hồ sơ | Chuẩn bị cả hai | Phân bổ công sức |
| A12 | Phạm vi hidden test (chỉ 385 milestone còn lại, hay dữ liệu mới) | Coi như có dữ liệu mới | Hard-code sẽ bị phát hiện |

---

## 14. Liên kết với đầu ra và KPI

### 14.1. Template nộp bài

`submission_output_template.csv`: 405 dòng, 22 cột. BTC điền sẵn 6 cột (`contract_id`, `milestone_id`, `contract_type`, `milestone_sequence`, `milestone_type`, `planned_payment_vnd_mn`); đội điền 16 cột còn lại.

| Cột đội điền | Nguồn / cách tạo |
|---|---|
| `predicted_decision` | Quyết định của rule khớp |
| `predicted_milestone_status` | Ánh xạ mục 7.4 |
| `conditions_met`, `missing_conditions` | Đối chiếu `required_event_types`, phê duyệt, dispute với sự kiện hợp lệ |
| `payable_amount_vnd_mn`, `penalty_amount_vnd_mn` | BR-11, BR-12 |
| `reason_code` | `reason_code` của rule khớp |
| `decision_reason` | Câu giải thích (Phụ lục C) |
| `evidence_event_ids` | Mục 8.3 |
| `rule_id_applied` | `rule_id` của rule khớp trong 8 rule của `release_rule_code` |
| `confidence_score` | Quy ước của đội (A10) |
| `processing_time_ms`, `evaluated_at` | Đo khi chạy |
| `engine_name`, `audit_trace_id`, `notes` | Tên hệ thống; mã truy vết nối sang audit log; ghi chú (ví dụ "đã loại 1 sự kiện lặp") |

### 14.2. KPI **[ĐỀ]**

| KPI | Cách đo | Ghi chú |
|---|---|---|
| Rule Execution Accuracy | milestone có quyết định đúng ÷ tổng milestone đánh giá | Ưu tiên cao |
| Scenario Accuracy / Macro-F1 | tỷ lệ tình huống xử lý đúng, tính trung bình theo nhóm | Phản ánh cả nhóm ít gặp |
| **Unauthorized Payment Rate** | milestone bị RELEASE/PENALTY khi chưa đủ điều kiện ÷ tổng milestone không đủ điều kiện | **Càng gần 0 càng tốt** |
| Payment / Penalty Amount Accuracy | so sánh số tiền dự đoán với ground truth | |
| Audit Trace Completeness | tỷ lệ quyết định truy vết được về sự kiện, rule, người tạo, số tiền, thời điểm | |
| Processing Time | `processing_time_ms` | |

Quy ước báo cáo trung thực: nêu rõ KPI đo trên tập nào (20 sample công khai, hay bộ kiểm thử tự tạo), không tuyên bố chính xác trên dữ liệu ẩn.

---

## 15. Bộ kiểm thử đề xuất

Dựa trên 10 tình huống tối thiểu của README (mục 22) cộng các ca biên mà hidden test có thể kiểm tra.

| # | Tình huống | Kỳ vọng |
|---|---|---|
| T01 | Đủ điều kiện, không phạt | RELEASE, payable = kế hoạch |
| T02 | Thiếu một sự kiện bắt buộc | HOLD, `MISSING_REQUIRED_EVENT` |
| T03 | Thiếu phê duyệt (số hợp lệ nhỏ hơn quorum) | HOLD, `APPROVAL_QUORUM_NOT_MET` |
| T04 | Dispute đang mở | HOLD, `OPEN_DISPUTE` |
| T05 | Có rejection hợp lệ | REJECT, payable 0 |
| T06 | Hoàn thành trễ vượt ân hạn | PENALTY, đúng công thức |
| T07 | Sự kiện lặp, bỏ bản lặp vẫn đủ | RELEASE một lần |
| T08 | Sự kiện bắt buộc do bên sai thẩm quyền | HOLD, `UNAUTHORIZED_EVENT` |
| T09 | Dispute đã giải quyết, điều kiện còn lại đủ | RELEASE |
| T10 | Không rơi vào rule nào | HOLD, `UNRESOLVED_CONDITION` |
| T11 | Hoàn thành đúng ngày `hạn + ân hạn` | Không bị phạt (không trễ) |
| T12 | Trễ nhiều đến mức phạt vượt trần | Phạt bằng trần, payable = kế hoạch − trần |
| T13 | Một người phê duyệt duyệt hai lần, quorum 2 | HOLD (chỉ tính một) |
| T14 | Phê duyệt sai vai trò | Không tính vào quorum |
| T15 | Phê duyệt bởi người không thuộc bên mua của hợp đồng | Không tính |
| T16 | Dispute mở lại sau khi một dispute khác đã giải quyết | HOLD |
| T17 | Dispute có tham chiếu trỏ tới một sự kiện không phải dispute | Không coi là đã giải quyết (cần kiểm tra loại sự kiện được tham chiếu) |
| T18 | Có cả dispute đang mở và rejection | HOLD (dispute ưu tiên 10) |
| T19 | Trễ nhưng milestone không áp dụng phạt | RELEASE, không phạt |
| T20 | Sự kiện lặp nhưng ghi chú không có chữ "lặp", khác nguồn kênh | Vẫn khử trùng nhờ khóa 4 trường |
| T21 | Sự kiện bắt buộc thiếu `document_id` | Cần quy ước (A4); mặc định an toàn: HOLD |

---

## Phụ lục A. Giá trị hợp lệ

| Trường | Giá trị |
|---|---|
| `predicted_decision` | `RELEASE`, `HOLD`, `REJECT`, `PENALTY` |
| `reason_code` | `OPEN_DISPUTE`, `REJECTION_PRESENT`, `UNAUTHORIZED_EVENT`, `MISSING_REQUIRED_EVENT`, `APPROVAL_QUORUM_NOT_MET`, `LATE_COMPLETION`, `ALL_CONDITIONS_MET`, `UNRESOLVED_CONDITION` |
| `contract_type` | `GOODS_SUPPLY`, `SERVICES`, `SOFTWARE_IMPLEMENTATION`, `MAINTENANCE` |
| `approval_policy` | `AUTO_IF_ALL_CONDITIONS`, `SINGLE_BUYER_APPROVAL`, `DUAL_APPROVAL`, `FINANCE_PLUS_OWNER` |
| `approval_role` | `NONE`, `CONTRACT_OWNER`, `FINANCE_APPROVER`, `SECONDARY_APPROVER` |
| `event_status` | `CONFIRMED`, `APPROVED`, `REJECTED`, `OPEN`, `RESOLVED` |
| `event_source` | `PORTAL`, `API`, `WORKFLOW_ENGINE`, `MANUAL_ENTRY` |

## Phụ lục B. Danh sách milestone theo nhóm (theo engine nháp, **[SAMPLE]**)

| Nhóm | Số lượng | Milestone |
|---|---|---|
| Dispute đang mở (HOLD) | 10 | `MS0011` `MS0015` `MS0028` `MS0055` `MS0076` `MS0130` `MS0240` `MS0322` `MS0349` `MS0379` |
| Rejection (REJECT) | 6 | `MS0007` `MS0148` `MS0168` `MS0185` `MS0189` `MS0295` |
| Sai thẩm quyền (HOLD) | 6 | `MS0067` `MS0116` `MS0193` `MS0287` `MS0345` `MS0362` |
| Thiếu sự kiện bắt buộc (HOLD) | 10 | `MS0045` `MS0098` `MS0151` `MS0177` `MS0203` `MS0264` `MS0268` `MS0313` `MS0337` `MS0387` |
| Thiếu phê duyệt (HOLD) | 10 | `MS0048` `MS0058` `MS0091` `MS0095` `MS0102` `MS0107` `MS0144` `MS0256` `MS0310` `MS0392` |
| Trễ hạn (PENALTY) | 15 | `MS0020` `MS0041` `MS0052` `MS0083` `MS0121` `MS0138` `MS0207` `MS0219` `MS0224` `MS0228` `MS0252` `MS0280` `MS0299` `MS0326` `MS0396` |
| Có sự kiện lặp (vẫn RELEASE) | 5 | `MS0172` `MS0210` `MS0214` `MS0333` `MS0404` |

Chi tiết các ca phạt (ngày trễ, phạt, được thanh toán, triệu VND):

| Milestone | Ngày trễ | Phạt | Được thanh toán |
|---|---|---|---|
| `MS0020` | 6 | 8,10 | 891,90 |
| `MS0041` | 3 | 6,62 | 1.465,38 |
| `MS0052` | 5 | 0,50 | 199,50 |
| `MS0083` | 5 | 6,90 | 1.373,10 |
| `MS0121` | 8 | 22,80 | 2.827,20 |
| `MS0138` | 4 | 0,32 | 79,68 |
| `MS0207` | 5 | 1,15 | 151,85 |
| `MS0219` | 3 | 8,25 | 2.741,75 |
| `MS0224` | 6 | 8,32 | 684,68 |
| `MS0228` | 5 | 16,54 | 2.188,46 |
| `MS0252` | 7 | 5,47 | 1.558,53 |
| `MS0280` | 2 | 5,64 | 1.404,36 |
| `MS0299` | 3 | 0,51 | 339,49 |
| `MS0326` | 5 | 0,40 | 157,60 |
| `MS0396` | 7 | 10,61 | 1.504,39 |

Đây là kết quả tạm của engine nháp để đội đối chiếu khi dựng hệ thống chính thức, không phải đáp án của BTC.

## Phụ lục C. Mẫu câu giải thích quyết định (`decision_reason`)

Mẫu câu của BTC trong `decision_sample.csv` là khung; đội nên viết cụ thể hơn bằng cách dẫn sự kiện và rule. **[SAMPLE]**

| Mã lý do | Mẫu câu của BTC | Gợi ý bổ sung cho hệ thống |
|---|---|---|
| `ALL_CONDITIONS_MET` | Đầy đủ required event và phê duyệt hợp lệ, không có tranh chấp/rejection; milestone đủ điều kiện RELEASE. | Nêu các sự kiện làm bằng chứng và quorum đã đạt |
| `ALL_CONDITIONS_MET` (có sự kiện lặp) | Sau khi khử event lặp, các điều kiện và phê duyệt vẫn đầy đủ; milestone đủ điều kiện RELEASE một lần. | Nêu sự kiện nào bị coi là lặp |
| `OPEN_DISPUTE` | Có tranh chấp đang mở tại milestone nên thanh toán phải tạm giữ. | Nêu mã sự kiện dispute |
| `REJECTION_PRESENT` | Có sự kiện REJECTION hợp lệ nên milestone bị từ chối và chưa được thanh toán. | Nêu người từ chối và mã sự kiện |
| `UNAUTHORIZED_EVENT` | Có required event do bên/vai trò không có thẩm quyền tạo; bằng chứng đó không được tính hợp lệ. | Nêu sự kiện, người tạo và loại bên đúng |
| `MISSING_REQUIRED_EVENT` | Chưa đủ required event nên milestone chưa đủ điều kiện giải ngân. | Liệt kê loại sự kiện còn thiếu |
| `APPROVAL_QUORUM_NOT_MET` | Mới có 1/2 phê duyệt hợp lệ; chưa đạt approval quorum. | Điền số phê duyệt hiện có và cần, vai trò còn thiếu |
| `LATE_COMPLETION` | Hoàn thành muộn 6 ngày sau grace period; áp dụng penalty 8.10 triệu VND. | Điền số ngày trễ, ngày hoàn thành, hạn, ân hạn và tiền phạt |
| `UNRESOLVED_CONDITION` | (BTC chưa có mẫu) | Nêu điều kiện không rõ khiến phải giữ lại |

## Phụ lục D. Nguồn

- Đề thi: `DeThi2026_BangD_SmartContractWorkflow.pdf`.
- Data Pack: `README.md`, `02_metadata/data_dictionary.csv`, `01_data/*.csv` (contracts, parties, milestones, payment_rules, events), `03_labels_sample/*.csv`, `04_output_templates/submission_output_template.csv`.
- Mọi nhãn **[DỮ LIỆU]** do đội kiểm chứng bằng cách chạy trên toàn bộ các file trên ngày 19–20/10/2026.
