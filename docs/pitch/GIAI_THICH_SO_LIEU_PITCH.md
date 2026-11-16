# Giải thích số liệu trên slide pitch Vòng 3

Tài liệu cho người thuyết trình: ba cụm số trong [CodeCash_Vong3_Pitch.html](CodeCash_Vong3_Pitch.html) dễ bị hỏi vặn (độ tin cậy, baseline, độ tin được của bộ kiểm thử). Mỗi mục ghi số lấy từ đâu, chỗ nào trên slide từng sai và đã sửa thế nào. Số slide tính theo trang của bộ slide (trang bìa là slide 1; số nhỏ ở góc trên mỗi slide là số mục, nhỏ hơn số trang 1 đơn vị).

Mọi số dưới đây đã chạy lại ngày 15/11/2026 trên Data Pack chính thức, profile `BTC_SUBMISSION`, policy `CASE4_BTC` 2.1.0:

```
python apps/engine/cli.py --output out
```

Lệnh này sinh ra `out/submission_output.csv`, `out/metrics.json` và `out/audit.json`.

---

## 1. Độ tin cậy (slide 11 "Truy vết", ô 385 / 15 / 5 / 0)

### Độ tin cậy là gì

`confidence_score` là thang đo mức chắc chắn của đội cho từng mốc. Nó **không phải xác suất đúng** và **không bao giờ làm đổi quyết định**: tranh chấp đang mở thì vẫn tạm giữ, dù điểm cao.

Code: [confidence.py:94-118](../../apps/engine/codecash_engine/confidence.py). Trọng số: [case4_btc.json](../../apps/engine/policy/case4_btc.json) (`readings`, `confidence`).

### Cách tính

Mỗi mốc bắt đầu ở **1,00**, rồi bị hạ điểm theo hai nhóm.

**Nhóm 1: điểm diễn giải BTC chưa chốt (trừ thẳng).** Engine chạy lại mốc theo cách hiểu ngược lại. Nếu quyết định, mã lý do hoặc số tiền thay đổi, mốc bị trừ trọng số của điểm diễn giải đó.

| Mã | Câu hỏi chưa chốt | Đội đang hiểu | Trọng số |
|---|---|---|---|
| A08 | Mốc có `invoice_required = TRUE` nhưng INVOICE không nằm trong danh sách chứng từ bắt buộc: có bắt buộc hoá đơn không? | Không, chỉ theo `required_event_types` | −0,20 |
| A06 | Ai được đóng tranh chấp? | Bài nộp BTC chỉ kiểm tham chiếu tới tranh chấp; không bắt buộc bên mua đóng (Data Pack: 0 mốc đổi, vì 8 bản đóng đều do bên mua) | −0,10 |

**Phạm vi tranh chấp không còn là điểm chưa chốt.** Đội chốt tranh chấp tính **theo mốc** (BR-08): tranh chấp ở một mốc không giữ các mốc khác của cùng hợp đồng. Cách hiểu "tranh chấp lan cả hợp đồng" (mã cũ A05) đã bỏ khỏi phần tính điểm từ policy 2.1.0, nên không còn hạ điểm mốc nào. Công cụ đo độ nhạy vẫn chạy được cách hiểu đó để tham khảo (31 mốc sẽ đổi sang HOLD), nhưng nó không ảnh hưởng đầu ra.

Nguồn: BTC chỉ yêu cầu cột `confidence_score` ([README Data Pack](../../BangD-Case4/DataPack-CASE4_SmartContractWorkflow/README.md)), và trả lời là điểm "trong [0, 1], không thay quyết định, đội tự giải thích". Công thức và trọng số do đội đặt, ghi ở [NGHIEP_VU.md mục 8](../NGHIEP_VU.md) (bảng thành phần) và mục 12 (định nghĩa A06, A08). Engine đọc giá trị từ [case4_btc.json](../../apps/engine/policy/case4_btc.json) (`readings`, `confidence`).

**Nhóm 2: chất lượng dữ liệu (nhân giảm).**

| Yếu tố | Hệ số |
|---|---|
| Mỗi bản lặp chứng từ (tối đa 3 bản) | ×0,97 |
| Có sự kiện không liên quan tới mốc | ×0,97 |
| Cảnh báo thứ tự sự kiện | ×0,90 |
| Hoàn thành trong vòng ±1 ngày quanh hạn + ân hạn (mốc có phạt trễ) | ×0,95 |
| Có lỗi dữ liệu | chặn trần 0,50 |

### Kết quả thực tế trên 405 mốc

| Điểm | Số mốc | Lý do (cột `notes`) |
|---|---|---|
| 1,00 | 385 | Không phụ thuộc giả định nào, dữ liệu sạch |
| 0,80 | 15 | A08 |
| 0,97 | 5 | Có 1 bản lặp chứng từ (đã khử, giữ bản sớm nhất) |

Cả 20 mốc dưới 1,00 đều có quyết định RELEASE. Điều này hợp lý, vì đây là những mốc *được chi* mà kết quả có thể đổi nếu BTC trả lời khác.

### Ví dụ cụ thể cho từng mã hạ điểm

Mã hạ điểm được ghi trong cột `notes` dưới dạng `confidence:<mã>`. Mã nào có trên Data Pack thì lấy mốc thật. Mã nào không mốc nào dính thì dựng ca thử bằng helper `Case` trong [tests/test_dac_ta_nghiep_vu.py](../../tests/test_dac_ta_nghiep_vu.py) và chạy qua `confidence_scores` thật của engine (ngày 15/11). Không có số nào tính tay.

#### Ví dụ thật trên Data Pack

**A08: cờ hoá đơn mâu thuẫn với danh sách chứng từ (0,80).** Mốc **MS0047** (CT0012, kích hoạt dịch vụ bảo trì, 921 triệu):
- Chứng từ bắt buộc: `CONTRACT_SIGNED;SERVICE_ACTIVATED`. Nhưng `invoice_required = TRUE`, và không có event INVOICE nào.
- Đội đi theo `required_event_types`, nên mốc được **RELEASE 921 triệu**. Nếu bắt buộc hoá đơn theo cờ thì thành **HOLD MISSING_REQUIRED_EVENT**. Điểm **0,80**.
- Cả 15 mốc kích hoạt bảo trì đều gặp đúng mâu thuẫn này.

**DUPLICATE: chứng từ gửi lặp nguyên bản (0,97).** Mốc **MS0172** (CT0043, giao hàng đợt giữa, 752,5 triệu):
- `EV00482` DELIVERY lúc 09:40 và `EV00484` DELIVERY lúc 09:42, cùng người gửi S012, **cùng số chứng từ** DN-CT0043-02.
- Engine giữ bản sớm nhất (`EV00482`) và loại `EV00484` khỏi căn cứ. Quyết định không đổi: **RELEASE 752,5 triệu**. Điểm vẫn hạ còn **0,97**, để người duyệt biết hồ sơ có bản gửi lại.

#### Ca thử dựng riêng (Data Pack không có mốc nào dính)

Mọi ca dùng chung hợp đồng thử CT9001: bên mua B009, nhà cung cấp S021, mốc giao hàng MS9001 cần `DELIVERY;INVOICE`, giá trị 1.000 triệu, hạn 10/06, ân hạn 2 ngày (tức hạn cuối 12/06), phạt 0,10%/ngày.

| Mã | Ca dựng | Quyết định | Điểm | Vì sao |
|---|---|---|---|---|
| **A06** | Bên mua mở tranh chấp 06/06; **nhà cung cấp S021** đóng 07/06, có tham chiếu đúng | RELEASE 1.000 | **0,81** | Bài nộp chỉ kiểm tham chiếu nên tranh chấp đã đóng. Nếu chỉ bên mua được đóng thì tranh chấp vẫn mở, mốc thành HOLD: trừ 0,10. Thêm cảnh báo `RESOLVED_BY_PAYEE` (người nhận tiền tự đóng tranh chấp): ×0,90. (1 − 0,10) × 0,90 = 0,81 |
| A06 (đối chứng) | Như trên nhưng **bên mua** đóng | RELEASE 1.000 | 1,00 | Hai cách hiểu cho cùng kết quả. Trên Data Pack, 8 bản đóng tranh chấp đều do bên mua, nên A06 không hạ điểm mốc nào |
| **UNRELATED_EVENT** | Mốc giao hàng có thêm event **GO_LIVE** của nhà cung cấp | RELEASE 1.000 | **0,97** | GO_LIVE không thuộc chứng từ bắt buộc của mốc này. Engine bỏ qua nó, nhưng hạ điểm vì hồ sơ có thứ không khớp |
| **SEQUENCE_WARNING** (`APPROVAL_BEFORE_EVIDENCE`) | Chủ hợp đồng **phê duyệt lúc 08:00**, hàng giao lúc 09:00 cùng ngày | RELEASE 1.000 | **0,90** | Duyệt trước khi có chứng từ: hợp lệ về luật nhưng bất thường về quy trình |
| **SEQUENCE_WARNING** (`POSSIBLE_DUPLICATE`) | Thêm một DELIVERY lúc 15:00 cùng ngày, cùng người gửi, **khác số chứng từ** | RELEASE 1.000 | **0,90** | Khác số chứng từ nên không bị khử như DUPLICATE, nhưng cùng loại, cùng người, cách nhau dưới 24 giờ thì nghi là gửi trùng |
| **LATENESS_BOUNDARY** | Hoàn thành **12/06**, đúng ngày cuối ân hạn | RELEASE 1.000 | **0,95** | Hoàn thành trong vòng ±1 ngày quanh hạn cuối, lệch một ngày là đổi sang phạt |
| **LATENESS_BOUNDARY** | Hoàn thành **13/06**, trễ 1 ngày | PENALTY, phạt 1, chi 999 | **0,95** | Như trên, theo chiều ngược lại |
| (đối chứng) | Hoàn thành 14/06, trễ 2 ngày | PENALTY, phạt 2, chi 998 | 1,00 | Trễ rõ ràng, không còn sát ranh giới |
| **DATA_ISSUE** | `required_approval_quorum = "?"` (không đọc được) | HOLD UNRESOLVED_CONDITION (nhánh ELSE) | **0,50** | Có lỗi dữ liệu thì điểm bị chặn trần 0,50. Lỗi khác cùng loại: `required_event_types` trống, quorum khác số vai trò, event có `contract_id` lệch mốc |
| **DUPLICATE ×4** | 4 bản lặp nguyên bản của cùng một DELIVERY | RELEASE 1.000 | **0,91** | Mỗi bản ×0,97 nhưng chỉ tính tối đa 3 bản: 0,97³ ≈ 0,91 |

Ba điều rút ra từ các ví dụ:
- **Điểm không bao giờ đổi quyết định.** Mọi ca trên đều giữ nguyên quyết định của bảng luật; điểm chỉ báo người duyệt nên xem kỹ mốc nào.
- **DUPLICATE và POSSIBLE_DUPLICATE khác nhau.** Cùng số chứng từ thì engine khử và hạ nhẹ (×0,97). Khác số chứng từ thì engine không khử được, chỉ cảnh báo và hạ mạnh hơn (×0,90).
- **Các yếu tố cộng dồn được.** Ca A06 bị cả trừ trọng số (−0,10) lẫn nhân hệ số cảnh báo (×0,90).

### Các ô trên slide

| Số | Nhãn |
|---|---|
| 385 | mốc độ tin cậy 1,00 |
| 15 | mốc 0,80: phụ thuộc điểm BTC chưa chốt về hoá đơn bắt buộc (A08) |
| 5 | mốc 0,97: có bản lặp chứng từ, đã khử nhưng vẫn hạ điểm để người duyệt xem lại |
| 0 | vi phạm bất biến trên 405 mốc |

Trước policy 2.1.0, slide ghi 355 / 45: 30 mốc 0,80 do A05, 14 mốc 0,80 do A08 và mốc MS0054 0,60 do cả hai. Khi đội chốt tranh chấp theo mốc, 30 mốc A05 lên 1,00 và MS0054 lên 0,80 (chỉ còn A08). Không quyết định hay số tiền nào đổi.

Không có mốc nào bị hạ điểm vì sát ranh giới trễ hay sự kiện bất thường. Engine *có kiểm tra* hai yếu tố này (bước 8 trên slide pipeline), nhưng trên Data Pack hiện tại không mốc nào dính.

Nếu bị hỏi "mốc nào sát ranh giới trễ?", câu trả lời đúng là: *engine có kiểm tra, nhưng dữ liệu này không có mốc nào*. Đừng để slide ngầm nói là có.

---

## 2. Baseline (slide 12 "Evidence & KPI" và slide 13 "Cơ sở so sánh")

### Baseline là gì

Baseline là **một hệ thống ngây thơ dùng làm mốc so sánh**: hệ "luôn chi đủ". Với mọi mốc, nó đều trả `RELEASE` và chi đúng số tiền kế hoạch, không xem chứng từ, phê duyệt hay tranh chấp.

Mục đích: cho giám khảo thấy con số 20/20 của CodeCash không phải "đề dễ". Một hệ không có logic gì vẫn đúng được 8/20. Vậy phần CodeCash đóng góp thật là 12 mẫu khó còn lại, và quan trọng nhất là **không chi sai đồng nào**.

### Vì sao ra đúng các số trên slide

20 mẫu có nhãn ([decision_sample.csv](../../BangD-Case4/DataPack-CASE4_SmartContractWorkflow/03_labels_sample/decision_sample.csv)) có phân bố:

| Quyết định đúng | Số mẫu |
|---|---|
| RELEASE | 8 |
| HOLD | 8 |
| REJECT | 2 |
| PENALTY | 2 |

Hệ "luôn chi đủ" luôn đoán RELEASE, nên:

| KPI | Baseline | Cách ra số |
|---|---|---|
| Rule Execution Accuracy | **8/20** (40%) | Chỉ đúng 8 mẫu vốn là RELEASE |
| Macro-F1 | **0,14** | F1 lớp RELEASE = 2·(8/20·1)/(8/20+1) ≈ 0,571; ba lớp còn lại F1 = 0; trung bình 4 lớp = 0,571/4 ≈ 0,143 |
| Unauthorized Payment Rate | **10/10** (100%) | 10 mẫu chưa đủ điều kiện (8 HOLD + 2 REJECT) đều bị chi |
| Payment / Penalty Amount | — | Không tính: hệ luôn chi đủ thì không có khái niệm phạt để so |
| Audit Trace / Processing | — | Không áp dụng |

Slide 13 vẽ lại đúng các số này dưới dạng thanh: "Luôn chi đủ" đúng 40%, chi sai 100%; CodeCash đúng 100%, chi sai 0%.

### Chỗ cần lưu ý

1. **Chú thích cũ "Tái lập: `cli.py --output out` → `metrics.json`" chỉ đúng cho cột CodeCash.** `metrics.json` có `decisionAccuracy`, `macroF1`, `unauthorizedPayment`… của CodeCash, nhưng **không có trường baseline nào**, và trong repo cũng không có code tính baseline. Giám khảo chạy lệnh để kiểm sẽ không thấy 8/20 hay 0,14. **Đã sửa (15/11):** chú thích giờ ghi baseline tính từ phân bố nhãn (8 RELEASE · 8 HOLD · 2 REJECT · 2 PENALTY), còn lệnh tái lập chỉ áp dụng cho cột CodeCash. **Đã làm thêm (15/11):** `metrics.json` giờ có khối `kpi.baseline` (`ALWAYS_RELEASE`: 8/20, macro-F1 0,1429, chi sai 10/10), nên cùng một lệnh tái lập ra đủ cả hai cột; test `tests/test_engine_dataset.py` khoá các số này.
2. **Baseline chỉ đo trên 20 mẫu**, không đo trên 6.237 ca tổng hợp. Nếu bị hỏi, nói rõ như vậy.
3. **Baseline yếu là có chủ đích.** Nó là mức sàn để so sánh, không phải đối thủ thật. Nếu bị hỏi "sao không so với hệ khác?", trả lời: chưa có hệ tham chiếu công khai cho Case 4, nên đội chọn mức sàn đơn giản nhất mà ai cũng kiểm lại được, rồi bổ sung bằng kiểm thử cài lỗi (xem mục 3 về cách đọc đúng kết quả cài lỗi).

### Tự kiểm lại số baseline

```python
import csv
rows = list(csv.DictReader(open(
    "BangD-Case4/DataPack-CASE4_SmartContractWorkflow/03_labels_sample/decision_sample.csv",
    encoding="utf-8-sig")))
y = [r["expected_decision"] for r in rows]
pred = ["RELEASE"] * len(y)                      # hệ "luôn chi đủ"
acc = sum(p == t for p, t in zip(pred, y))       # 8
unauth = sum(t in ("HOLD", "REJECT") for t in y) # 10, tất cả đều bị chi
f1 = []
for c in ("RELEASE", "HOLD", "REJECT", "PENALTY"):
    tp = sum(p == c == t for p, t in zip(pred, y))
    fp = sum(p == c != t for p, t in zip(pred, y))
    fn = sum(t == c != p for p, t in zip(pred, y))
    pr = tp / (tp + fp) if tp + fp else 0
    rc = tp / (tp + fn) if tp + fn else 0
    f1.append(2 * pr * rc / (pr + rc) if pr + rc else 0)
print(acc, "/20 · macro-F1", round(sum(f1) / 4, 2), "· chi sai", unauth, "/", unauth)
# 8 /20 · macro-F1 0.14 · chi sai 10 / 10
```

---

## 3. Bộ kiểm thử có bị rò rỉ dữ liệu / overfitting không (slide 12, 13, 14)

### Kết luận ngắn

Engine chạy bảng luật chính thức của BTC chứ không học từ dữ liệu, nên khó bị overfitting theo nghĩa học máy. Nhưng **có rò rỉ** theo một nghĩa khác: cùng một nhóm người viết engine, viết đáp án và viết bài kiểm tra. Hệ quả là các con số 100% đo được *"engine làm đúng điều đội hiểu"*, chưa đo được *"engine làm đúng điều BTC muốn"*. Có 3 vấn đề, xếp từ nặng đến nhẹ.

### 3.1. 16/16 lỗi cài bị bắt là đo trên chính bộ lỗi đã dùng để sửa bộ ca (nặng nhất)

Bằng chứng nằm trong commit `e579471` (26/10/2026), cùng commit thêm [mutation_check.py](../../tools/mutation_check.py):

> "the synthetic benchmark killed 11 and missed resubmitted evidence, same-role and unrequired-role approvals, a resolution closing every dispute and a resent dispute. Five scenarios now cover those cases, so the benchmark kills all 16."

Diễn biến:

1. Bộ ca tổng hợp ra đời ngày 25/10 (commit `dd599db`).
2. Ngày 26/10 đội viết 16 lỗi cài và chạy thử. Bộ ca bắt được **11/16**.
3. Trong cùng commit, đội thêm đúng 5 kịch bản nhắm vào 5 lỗi lọt: `RESUBMITTED_AFTER_DEADLINE_RELEASE`, `SAME_ROLE_TWICE_HOLD`, `UNREQUIRED_ROLE_APPROVAL_HOLD`, `SECOND_DISPUTE_STILL_OPEN_HOLD`, `DUPLICATE_DISPUTE_RESOLVED_RELEASE`. Kết quả thành 16/16.

Đây là dùng lại tập kiểm tra: 16/16 chỉ chứng minh bộ ca bắt được 16 lỗi mà đội đã biết trước. **Con số khách quan về khả năng bắt lỗi chưa biết là 11/16 (69%).** 7/16 của 20 mẫu BTC vẫn là con số sạch, vì 20 mẫu không bị chỉnh theo lỗi cài.

### 3.2. Đáp án của bộ ca tổng hợp do đội viết, theo cách hiểu đề của đội

Trong [benchmark.py:79-114](../../apps/engine/benchmark.py), đáp án đúng đến từ hàm `expected_outcome`, do đội tự viết lại bảng luật PR\*. Tác giả kịch bản cũng tự khai các "sự thật" của ca, ví dụ `valid_approvals=1` hay `anomaly=True`.

- **Điểm tốt:** hàm này tách khỏi phần xử lý sự kiện của engine (khử trùng lặp, kiểm thẩm quyền, đếm phê duyệt, tính ngày hoàn thành). Nên nó vẫn bắt được lỗi *cài đặt*, như 11 lỗi ở lần chạy đầu cho thấy.
- **Điểm yếu:** nó dùng **cùng cách hiểu đề** với engine:
  - tranh chấp tính theo mốc (đội đã chốt), không bắt buộc hoá đơn (A08);
  - bên cung cấp gửi REJECTION thì tạm giữ, người thực hiện không xác định thì tạm giữ, dữ liệu lỗi thì tạm giữ. Đây là nguyên tắc đội tự đặt, BTC chưa xác nhận.

Nếu đội hiểu sai một điều khoản, engine và đáp án sẽ sai giống nhau, và kết quả vẫn là 100%. Tương tự với 20 mẫu: docstring của `benchmark.py` thừa nhận engine được viết trong lúc đọc chúng. 20/20 là độ chính xác trên tập đã nhìn thấy, không phải tập kiểm tra.

### 3.3. 6.237 ca thực chất là 33 kịch bản; chia dev/test không có tác dụng

Chạy lại `python apps/engine/benchmark.py` ngày 15/11:

| Nửa | Số ca | Quyết định đúng | Khớp đủ 4 trường | Chi sai |
|---|---|---|---|---|
| dev | 6.274 | 6.274 | 6.274 | 0/4.078 |
| test | 6.237 | 6.237 | 6.237 | 0/4.044 |

- 6.237 ca = 33 kịch bản mẫu × khoảng 190 mốc. Các ca cùng kịch bản gần như giống hệt nhau (chỉ khác tham số của mốc), nên số mẫu độc lập thực sự chỉ khoảng **33**.
- Bộ ca chia dev/test bằng hash của `contract_id`. Cách này chặn được việc biến thể của cùng một mốc rơi vào cả hai nửa, nhưng **nửa test dùng đúng 33 kịch bản của nửa dev**, nên không kiểm tra được tình huống mới. Cả hai nửa đều 100%, và chưa từng có quyết định nào được đưa ra dựa trên kết quả nửa dev.
- Vì vậy dòng cũ **"Cận trên 95% trên ca tổng hợp: 0,09%"** tính sai bản chất: khoảng Wilson trên 4.044 ca chỉ đúng khi các ca độc lập với nhau.

### Đã sửa trên slide (15/11)

| Slide | Trước | Sau |
|---|---|---|
| 12 · Rule Execution Accuracy | Tập đo "+ 6.237 ca tổng hợp"; kết quả "6.237/6.237" | "+ 33 kịch bản tổng hợp"; "33/33 kịch bản"; giới hạn thêm "engine viết khi đã đọc 20 mẫu này" |
| 12 · Macro-F1 | "+ 6.237 ca tổng hợp" | "+ 33 kịch bản tổng hợp" |
| 12 · Unauthorized Payment | Giới hạn "Cận trên 95%: 0,09%" | "4.044 ca thuộc 33 kịch bản, không độc lập nên không tính khoảng tin cậy" |
| 12 · chú thích | Baseline "tái lập qua metrics.json" | Baseline tính từ phân bố nhãn; ca tổng hợp đo độ phủ, không phải độ chính xác |
| 12 · lời nói | "nên đội dựng thêm ca tổng hợp" | Thêm: đáp án kịch bản do đội viết, chứng minh "đúng điều đội hiểu", phần còn lại chờ tập ẩn |
| 13 · biểu đồ lỗi cài | 7/16 · 16/16 | 7/16 · **11/16 (lần đầu)** · 16/16 làm mờ, kèm chú thích "đo trên chính bộ lỗi đã dùng để bổ sung kịch bản" |
| 13 · thẻ "Bằng chứng thêm" | "tách theo hợp đồng thành nửa phát triển và nửa kiểm tra" | "đáp án do đội viết, nên đo độ phủ chứ không thay được tập ẩn của BTC" |
| 13 · lời nói | "Đó là lý do tin vào con số 6.237/6.237" | Kể đúng diễn biến 11 → 16, nói thẳng con số khách quan là 11/16 |
| 14 · giới hạn "Dữ liệu" | "đo thêm trên ca tổng hợp và kiểm thử đột biến" | "ca tổng hợp do đội tự gán đáp án → đo độ phủ và bắt lỗi cài đặt, độ chính xác thật chờ tập ẩn" |

### Nếu giám khảo hỏi

- *"100% có phải overfitting không?"* Engine không học từ dữ liệu mà chạy bảng luật của BTC. Rủi ro thật là đội hiểu sai đề. Đội đã khoanh vùng rủi ro đó: 15 mốc phụ thuộc A08 được hạ độ tin cậy, còn phạm vi tranh chấp thì đội đã chốt theo mốc (mục 1). Phần còn lại chờ 250 mốc ẩn và 135 mốc holdout.
- *"Bộ ca được dựng trước hay sau khi biết danh sách lỗi?"* Trước, rồi bổ sung 5 kịch bản sau khi thấy 5 lỗi lọt. Con số khách quan là 11/16.
- *"6.237 ca có độc lập không?"* Không. Đó là 33 kịch bản áp lên mọi mốc, dùng để chứng minh độ phủ.

### Việc nên làm thêm để có bằng chứng thật (chưa làm)

1. **Bộ lỗi giữ lại:** nhờ một người chưa đọc `benchmark.py` viết 8–10 lỗi mới, chạy đúng một lần và báo kết quả nguyên trạng, không sửa bộ ca theo kết quả đó. Đây là cách duy nhất để có con số mới thay cho 11/16.
2. **Đáp án độc lập:** một thành viên không viết engine tự gán nhãn khoảng 30 ca chỉ dựa vào đề và README, rồi so với engine. Ca nào lệch chính là chỗ đội đang hiểu đề khác nhau, nên đưa vào danh sách câu hỏi gửi BTC.
3. ~~**Baseline trong `metrics.json`**~~: đã làm ngày 15/11 (khối `kpi.baseline`).

---

## Tóm tắt các chỉnh sửa trên file HTML

| Vị trí | Việc | Trạng thái |
|---|---|---|
| Slide 11 "Truy vết", bốn ô độ tin cậy | Theo policy 2.1.0 (bỏ A05): 385 / 15 / 5 / 0, mục 1 | Đã sửa |
| Slide 12, chú thích baseline | Ghi rõ baseline tính từ phân bố nhãn, mục 2 | Đã sửa |
| Slide 12, 13, 14: số liệu ca tổng hợp và lỗi cài | Trình bày đúng 33 kịch bản, 11/16, bỏ khoảng tin cậy 0,09%, mục 3 | Đã sửa |
| `metrics.json` | Thêm khối baseline | Đã làm (15/11) |
