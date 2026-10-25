# Bàn giao tích hợp engine và AI cho Hoàng, Lâm

Ngày 25/10/2026, giờ Bangkok. Hai module riêng của Hoàng/Lâm chưa được cung cấp; tài liệu này chốt điểm nối, cách kiểm và phạm vi hiện có, không coi module tương lai là đã tích hợp.

Người mới nhận việc hoặc muốn sửa phần khác bắt đầu từ [hướng dẫn tiếp quản chung](30_HUONG_DAN_TIEP_QUAN_VA_PHAT_TRIEN_TIEP.md). Tên Hoàng/Lâm là đầu mối dự kiến; cả đội có thể đổi người phụ trách hoặc cách triển khai, bàn giao bằng [mẫu ghi việc](templates/HANDOFF_TEMPLATE.md).

## 1. Có bắt buộc huấn luyện mô hình không?

**Theo nội dung BTC đội gửi: chưa có yêu cầu bắt buộc huấn luyện mô hình.** Ground truth là đáp án chuẩn để đánh giá; thuật ngữ này không đồng nghĩa bài thi phải dùng ML. Lõi hiện tại là rule engine, không cần huấn luyện để đưa ra RELEASE/HOLD/REJECT/PENALTY. ELSE là nhánh mặc định cuối cùng → HOLD, không phải event cần thêm vào dữ liệu.

Ưu tiên: Bronze đúng Data Pack → Silver có luồng/audit → Gold/AI có bằng chứng. Giữ toàn bộ 405 mốc trong template; chỉ đo accuracy theo 20 nhãn công khai. Baseline đội sinh là **dự đoán tham chiếu của đội**, không phải ground truth BTC cho 250 HIDDEN hay 135 HOLDOUT. Căn cứ và phần diễn giải của đội được phân biệt trong [15 — Xác nhận BTC](15_XAC_NHAN_BTC_VA_GIA_DINH.md).

## 2. Điểm nối hiện tại

| Phần | Điểm vào | Đầu ra / trách nhiệm |
| --- | --- | --- |
| Engine Data Pack | `apps/engine/cli.py`, hàm `evaluate`; CLI `--json` | Kết quả đầy đủ: rows 22 cột, traces, summary/KPI |
| Màn kết quả Data Pack | API `GET /api/v1/engine/decisions`, `POST /api/v1/engine/evaluate` | Mặc định gọi Python; `ENGINE_URL` chỉ thay nhánh đọc/chạy Data Pack chính thức bằng raw `GET /decisions` |
| Workflow sau thao tác | `apps/api/src/domain/engine.ts::runEngine` | Xuất bảng hiện tại sang dataset tạm, chạy `--workflow`, kiểm kết quả rồi mới lưu trong transaction/audit |
| Dataset upload | `apps/api/src/engine.ts` → Python `--data` | Giữ profile BTC_SUBMISSION; xuất CSV/audit/metrics. Không tự gửi dataset lên `ENGINE_URL` |
| AI trích xuất | `apps/api/src/trust/term-provider.ts::TermExtractionProvider` | Sáu đề xuất + nguồn trang/quote; không được ghi hồ sơ hay quyết định thanh toán |
| Đồng ý áp dụng AI | `ExtractionService.confirm` | Kiểm actor/quyền, draft version/hash và giá trị; người dùng đối chiếu/xác nhận trước khi khóa |

**Chú ý:** đặt `ENGINE_URL` không thay toàn bộ engine workflow và không chuyển dữ liệu sống cho HTTP worker. Worker hiện tại chỉ có GET cho Data Pack, chưa có giao thức POST live dataset. Khi thay thuật toán chung, tích hợp tại adapter Python hoặc bổ sung transport live có contract/test riêng; không giả vờ mọi luồng đã dùng module mới.

## 3. Hoàng — tích hợp engine

### Chạy và sinh bộ mẫu thật

Từ thư mục gốc repo, dùng Node theo `.nvmrc`, Python 3.12+ và cài dependency theo lockfile:

```bash
pnpm install --frozen-lockfile
pnpm integration:check
```

Lệnh build API, chạy engine hiện tại và sinh:

- `artifacts/integration/engine-response.example.json`: đủ 405 dự đoán/traces, dùng làm **mẫu cấu trúc**, không phải hidden labels.
- `artifacts/integration/reference/submission_output.csv`: 22 cột theo template gốc; `audit.json`, `metrics.json` đi cùng lần chạy.
- `artifacts/integration/report.json`: kết quả gate, số mẫu công khai khớp và khác biệt baseline.

### Kiểm module thay thế trước khi nối

Module của Hoàng cần xuất JSON raw cùng cấu trúc `engine-response.example.json`, không có lớp bọc `{success,data}`. Giữ ID từ CSV và không đọc `decision_sample.csv` để quyết định. Chạy:

```bash
pnpm integration:check --candidate /tmp/hoang-engine-response.json --out artifacts/integration-hoang
```

Gate có mã thoát khác 0 khi không đạt. Nó kiểm schema/trace/tiền, đủ mốc và sáu trường điền sẵn, đúng fingerprint, profile BTC, không có invariant violations; đối chiếu 20 sample về decision/reason/payable/penalty; so quyết định, trạng thái, reason, rule, tiền, điều kiện và evidence trên cả pack với engine đội. Confidence chỉ kiểm `[0,1]`, không ép công thức đội mới giống baseline. Thứ tự token điều kiện/evidence không làm phát sinh khác biệt giả.

Khác baseline có nghĩa **cần review**, không chứng minh module mới sai hay baseline đúng ground truth ẩn. Nếu BTC làm rõ một giả định làm đổi đáp án, cập nhật spec + evaluator + test + tài liệu cùng nhau; không sửa output để qua gate. Có thể dùng các test đổi ID, đảo thứ tự event và bỏ labels để kiểm khả năng tổng quát.

### Contract v1 và bảo vệ runtime

`apps/api/src/domain/engine-contract.ts` là nguồn kiểm tra thực thi:

- Tiền ở row/result/summary là chuỗi thập phân cố định hai chữ số; raw penalty có thể nhiều chữ số. Số âm, float và NaN không hợp lệ. Đối soát trong guard dùng BigInt theo đơn vị 0,01 triệu VND; engine nghiệp vụ vẫn dùng Python Decimal.
- HOLD/REJECT không có tiền trả/phạt. RELEASE/PENALTY phải bảo toàn planned = payable + penalty.
- Mỗi row liên kết một trace riêng; trace cùng milestone/contract, decision/reason/rule/status/tiền/điều kiện/evidence và fingerprint. Summary không được tự khai tổng lệch các row.
- `BTC_SUBMISSION` và `WORKFLOW` tách biệt. Đủ mốc không đồng nghĩa chỉ là count bằng 405: kiểm tập ID và metadata tương ứng dữ liệu được gọi.
- Payload lỗi bị API từ chối `ENGINE_OUTPUT_INVALID`; engine HTTP lỗi trả `ENGINE_UNAVAILABLE`, không âm thầm dùng engine khác. Guard kiểm cấu trúc/nhất quán, **không thay evaluator hay chứng minh nghiệp vụ đúng**.

Riêng preview tác động của bản luật cần xem cả kết quả sai tiền để giải thích lỗi. `runEngine` có chế độ diagnostic cho trường hợp engine đã báo invariant violations; preview được đọc để hiển thị chẩn đoán. Các vi phạm vẫn đi nguyên vào outcome; `applyRun` và hypothetical payment preview tiếp tục chặn `ENGINE_INVARIANT_VIOLATION` và rollback. Chế độ này không được dùng để xuất candidate bài nộp hay lưu quyết định live.

Có thể thử worker hiện có bằng `pnpm dev:engine` và `ENGINE_URL=http://127.0.0.1:8000` ở API. Worker raw ở `/decisions`; API công khai của app vẫn giữ envelope và quyền `engine:read`/`engine:evaluate`. Worker là dịch vụ nội bộ, không có xác thực người dùng/tenant; không nối trực tiếp từ browser.

## 4. Lâm — tích hợp AI đọc hợp đồng

Đọc `TermExtractionInput`, `TermExtractionResult`, `TermExtractionProvider` tại `apps/api/src/trust/term-provider.ts`. Factory hiện có adapter local và Gemini đang dùng thật trong service; không cần sửa trang React để đổi thuật toán đề xuất.

Input do service chuẩn bị sau kiểm quyền và hash: PDF bytes đã render/kiểm hash, text theo trang, page count và job key gắn tổ chức/hồ sơ/version/provider. Output giữ đúng sáu path:

| Path | Kiểu giá trị | Nguồn bắt buộc khi có đề xuất |
| --- | --- | --- |
| `valueMillion` | chuỗi số tiền, triệu VND | page + quote |
| `graceDays` | chuỗi số ngày nguyên | page + quote |
| `penaltyRatePct` | chuỗi phần trăm mỗi ngày | page + quote |
| `maxPenaltyPct` | chuỗi phần trăm trần | page + quote |
| `startDate` | chuỗi YYYY-MM-DD | page + quote |
| `endDate` | chuỗi YYYY-MM-DD | page + quote |

Thiếu/mâu thuẫn → `value: null`, `state: NEEDS_REVIEW`, không đoán để điền đủ. Có đề xuất → `SUGGESTED`; quote phải đối chiếu đúng trang text. Với scan, ghi rõ chưa xác minh để người dùng rà. Adapter Gemini đã có `validateGeminiFields`, giới hạn request/timeout, chống gọi lặp và báo lỗi provider; dùng lại cơ chế đó khi nối module mới. Không tự cấp `verified: true` từ lời model.

Provider mới phải được đăng ký tường minh trong factory, khai danh tính/version/model để cache và audit đúng, mở rộng enum `ExtractionProposal.extractor`/config nếu cần. Chuẩn hóa và kiểm schema/giá trị/nguồn trước khi trả về service. Không sửa hoặc bỏ các kiểm tra của `ExtractionService.confirm`, không gọi AI để RELEASE hay cấp quyền.

Local không gọi Google; Gemini chỉ gọi từ API, đọc biến môi trường backend `EXTRACTION_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`. Không chuyển key sang `VITE_*`, JSON mẫu hoặc repo. Có model API sẵn không phải đội đã huấn luyện model; chỉ mô tả đúng phần đã tích hợp. Nếu muốn fine-tune sau này, trước hết cần nhãn trích xuất theo hợp đồng và tập đánh giá riêng; 20 nhãn quyết định milestone không phải nhãn OCR/trích xuất.

## 5. Nghiệm thu cùng nhau

1. Hoàng chạy gate với JSON của module; gửi `report.json`, phiên bản thuật toán/spec, danh sách giả định và diff cần review.
2. Lâm kiểm một PDF 1 người ký và một PDF 4 người ký: sáu đề xuất có nguồn hoặc null rõ ràng; đọc → trích xuất → đối chiếu → xác nhận; đổi tệp phải kiểm lại version/hash.
3. Cả hai chạy `pnpm check`, `pnpm integration:check`; smoke API/workflow/PDF trên fixture file riêng. Kiểm thêm thiếu required event, dispute, quorum, quá hạn/trần phạt, duplicate, ELSE và provider lỗi.
4. Chỉ công bố KPI đo được; giữ AI optional để demo Bronze không phụ thuộc mạng/provider. Không sửa ground truth public, không đóng dấu baseline là đáp án 405/405.

Các module riêng chưa tồn tại nên chưa thể xác nhận chúng tương thích. Mức sẵn sàng hiện tại là có điểm nối đang chạy, dữ liệu mẫu thật, gate tự động, test âm tính và trách nhiệm review rõ ràng; khi có mã module thì chạy đúng quy trình trên trước khi phát hành.

## 6. Bằng chứng kiểm tra bản bàn giao

- `pnpm check` đạt: typecheck, lint không warning, format, build; 167 test (78 Python + 89 Node), gồm first-match/ELSE, bỏ labels/đổi ID, payload lỗi, trace/tiền/confidence, không fallback HTTP, preview luật và rollback.
- `pnpm integration:check` đạt 405 mốc, 20/20 mẫu công khai về decision/reason/payable/penalty, không khác baseline. Candidate JSON đủ chuẩn được nhận; candidate mất một mốc bị từ chối với mã thoát 1. Công cụ chặn đường dẫn input trùng tệp output để không ghi đè candidate rồi tự báo đạt.
- HTTP smoke đạt: quyền, CRUD, template, rule preview, workflow, dataset và output. Smoke tài liệu thật đạt PDF/DOCX 1–4 người ký, lần lượt 4/4/5/5 trang; extractor local trả sáu trường có nguồn.
- Kiểm worker HTTP thật: API xác thực nhận đủ 405 mốc. Dừng worker → Data Pack trả `503 ENGINE_UNAVAILABLE`, không fallback; trên cùng fixture, phê duyệt workflow vẫn chạy engine local và cho PENALTY đúng luồng. Browser smoke đạt 36 màn/kịch bản.
- Không gọi Google trong đợt kiểm này; chất lượng API/model riêng của Hoàng/Lâm sẽ được đo sau khi có module và dữ liệu đánh giá. Không suy kết quả kiểm chứng thành độ đúng ground truth HIDDEN/HOLDOUT.
