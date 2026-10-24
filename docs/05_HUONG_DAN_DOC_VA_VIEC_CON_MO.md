# 05 — Hướng dẫn đọc đặc tả, việc còn dở và điểm cần quyết

**Case 4 — Smart Contract Workflow**

| Mục                | Nội dung                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Áp dụng cho       | [04 — Đặc tả nghiệp vụ](04_DAC_TA_NGHIEP_VU.md) **v1.1**                                     |
| Ngày               | 21/10/2026                                                                                              |
| Cập nhật khi      | Đặc tả đổi phiên bản, một việc ở mục 2 xong, hoặc BTC/đội trả lời một điểm ở mục 3 |
| Đối tượng đọc | Toàn đội. Riêng mục 4 là bản nháp gửi BTC                                                      |

Cập nhật 24/10/2026: BTC đã trả lời về completion, dispute, confidence và split 20/250/135; xem [15 — Xác nhận BTC](15_XAC_NHAN_BTC_VA_GIA_DINH.md) và [14 — Rà soát Đồng/Bạc/Vàng](14_RA_SOAT_BTC_DONG_BAC_VANG.md). Các mục hỏi BTC bên dưới là bản lịch sử; không gửi lại những câu đã được trả lời.

Tài liệu này không thay đặc tả. Nó trả lời ba câu hỏi:

- đọc đặc tả theo thứ tự nào;
- còn việc gì chưa làm;
- điểm nào đội không được tự quyết.

---

## 1. Đọc đặc tả thế nào

### 1.1. Bỏ qua phần lịch sử

Các tệp trong [`archive/nghiep-vu/`](archive/nghiep-vu/) (v0.1, v0.2, v0.4, v0.5) chỉ để tra lịch sử, không dùng làm căn cứ. Toàn bộ nội dung đúng đã được gộp vào đặc tả v1.0; lý do từng thay đổi nằm ở Phụ lục E của đặc tả.

### 1.2. Lượt 1 — cả đội đọc (khoảng 20 phút)

| Thứ tự | Mục                                                                                                                                                             | Đọc để biết                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1        | [Quy ước nhãn](04_DAC_TA_NGHIEP_VU.md#quy-ước-nhãn-độ-tin-cậy)                                                                                           | Câu nào lấy từ đề, câu nào đã có sample chứng minh, câu nào do đội tự chọn |
| 2        | [§1 Tóm tắt điều hành](04_DAC_TA_NGHIEP_VU.md#1-tóm-tắt-điều-hành)                                                                                     | 5 điều cần nhớ; 5 lựa chọn ảnh hưởng kết quả nhiều nhất                         |
| 3        | [§8.1 Tám rule](04_DAC_TA_NGHIEP_VU.md#81-tám-rule-theo-thứ-tự-ưu-tiên-đề) và [§9.1 Bảng quyết định](04_DAC_TA_NGHIEP_VU.md#91-bảng-quyết-định) | Toàn bộ logic ra quyết định, tiền và trạng thái                                     |
| 4        | [§10 Hai mươi sample](04_DAC_TA_NGHIEP_VU.md#10-hai-mươi-sample-công-khai-và-điều-chúng-chứng-minh-sample)                                             | Cột "Chứng minh cho": vì sao mỗi quy tắc đúng                                         |

### 1.3. Lượt 2 — đọc theo vai trò

Người chính lấy theo phân công ở [02](02_CHIEN_LUOC_BRONZE_SILVER_GOLD.md) và [03](03_LO_TRINH_VA_CHECKLIST_NOP_BAI.md).

| Người                             | Đọc kỹ                                                                                                                                                                                                                                                                                                                                                                                                                                 | Chỉ tra khi cần                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Hoàng — nghiệp vụ, dữ liệu    | [§4.2 Ma trận thẩm quyền](04_DAC_TA_NGHIEP_VU.md#42-ma-trận-thẩm-quyền-tạo-required-event), [§4.4](04_DAC_TA_NGHIEP_VU.md#44-vì-sao-không-dùng-nguyên-cột-allowed_event_types-dữ-liệu-sample), [§7.3 Từ điển fact](04_DAC_TA_NGHIEP_VU.md#73-từ-điển-fact), [§8.2 BR-01…BR-20](04_DAC_TA_NGHIEP_VU.md#82-quy-tắc-chi-tiết), [§13 Giả định](04_DAC_TA_NGHIEP_VU.md#13-giả-định-và-câu-hỏi-cần-xác-nhận) | §5, §11                                                        |
| Tuấn — engine                     | [§7.2 Chín bước](04_DAC_TA_NGHIEP_VU.md#72-quy-trình-xử-lý-một-milestone-9-bước), §7.3, §8.2, [§14 Đầu ra](04_DAC_TA_NGHIEP_VU.md#14-đầu-ra-và-audit), Phụ lục C, [Phụ lục D](04_DAC_TA_NGHIEP_VU.md#phụ-lục-d-tái-lập)                                                                                                                                                                                            | [§16 Test](04_DAC_TA_NGHIEP_VU.md#16-bộ-kiểm-thử-nghiệp-vụ) |
| Mai Anh — phân quyền, kiểm thử | §4.2, [§9.5 Ngoại lệ](04_DAC_TA_NGHIEP_VU.md#95-xử-lý-ngoại-lệ-human-in-the-loop-thiết-kế), §16, [§17 Phân quyền](04_DAC_TA_NGHIEP_VU.md#17-phân-quyền-người-dùng-hệ-thống-thiết-kế-a20), [§18.1 Rủi ro](04_DAC_TA_NGHIEP_VU.md#181-ma-trận-rủi-ro--kiểm-soát)                                                                                                                                                  | §12                                                             |
| Lâm — điều phối, QA            | [§14.6 Bất biến](04_DAC_TA_NGHIEP_VU.md#146-bất-biến-và-checklist-trước-khi-xuất-csv), [§15 KPI](04_DAC_TA_NGHIEP_VU.md#15-kpi-và-cách-đo-đề), §16, [§19.2 Quy trình phiên bản](04_DAC_TA_NGHIEP_VU.md#192-quy-trình-thay-đổi-đặc-tả)                                                                                                                                                                              | Phụ lục D                                                      |
| Hà Phương — dashboard           | [§9.2 Trạng thái](04_DAC_TA_NGHIEP_VU.md#92-trạng-thái-milestone-giả-định-a12), [§9.4 Chuyển trạng thái](04_DAC_TA_NGHIEP_VU.md#94-chuyển-trạng-thái-và-đánh-giá-lại-thiết-kế), §9.5, [§14.4 Mẫu lý do](04_DAC_TA_NGHIEP_VU.md#144-mẫu-decision_reason), §17                                                                                                                                                     | §11.4                                                           |
| Thúy — hồ sơ                    | §1, [§2.4 Hồ sơ nộp](04_DAC_TA_NGHIEP_VU.md#24-hồ-sơ-vòng-sơ-khảo-đề), §15, [§18 Rủi ro và tuân thủ](04_DAC_TA_NGHIEP_VU.md#18-rủi-ro-kiểm-soát-và-tuân-thủ)                                                                                                                                                                                                                                                        | §10, §13                                                       |

### 1.4. Dùng nhãn khi trình bày và khi bị hỏi

| Nhãn         | Cách nói trong hồ sơ hoặc khi vấn đáp                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| [ĐỀ]        | Trích nguồn: đề, README, dictionary, `payment_rules.csv`                                       |
| [SAMPLE]      | "BTC đã xác nhận qua mẫu SCxxx". Mạnh nhất sau đề                                           |
| [DỮ LIỆU]   | "Đội đếm trên Data Pack, chạy script là ra cùng số". Không gọi đây là độ chính xác |
| [GIẢ ĐỊNH] | Phải nêu trong hồ sơ, kèm số mốc bị ảnh hưởng (đã có sẵn ở §13)                     |
| [THIẾT KẾ]  | Đề xuất vận hành của đội; không làm đổi kết quả của 405 mốc                          |

### 1.5. Tự kiểm và góp ý

- Tự kiểm số liệu từ thư mục gốc repo:
  - `python3 tools/kiem_chung_nghiep_vu.py --check`
  - `python3 -m unittest discover -s tests`
- Mỗi quy tắc BR đều ghi mã test T. Muốn hiểu một quy tắc chạy ra sao, mở test cùng mã trong [`tests/test_dac_ta_nghiep_vu.py`](../tests/test_dac_ta_nghiep_vu.py).
- Thấy sai hoặc không đồng ý thì **không sửa thẳng con số trong tài liệu**. Báo Hoàng; thay đổi đi theo [§19.2](04_DAC_TA_NGHIEP_VU.md#192-quy-trình-thay-đổi-đặc-tả): sửa tài liệu + script + test trong cùng một commit.

---

## 2. Việc còn dở

"Xong khi" là điều kiện nghiệm thu; chưa đạt thì chưa đánh dấu xong. Mốc quyết định cuối D3 (doc 03): nếu P0 chưa ổn thì dừng toàn bộ P1, P2.

### 2.1. P0 — cần cho bài nộp

Hiện trạng ngày 24/10/2026 thay cho checklist lịch sử: engine/export/audit và báo cáo kiểm đã có; raw event của 8 loại chưa có sample được đối chiếu tại [tài liệu 16](16_DOI_CHIEU_CAC_LOAI_MOC_CHUA_CO_SAMPLE.md). Các giả định còn mở, hồ sơ PDF và cách nộp vẫn cần đội chốt theo [tài liệu 14–15](14_RA_SOAT_BTC_DONG_BAC_VANG.md). Không đánh đồng code/test xanh với đã hoàn tất bài nộp.

### 2.2. P1 — cộng điểm Silver

| #  | Việc                                               | Người chính  | Xong khi                                                                                                                                                                                                                          |
| -- | --------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W6 | Dashboard theo §9.2–9.5                           | Hà Phương    | Hiển thị trạng thái mốc và hợp đồng; "thiếu gì, ai cần làm gì" (lấy từ `missing_conditions`, `decision_reason`); ba loại cảnh báo ở §9.4. Chỉ đọc output engine, không tự tính lại rule hay tiền |
| W7 | Sổ ngoại lệ BR-19 với luồng hai người duyệt | Tuấn + Mai Anh | Demo lại được test T40 trên giao diện: một người đề xuất, người thứ hai duyệt, engine đánh giá lại; người đề xuất không tự duyệt được; yêu cầu vô hiệu REJECTION bị từ chối (T41)           |
| W8 | Chế độ as-of cho demo                            | Tuấn           | Chọn `evaluation_time` thì thấy mốc chuyển PLANNED → IN_PROGRESS → …; `notes` ghi rõ chế độ                                                                                                                       |
| W9 | Test phân quyền ở giao diện (§17)              | Mai Anh         | Có biên bản test: NCC không xem được hợp đồng khác; kiểm soát viên không tạo được event; không ai sửa được decision                                                                                       |

### 2.3. P2 — nếu còn thời gian

| #   | Việc                                                  | Người chính | Tham chiếu                                                                                    |
| --- | ------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------- |
| W10 | Hash chain cho audit, kèm verifier                    | Lâm, Tuấn    | [02 mục 4](02_CHIEN_LUOC_BRONZE_SILVER_GOLD.md#4-audit-trail-và-hash-chain)                   |
| W11 | Demo ký số giả lập                                 | Mai Anh, Tuấn | [02 mục 5](02_CHIEN_LUOC_BRONZE_SILVER_GOLD.md#5-hợp-đồng-số-và-demo-ký-số)             |
| W12 | AI hỗ trợ diễn giải lý do                         | Tuấn          | [02 mục 6](02_CHIEN_LUOC_BRONZE_SILVER_GOLD.md#6-ai-có-giới-hạn-và-use-case-trường-học) |
| W13 | Rà [01](01_DE_BAI_VA_THUAT_NGU.md) theo đặc tả v1.0 | Hoàng         | Các ví dụ và lưu đồ phải khớp §8–9                                                  |

### 2.4. Hạn chế đã biết

Đây không phải việc dở, nhưng phải biết để không hứa quá.

- **Script không phải engine.** `tools/kiem_chung_nghiep_vu.py` chỉ dùng để kiểm chứng và đối chiếu; nó không xuất tệp nộp.
- **Định nghĩa `valid_approval_count`** giả thiết quorum bằng số vai trò (đúng ở 405/405 mốc). Nếu dữ liệu ẩn có cấu hình khác, mốc đó ra HOLD theo rule 80. Kết quả vẫn an toàn, nhưng đặc tả sẽ phải bổ sung.
- **Phạm vi kiểm chứng.** Sample chỉ phủ 5/13 loại mốc; 30 test tự tạo phủ các ca biên. Không có gì chứng minh khớp ground truth của 385 mốc còn lại.

---

## 3. Điểm không tự quyết được

### 3.1. Cần BTC trả lời

| Mã | Vấn đề                                                                                              | Đội đang chọn                                                 | Nếu BTC trả lời khác thì sửa                         | Số mốc bị ảnh hưởng |
| --- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------- |
| A05 | Tranh chấp đang mở chặn riêng mốc đó hay cả hợp đồng                                       | Chỉ mốc đó                                                    | BR-08; script đổi mặc định `contract_scope_dispute` | 31                        |
| A08 | Mốc ACTIVATION: `invoice_required = TRUE` nhưng INVOICE không nằm trong `required_event_types` | Không bắt buộc hoá đơn                                      | BR-06; script đổi mặc định `enforce_invoice_flag`   | 15                        |
| A07 | Cách làm tròn tiền phạt                                                                           | HALF_UP, làm tròn F trước khi trừ                            | BR-13; script đổi mặc định `rounding`               | 1 (MS0396)                |
| A01 | Quyền tạo KICKOFF_CONFIRMED, REQUIREMENTS_APPROVED, GO_LIVE, SERVICE_ACTIVATED                       | Đúng như dữ liệu (2 loại đầu: bên mua; 2 loại sau: NCC) | Ma trận §4.2 và hằng `AUTHORITY` trong script        | Tối đa 80               |
| A06 | Ai được đóng tranh chấp; FINANCE/SECONDARY có được từ chối không                          | Đóng: phía bên mua. Từ chối: mọi approver của bên mua    | BR-08, BR-09; test T14b, T15, T20                          | 0                         |
| A13 | Định dạng `conditions_met` / `missing_conditions`                                               | Token của `required_condition`, phân cách `;`              | §14.3 (chỉ đổi định dạng)                           | 0 về quyết định       |
| A14 | `confidence_score` có bắt buộc không, đo theo thang nào                                        | 1,00 / 0,80 / 0,50                                                | §14.2                                                     | 0 về quyết định       |
| A15 | Vòng sơ khảo có nộp CSV 405 dòng không, nộp qua kênh nào                                     | Chuẩn bị đủ, đưa vào phụ lục                             | Kế hoạch nộp (doc 03)                                   | —                        |

### 3.2. Khi BTC trả lời

1. Ghi câu trả lời và ngày nhận vào [§13](04_DAC_TA_NGHIEP_VU.md#13-giả-định-và-câu-hỏi-cần-xác-nhận) của đặc tả; đổi trạng thái giả định thành "Đóng".
2. Nếu câu trả lời khác phương án đang dùng:
   - sửa BR liên quan;
   - đổi giá trị mặc định trong script;
   - cập nhật test (gồm cả test hồi quy T48 nếu kết quả 405 mốc đổi);
   - nâng phiên bản theo [§19.2](04_DAC_TA_NGHIEP_VU.md#192-quy-trình-thay-đổi-đặc-tả). A05, A07, A08, A01 làm đổi kết quả nên lên **2.0**; A06, A13, A14 không đổi kết quả nên lên **1.1**.
3. Báo Tuấn và Hà Phương để engine và dashboard đổi theo trong cùng ngày.

### 3.3. Nếu BTC không trả lời trước hạn

Giữ nguyên các lựa chọn hiện tại. Trong hồ sơ, dành một mục "Giả định" liệt kê A01, A05, A07, A08 kèm số mốc bị ảnh hưởng. Như vậy giám khảo thấy đội đã nhận ra điểm mơ hồ, đã đo tác động, và đã chọn phương án có căn cứ.

### 3.4. Đội tự quyết (không cần hỏi BTC)

| Vấn đề                                                   | Các lựa chọn                                                | Khuyến nghị                                                                                                       | Người quyết        |
| ----------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Duyệt đặc tả v1.0                                       | Duyệt / yêu cầu sửa                                        | Duyệt sau W3, vì W3 có thể phát hiện điểm cần sửa                                                         | Hoàng, Mai Anh, Lâm |
| Phạm vi demo Silver (BR-19, as-of, hàng đợi ngoại lệ) | Làm thật / chỉ mô tả trong hồ sơ                        | Làm W6 trước. Chỉ làm W7, W8 nếu P0 xong trước cuối D3; nếu không thì mô tả bằng sơ đồ §9.4–9.5 | Lâm (điều phối)   |
| `confidence_score`                                        | Thang 1,00 / 0,80 / 0,50 / ghi 1,00 cho tất cả / để trống | Giữ thang 3 mức: giải thích được, và cho thấy minh bạch về giả định                                   | Hoàng, Tuấn         |
| Chỉ số Over-hold Rate (đội đề xuất)                  | Giữ / bỏ                                                     | Giữ: chứng minh hệ thống không "an toàn giả" bằng cách giữ hết                                           | Lâm, Thúy           |
| Tên trạng thái hợp đồng (§9.3)                       | Giữ / đổi                                                   | Giữ; chỉ dùng cho dashboard, không nằm trong CSV nộp                                                          | Hà Phương          |
| Đưa CSV vào phụ lục hồ sơ                            | Có / không                                                   | Có nếu A15 cho phép; nếu không, chỉ đưa ảnh dashboard và bảng KPI                                        | Thúy, Lâm           |
| Ai gửi câu hỏi BTC, qua kênh nào                       | —                                                             | Một đầu mối duy nhất, dùng kênh chính thức của BTC                                                        | Lâm                  |

---

## 4. Bản nháp câu hỏi gửi BTC

Bản nháp này dành cho BTC. Điền tên đội và người gửi, rồi gửi qua kênh chính thức. Mỗi câu đều nêu cách hiểu đội đang dùng, để BTC chỉ cần xác nhận hoặc điều chỉnh.

> **Kính gửi Ban Tổ chức Festival Chuyển đổi số 2026,**
>
> Đội \<TenDoi\> (Bảng D — Case 4: Smart Contract Workflow) xin hỏi một số điểm trong Data Pack v1.0 (snapshot 18/10/2026). Với mỗi câu, đội nêu cách hiểu đang áp dụng.
>
> 1. **Phạm vi tranh chấp.** Khi một milestone có `DISPUTE_OPENED` chưa được giải quyết, việc tạm giữ thanh toán chỉ áp dụng cho milestone đó, hay cho mọi milestone của cùng hợp đồng? (Mô tả rule priority 10 trong `payment_rules.csv` ghi "milestone/hợp đồng".) Đội đang hiểu: chỉ milestone có tranh chấp.
> 2. **Trường `invoice_required`.** Ở các milestone ACTIVATION của hợp đồng bảo trì, `invoice_required = TRUE` nhưng `required_event_types` không có INVOICE. Có bắt buộc INVOICE không? Đội đang hiểu: chỉ `required_event_types` quyết định các event bắt buộc.
> 3. **Làm tròn tiền phạt.** Đội làm tròn `penalty_amount_vnd_mn` tới 0,01 theo quy tắc làm tròn nửa lên (ví dụ 10,605 → 10,61), rồi tính `payable = planned − penalty`. Cách này có đúng không?
> 4. **Thẩm quyền tạo event.** Các loại `KICKOFF_CONFIRMED`, `REQUIREMENTS_APPROVED`, `GO_LIVE`, `SERVICE_ACTIVATED` không có trong `allowed_event_types` của bên nào. Đội đang hiểu: hai loại đầu do BUYER của hợp đồng tạo, hai loại sau do SUPPLIER của hợp đồng tạo. Cách hiểu này nhất quán với `UAT_PASSED` và `SERVICE_COMPLETED` trong `decision_sample.csv` (SC003, SC004). Đội hiểu như vậy có đúng không?
> 5. **Đóng tranh chấp và từ chối.** Ai được ghi `DISPUTE_RESOLVED`: chỉ bên mua, hay cả nhà cung cấp? `REJECTION` có thể do FINANCE_APPROVER / SECONDARY_APPROVER tạo không? Đội đang hiểu: chỉ phía bên mua được đóng tranh chấp; mọi approver của bên mua được từ chối.
> 6. **Định dạng `conditions_met` / `missing_conditions`.** Có định dạng bắt buộc không? Đội đang dùng token giống cột `required_condition`, phân cách bằng dấu `;`, ví dụ `EVENT:ACCEPTANCE;APPROVAL_QUORUM:1;NO_OPEN_DISPUTE`.
> 7. **`confidence_score`.** Trường này có bắt buộc không, và có thang đo quy định không? Đội đang dùng thang 0–1 theo quy ước riêng (1,00 / 0,80 / 0,50), không phải xác suất.
> 8. **Tệp kết quả.** Vòng sơ khảo có cần nộp tệp theo `submission_output_template.csv` (405 dòng) kèm hồ sơ không? Nếu có, nộp qua kênh nào? Mục 8 của đề chỉ nêu bản đề xuất và slide (PDF).
>
> Trân trọng,
> \<Họ tên người gửi\> — Đội \<TenDoi\>

| #  | Việc                                                                                                                                                 | Người chính                                                        | Xong khi                                                                                                                                                                                                                                                                                                                                                                                     |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1 | Engine sinh CSV 405 dòng, 22 cột, kèm tệp audit                                                                                                   | Tuấn (Hoàng hỗ trợ loader)                                        | Khớp từng dòng với `--export` của script ở các cột decision, reason_code, rule_id, status, payable, penalty, evidence, conditions; các cột `decision_reason`, `processing_time_ms`, `evaluated_at`, `engine_name`, `audit_trace_id`, `notes` có giá trị thật; đạt checklist [§14.6](04_DAC_TA_NGHIEP_VU.md#146-bất-biến-và-checklist-trước-khi-xuất-csv) |
| W2 | Duyệt đặc tả v1.0                                                                                                                                 | Hoàng chủ trì; Mai Anh duyệt §4.2 và §17; Lâm duyệt §14–16 | Dòng "Trạng thái" trong header đặc tả đổi thành "Đã duyệt", có tên người duyệt và ngày                                                                                                                                                                                                                                                                                    |
| W3 | Kiểm tay 8 loại mốc chưa có sample (SIGNING, DELIVERY, KICKOFF, REQUIREMENTS_APPROVAL, GO_LIVE_ACCEPTANCE, ACTIVATION, WARRANTY, WARRANTY_CLOSE) | Hoàng + Mai Anh                                                      | Mỗi loại có ít nhất 1 mốc được đối chiếu tay với event gốc; kết quả ghi vào [§11.5](04_DAC_TA_NGHIEP_VU.md#115-độ-phủ-của-sample)                                                                                                                                                                                                                                       |
| W4 | Gửi câu hỏi cho BTC (mục 4)                                                                                                                       | Hoàng soạn, Lâm gửi                                               | Đã gửi qua kênh chính thức và lưu bằng chứng; khi có trả lời thì cập nhật theo mục 3.2                                                                                                                                                                                                                                                                                      |
| W5 | Rút gọn thành proposal và slide                                                                                                                   | Thúy, Lâm review                                                    | Proposal 5–10 trang, slide ≤ 15 trang; trích §1, 4.2, 8.1, 9, 15, 16, 18; mọi con số khớp output của script/engine cùng phiên bản; nêu rõ các giả định A01, A05, A07, A08, A19                                                                                                                                                                                              |
