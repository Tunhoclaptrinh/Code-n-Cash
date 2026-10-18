# CASE 4 – SMART CONTRACT WORKFLOW

## Festival Chuyển đổi số 2026 – Vòng sơ khảo

**Bảng D – Case 4: Smart Contract Workflow**  
**Chủ đề:** Tự động hóa thực hiện hợp đồng theo điều kiện.

---

## 1. Mục tiêu của Data Pack

Data Pack này được xây dựng cho bài toán mô phỏng quy trình thực hiện hợp đồng theo chuỗi:

**Contract → Milestone → Event → Rule Check → Decision → Audit Log**

Đội thi cần xây dựng hệ thống có khả năng:

- theo dõi trạng thái hợp đồng và milestone;
- kiểm tra các điều kiện nghiệp vụ;
- xác định milestone đã đủ điều kiện xử lý hay chưa;
- sinh quyết định:
  - `RELEASE`;
  - `HOLD`;
  - `REJECT`;
  - `PENALTY`;
- tính số tiền đủ điều kiện thanh toán;
- ghi nhận lý do quyết định;
- hỗ trợ truy vết các event làm bằng chứng.

Trọng tâm của Case Study là **logic hợp đồng, quản lý trạng thái, workflow automation và auditability**.

**Không bắt buộc** sử dụng blockchain, Solidity, cryptocurrency hoặc ví điện tử.

---

## 2. Phạm vi dữ liệu

Toàn bộ dữ liệu trong Data Pack là **dữ liệu giả lập**.

- Snapshot: **18/10/2026**
- Seed sinh dữ liệu: **20261018**
- Số hợp đồng: **100**
- Số party: **65**
- Số milestone: **405**
- Số rule: **128**
- Số event: **1134**
- Số scenario mẫu công khai: **20**
- Số decision mẫu công khai: **20**
- Số dòng output template: **405**

Dữ liệu không đại diện cho hợp đồng, doanh nghiệp, tổ chức hoặc giao dịch thực tế.

---

## 3. Cấu trúc thư mục

```text
CASE4_SMART_CONTRACT_WORKFLOW/
│
├── 01_data/
│   ├── contracts.csv
│   ├── parties.csv
│   ├── milestones.csv
│   ├── payment_rules.csv
│   └── events.csv
│
├── 02_metadata/
│   ├── data_dictionary.csv
│   └── dataset_manifest.csv
│
├── 03_labels_sample/
│   ├── scenario_labels_sample.csv
│   └── decision_sample.csv
│
├── 04_output_template/
│   └── submission_output_template.csv
│
└── README_Case4_SMART_CONTRACT_WORKFLOW.md
```

---

## 4. Các file dữ liệu chính

### 4.1. `contracts.csv`

Mỗi dòng biểu diễn một hợp đồng.

Các trường quan trọng:

- `contract_id`
- `contract_type`
- `buyer_id`
- `supplier_id`
- `contract_value_vnd_mn`
- `start_date`
- `end_date`
- `workflow_template`
- `rule_set_id`
- `approval_policy`
- `approval_quorum`
- `auto_release_allowed`
- `grace_period_days`
- `penalty_rate_pct_per_day`
- `max_penalty_pct`

Các loại hợp đồng hiện có:

- `GOODS_SUPPLY`
- `SERVICES`
- `SOFTWARE_IMPLEMENTATION`
- `MAINTENANCE`

---

### 4.2. `parties.csv`

Mỗi dòng biểu diễn một party hoặc vai trò phê duyệt.

Các loại party:

- `BUYER`
- `SUPPLIER`
- `APPROVER`

Các vai trò approval:

- `CONTRACT_OWNER`
- `FINANCE_APPROVER`
- `SECONDARY_APPROVER`

Các trường như `allowed_event_types`, `can_approve_payment` và `can_raise_dispute` có thể được sử dụng để kiểm tra tính hợp lệ của actor.

---

### 4.3. `milestones.csv`

Mỗi dòng biểu diễn một milestone của một hợp đồng.

Các trường quan trọng:

- `milestone_id`
- `contract_id`
- `milestone_sequence`
- `milestone_type`
- `due_date`
- `payment_percent`
- `planned_payment_vnd_mn`
- `required_event_types`
- `required_condition`
- `approval_required`
- `required_approval_quorum`
- `required_approval_roles`
- `late_penalty_applicable`
- `grace_period_days`
- `penalty_rate_pct_per_day`
- `max_penalty_pct`
- `release_rule_code`

Trong mỗi hợp đồng:

- tổng `payment_percent` = **100%**;
- tổng `planned_payment_vnd_mn` = `contract_value_vnd_mn`.

---

### 4.4. `payment_rules.csv`

File này mô tả các rule theo nguyên tắc **first-match** và `priority` tăng dần.

Thứ tự logic chuẩn:

1. Có dispute đang mở → `HOLD`
2. Có rejection hợp lệ → `REJECT`
3. Có required event từ actor không hợp lệ → `HOLD`
4. Thiếu required event → `HOLD`
5. Chưa đạt approval quorum → `HOLD`
6. Hoàn thành trễ vượt grace period → `PENALTY`
7. Đủ toàn bộ điều kiện → `RELEASE`
8. Trường hợp còn lại → `HOLD`

Mỗi rule có:

- `condition_expression`
- `decision`
- `reason_code`
- `payable_amount_formula`
- `penalty_amount_formula`

Đội thi có thể triển khai rule bằng Python, JavaScript, workflow engine, no-code/low-code hoặc công nghệ tương đương.

---

### 4.5. `events.csv`

Mỗi dòng biểu diễn một event xảy ra trong workflow.

Một số event tiêu biểu:

- `CONTRACT_SIGNED`
- `DELIVERY`
- `INVOICE`
- `ACCEPTANCE`
- `APPROVAL`
- `REJECTION`
- `DISPUTE_OPENED`
- `DISPUTE_RESOLVED`
- `REQUIREMENTS_APPROVED`
- `UAT_PASSED`
- `GO_LIVE`
- `WARRANTY_COMPLETED`
- `SERVICE_ACTIVATED`
- `SERVICE_COMPLETED`

Các trường quan trọng:

- `event_id`
- `contract_id`
- `milestone_id`
- `event_timestamp`
- `event_type`
- `event_status`
- `actor_party_id`
- `actor_party_type`
- `actor_role`
- `document_id`
- `reference_event_id`

Dữ liệu có thể chứa:

- event lặp;
- event thiếu;
- event do sai actor tạo;
- approval chưa đủ;
- dispute đang mở;
- dispute đã được resolve;
- rejection;
- milestone hoàn thành trễ.

Đội thi phải xử lý logic này thay vì chỉ đếm số event.

---

## 5. Liên kết giữa các bảng

Quan hệ chính:

```text
contracts.contract_id
        │
        ├──────────────> milestones.contract_id
        │                       │
        │                       └──────────────> events.milestone_id
        │
        ├──────────────> events.contract_id
        │
        ├──────────────> parties.party_id
        │                  ↑ buyer_id
        │                  ↑ supplier_id
        │
        └──────────────> payment_rules
                           qua rule_set_id / release_rule_code
```

Ngoài ra:

- `events.actor_party_id` → `parties.party_id`
- `events.reference_event_id` → `events.event_id`
- `milestones.release_rule_code` → `payment_rules.release_rule_code`

---

## 6. Cách hiểu một required event hợp lệ

Một required event nên được xem là hợp lệ khi tối thiểu:

1. `event_type` phù hợp với `required_event_types`;
2. event có trạng thái hợp lệ;
3. actor có đúng loại/quyền thực hiện event;
4. event không bị loại do lỗi dữ liệu nghiêm trọng;
5. event duplicate không được tính nhiều lần.

Ví dụ:

- `DELIVERY` thường do `SUPPLIER` tạo;
- `ACCEPTANCE` thường do `BUYER` tạo;
- `APPROVAL` phải do `APPROVER` có quyền phê duyệt tạo.

---

## 7. Duplicate event

Data Pack có thể chứa event được gửi lặp.

Khuyến nghị:

- không coi mỗi duplicate là một bằng chứng độc lập;
- không làm phát sinh thanh toán nhiều lần;
- có thể dùng tổ hợp:
  - `event_type`;
  - `document_id`;
  - `actor_party_id`;
  - thời điểm gần nhau
  để phát hiện duplicate.

Một duplicate không nhất thiết làm milestone bị `HOLD` nếu sau khi khử trùng lặp vẫn còn đủ bằng chứng hợp lệ.

---

## 8. Dispute

Khi có:

`DISPUTE_OPENED`

và chưa có event `DISPUTE_RESOLVED` tham chiếu tương ứng, dispute được xem là đang mở.

Trong Data Pack hiện tại:

**open dispute → HOLD**

Sau khi dispute được giải quyết, workflow có thể tiếp tục đánh giá các điều kiện còn lại.

---

## 9. Approval quorum

Nếu:

`approval_required = TRUE`

thì hệ thống phải kiểm tra:

- đúng role;
- đúng actor;
- không đếm một approver nhiều lần;
- số approval hợp lệ đạt `required_approval_quorum`.

Ví dụ:

```text
required_approval_quorum = 2
required_approval_roles = CONTRACT_OWNER;FINANCE_APPROVER
```

thì cần đủ hai approval hợp lệ tương ứng.

---

## 10. Logic penalty

Penalty chỉ áp dụng khi:

```text
late_penalty_applicable = TRUE
```

và actual completion muộn hơn:

```text
due_date + grace_period_days
```

Công thức tham khảo:

```text
days_late_after_grace
    = actual_completion_date
    - (due_date + grace_period_days)
```

```text
penalty_amount
    = min(
        days_late_after_grace
        × penalty_rate_pct_per_day
        × planned_payment,
        max_penalty_pct
        × planned_payment
      )
```

Chú ý các tỷ lệ phần trăm phải được chia cho 100 khi tính.

Sau penalty:

```text
payable_amount
    = max(0, planned_payment - penalty_amount)
```

---

## 11. Scenario mẫu công khai

File:

`03_labels_sample/scenario_labels_sample.csv`

chứa một số scenario tham chiếu.

Các nhóm hiện có:

- `CLEAN_RELEASE`
- `LATE_PENALTY`
- `OPEN_DISPUTE_HOLD`
- `RESOLVED_DISPUTE_RELEASE`
- `MISSING_EVENT_HOLD`
- `APPROVAL_PENDING_HOLD`
- `REJECTION`
- `UNAUTHORIZED_EVENT_HOLD`
- `DUPLICATE_EVENT_RELEASE`

Đây chỉ là **một phần mẫu công khai**, không phải toàn bộ ground truth của cuộc thi.

---

## 12. Decision mẫu

File:

`03_labels_sample/decision_sample.csv`

minh họa cách suy ra:

- `expected_decision`
- `reason_code`
- `payable_amount_vnd_mn`
- `penalty_amount_vnd_mn`
- `evidence_event_ids`
- `reference_reason_vi`

Đội thi có thể dùng file này để:

- hiểu logic bài toán;
- kiểm tra pipeline;
- xây dựng unit test;
- so sánh output với một số scenario mẫu.

---

## 13. Output template bắt buộc

File:

`04_output_template/submission_output_template.csv`

có **405 dòng**, mỗi dòng ứng với một milestone.

Các trường BTC điền sẵn:

- `contract_id`
- `milestone_id`
- `contract_type`
- `milestone_sequence`
- `milestone_type`
- `planned_payment_vnd_mn`

Các trường đội thi cần sinh:

- `predicted_decision`
- `predicted_milestone_status`
- `conditions_met`
- `missing_conditions`
- `payable_amount_vnd_mn`
- `penalty_amount_vnd_mn`
- `reason_code`
- `decision_reason`
- `evidence_event_ids`
- `rule_id_applied`
- `confidence_score`
- `processing_time_ms`
- `evaluated_at`
- `engine_name`
- `audit_trace_id`
- `notes`

Không thay đổi:

- số dòng;
- `contract_id`;
- `milestone_id`.

---

## 14. Giá trị hợp lệ của `predicted_decision`

Chỉ sử dụng:

```text
RELEASE
HOLD
REJECT
PENALTY
```

### RELEASE

Milestone đủ điều kiện thanh toán toàn bộ số tiền kế hoạch.

### HOLD

Tạm giữ thanh toán vì điều kiện chưa đầy đủ hoặc có blocker.

### REJECT

Milestone bị từ chối do rejection hợp lệ.

### PENALTY

Milestone được xử lý nhưng bị khấu trừ do vi phạm thời hạn.

---

## 15. Gợi ý `predicted_milestone_status`

BTC không bắt buộc một kiến trúc duy nhất, nhưng đội có thể chuẩn hóa thành các trạng thái như:

```text
PLANNED
IN_PROGRESS
WAITING_EVIDENCE
WAITING_APPROVAL
ON_HOLD
REJECTED
ELIGIBLE_FOR_PAYMENT
PAID_WITH_PENALTY
COMPLETED
```

Nếu sử dụng tập trạng thái khác, cần mô tả rõ mapping trong hồ sơ giải pháp.

---

## 16. Gợi ý pipeline Bronze

Một pipeline cơ bản có thể là:

```text
Load Data
    ↓
Validate Keys
    ↓
Join Contract – Milestone – Events – Parties
    ↓
Deduplicate Events
    ↓
Validate Event Authority
    ↓
Check Required Events
    ↓
Check Dispute / Rejection
    ↓
Check Approval Quorum
    ↓
Check Due Date / Penalty
    ↓
Apply Rule Priority
    ↓
Decision + Payable Amount
    ↓
Audit Log / Dashboard
```

Bronze không yêu cầu blockchain.

---

## 17. Hướng nâng cấp Silver

Có thể bổ sung:

- escrow logic;
- time-lock;
- multi-party approval;
- phân quyền theo role;
- dispute workflow;
- cảnh báo gần thời gian thực;
- rule visualization;
- anomaly check cho sequence event;
- dashboard theo hợp đồng/party/milestone;
- audit log chi tiết.

Các nâng cấp cần có minh chứng bằng KPI hoặc scenario test.

---

## 18. Hướng nâng cấp Gold

Có thể bổ sung:

- smart contract trên blockchain local/testnet;
- Solidity hoặc nền tảng tương đương;
- multisignature;
- oracle mô phỏng;
- kiểm tra tính nhất quán của rule;
- versioning rule;
- tamper-evident audit log;
- explainable decision trace;
- AI hỗ trợ đọc hoặc cấu trúc hóa điều khoản;
- dashboard giám sát nhiều hợp đồng.

Blockchain là hướng mở rộng, **không phải điều kiện bắt buộc**.

---

## 19. KPI gợi ý

### 19.1. Rule Execution Accuracy

```text
Rule Execution Accuracy
= số milestone có decision đúng
  / tổng số milestone đánh giá
```

### 19.2. Scenario Accuracy

```text
Scenario Accuracy
= số scenario xử lý đúng
  / tổng scenario
```

### 19.3. Unauthorized Payment Rate

```text
Unauthorized Payment Rate
= số milestone bị RELEASE/PENALTY khi chưa đủ điều kiện
  / tổng milestone không đủ điều kiện
```

Chỉ số này càng thấp càng tốt.

### 19.4. Payment Amount Accuracy

So sánh `payable_amount_vnd_mn` dự đoán với ground truth.

### 19.5. Penalty Amount Accuracy

Đánh giá độ chính xác của `penalty_amount_vnd_mn`.

### 19.6. Audit Trace Completeness

Tỷ lệ quyết định có thể truy vết về:

- event;
- rule;
- actor;
- amount;
- timestamp.

### 19.7. Processing Time

Có thể ghi ở:

`processing_time_ms`

---

## 20. Các lỗi thường gặp

### Lỗi 1 – Chỉ kiểm tra event_type

Sai nếu không kiểm tra actor.

Ví dụ:

```text
DELIVERY
```

được tạo bởi BUYER thay vì SUPPLIER thì không nên được xem là delivery evidence hợp lệ.

### Lỗi 2 – Đếm duplicate thành nhiều bằng chứng

Một event bị gửi lại không được làm tăng số điều kiện đã hoàn thành.

### Lỗi 3 – Bỏ qua dispute

Đủ evidence nhưng vẫn còn dispute mở thì phải `HOLD`.

### Lỗi 4 – Chỉ đếm approval mà không kiểm tra role

Approval từ sai role không nên được tính vào quorum.

### Lỗi 5 – Tính penalty trước grace period

Chỉ tính số ngày trễ sau:

```text
due_date + grace_period_days
```

### Lỗi 6 – RELEASE khi thiếu evidence

Đây là lỗi nghiêm trọng vì có thể dẫn tới **unauthorized payment**.

---

## 21. Quy tắc sử dụng sample label

Các file sample label/answer chỉ dùng để:

- hiểu format;
- kiểm tra logic;
- debug;
- xây dựng test.

Không nên:

- hard-code trực tiếp scenario ID;
- suy ra rằng các contract không có label sample đều bình thường;
- coi sample là toàn bộ tập đánh giá.

---

## 22. Khuyến nghị kiểm thử

Đội thi nên xây dựng unit test tối thiểu cho các tình huống:

1. đủ điều kiện → RELEASE;
2. thiếu event → HOLD;
3. approval thiếu → HOLD;
4. dispute mở → HOLD;
5. rejection → REJECT;
6. late completion → PENALTY;
7. duplicate event → không thanh toán hai lần;
8. unauthorized actor → HOLD;
9. dispute resolved → tiếp tục workflow;
10. fallback an toàn → HOLD.

---

## 23. Nguyên tắc an toàn khi thiết kế workflow

Khi không đủ bằng chứng hoặc rule không rõ ràng, phương án an toàn là:

```text
HOLD
```

thay vì tự động `RELEASE`.

Một hệ thống tốt cần ưu tiên tránh **unauthorized payment**.

---

## 24. Data dictionary

Chi tiết từng trường có trong:

`02_metadata/data_dictionary.csv`

File này chứa:

- tên cột;
- kiểu dữ liệu;
- nullable;
- đơn vị;
- format;
- giá trị ví dụ;
- mô tả;
- ghi chú sử dụng.

---

## 25. Dataset manifest

Thông tin thống kê và kiểm tra tính toàn vẹn file có trong:

`02_metadata/dataset_manifest.csv`

Manifest bao gồm:

- row count;
- column count;
- primary key;
- foreign key;
- kích thước file;
- SHA-256.

---

## 26. Quy ước đơn vị

Các trường kết thúc bằng:

```text
_vnd_mn
```

được tính theo:

**triệu VND**

Ví dụ:

```text
1250.00
```

tương đương:

**1.250 triệu VND = 1,25 tỷ VND**

Các trường phần trăm lưu theo giá trị phần trăm.

Ví dụ:

```text
0.10
```

ở `penalty_rate_pct_per_day` nghĩa là:

**0,10%/ngày**

không phải 10%.

---

## 27. Quy ước ngày giờ

Ngày:

```text
YYYY-MM-DD
```

Datetime:

```text
YYYY-MM-DDTHH:MM:SS
```

Khi xử lý deadline, đội phải thống nhất rõ cách so sánh ngày và timestamp.

---

## 28. Dữ liệu synthetic

Tất cả:

- tên tổ chức;
- giá trị hợp đồng;
- event;
- approval;
- dispute;
- milestone;
- rule;
- scenario

đều được tạo nhằm phục vụ mục đích thi và giảng dạy.

Không sử dụng Data Pack này để suy diễn thông tin về bất kỳ doanh nghiệp hoặc tổ chức thực tế nào.

---

## 29. Tóm tắt nhanh

Để bắt đầu nhanh:

1. Đọc `data_dictionary.csv`.
2. Load `contracts.csv`, `parties.csv`, `milestones.csv`, `events.csv`.
3. Join theo các khóa.
4. Đọc `payment_rules.csv`.
5. Xây rule engine theo priority.
6. Kiểm tra với `scenario_labels_sample.csv`.
7. So sánh một số kết quả với `decision_sample.csv`.
8. Sinh đúng cấu trúc `submission_output_template.csv`.
9. Xây dashboard/audit log.
10. Đo KPI và mô tả kết quả trong hồ sơ vòng sơ khảo.

---

**CASE 4 – SMART CONTRACT WORKFLOW**  
**Festival Chuyển đổi số 2026**  
**Data Pack version 1.0 – Snapshot 18/10/2026**
