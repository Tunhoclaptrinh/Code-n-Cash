# Kế hoạch hoàn thiện CodeCash (bản để review)

Ngày lập: 25/10/2026. Nhánh làm việc: `fix/contract-preview-side-panel`.

> **Trạng thái (26/10/2026).** Đây là kế hoạch tại ngày lập, giữ nguyên để đối chiếu; trạng thái hiện hành nằm trong [đặc tả nghiệp vụ](NGHIEP_VU.md). Những điểm đã khác kế hoạch:
>
> - C1 đã chốt: nút **Khôi phục dữ liệu demo** chỉ có khi bật đăng nhập demo, chỉ quản trị hệ thống dùng được, lưu trữ toàn bộ dữ liệu và chuỗi audit cũ.
> - WS3: các module thực tế là `structure`, `events`, `requirements`, `controls`, `schedule`, `rules`, `amounts`, `confidence`, `trace` (không có `loader`, `output`); phần xuất nằm trong `apps/engine/cli.py`.
> - WS4: confidence có nhiều mức nhưng **chưa hiệu chỉnh** thành xác suất (không có nhãn sai để đo Brier); lý do ở mục 8 của đặc tả.
> - WS5: yêu cầu bị từ chối không đổi dữ liệu nghiệp vụ nhưng có ghi một mục `REQUEST_FAILED` vào audit (mục 9 của đặc tả).

## 0. Mục tiêu, giả định, điểm cần chốt

**Mục tiêu:** hoàn thiện CodeCash như một hệ thống quản lý thực hiện hợp đồng hoàn chỉnh (số hoá điều khoản, ký, nộp chứng từ, phê duyệt, tranh chấp, quyết định thanh toán, audit). Việc chạy trên Data Pack của BTC là PoC chứng minh năng lực của engine, không phải toàn bộ sản phẩm.

**Giả định (cần xác nhận):**

| # | Giả định | Ảnh hưởng nếu sai |
| --- | --- | --- |
| G1 | "Xử lý thêm dữ liệu của bác" là phần đánh giá Data Pack của BTC và tính năng tải bộ dữ liệu lên, định vị là PoC | Thay đổi cách viết phần giải pháp trong báo cáo, slide |
| G2 | "Claude Design trên Canvas" là artifact dạng Slides/Design của claude.ai, xuất PDF | Nếu là Canva thì đổi công cụ ở WS10, WS11 |
| G3 | Tên đội để đặt tên tệp nộp `HSSK_<TenDoi>_D.pdf` sẽ được đội cung cấp | Không đặt được tên tệp đúng quy định |

**Điểm cần chốt:**

| # | Câu hỏi | Đề xuất |
| --- | --- | --- |
| C1 | Nút "đưa dữ liệu về ban đầu": audit log là chuỗi niêm phong, không được xoá/sửa | Chỉ trong chế độ demo, chỉ SYSTEM_ADMIN; bấm thì lưu bản sao toàn bộ dữ liệu và nhật ký hiện tại, rồi bắt đầu phiên demo mới từ dữ liệu gốc |
| C2 | Xoá dữ liệu thử trên prod trước buổi chấm (không hoàn tác) | Dùng chính nút C1 sau khi deploy |
| C3 | Tên tác giả commit | Giữ ndlxiv; GitHub hiện "Unverified" cho tới khi đội thiết lập ký commit |

## 1. Nguyên tắc áp dụng xuyên suốt

1. Bronze đúng và chạy được trước; Silver/Gold chỉ trình bày khi có KPI, test hoặc so sánh làm bằng chứng.
2. Không hard-code theo 20 sample công khai; chạy cho toàn bộ 405 dòng của `submission_output_template.csv`.
3. Khi chưa đủ căn cứ thì HOLD (nhánh ELSE là luật mặc định cuối, không phải event).
4. Không bịa thông tin, không sinh mã hiển thị mới; giao diện chỉ hiện dữ liệu thật (người làm, thời gian, việc làm, ghi chú).
5. Mọi thay đổi code có test; refactor không đổi hành vi (so snapshot đầu ra 405 dòng).

## 2. Các hạng mục công việc

### WS1. Đối chiếu đề bài và câu trả lời BTC

Lập bảng "yêu cầu → hiện trạng → bằng chứng (test/ảnh) → việc cần làm" cho từng mục dưới đây.

| Nguồn | Yêu cầu | Cách kiểm |
| --- | --- | --- |
| Đề, mục 2 | Contract → Milestone → Event → Rule Check → Decision → Audit Log | Sơ đồ WS8, test luồng |
| Đề, mục 2 | Kiểm tra required event, quyền actor, quorum, dispute/rejection, thời hạn | WS5 |
| Đề, mục 4 | Trạng thái hợp đồng và mốc; điều kiện đã/chưa đạt; quyết định; số tiền; lý do, luật, event bằng chứng; audit log và thời gian xử lý | Đối chiếu 22 cột đầu ra và màn hình |
| Đề, mục 5 | Bronze: nhiều hợp đồng, ≥3 loại mốc, tự kiểm tra, không RELEASE khi chưa đủ, 4 quyết định, tính tiền, lưu lịch sử, giao diện | Bảng tick Bronze |
| Đề, mục 6 | 5 nhóm KPI và cách đo, thứ tự ưu tiên luật | WS4 |
| Đề, mục 10 | Xử lý event thiếu/lặp, sai quyền, thiếu approval, dispute, rejection, chậm tiến độ | WS5 |
| BTC trả lời 1 | Ngày hoàn thành = thời điểm muộn nhất của required event hợp lệ; APPROVAL, DISPUTE_RESOLVED không đẩy ngày; `days_late = completion − (due + grace)` chỉ khi > 0 | Test có sẵn `tests/test_btc_clarifications.py` + bổ sung ca biên |
| BTC trả lời 2 | Dispute: OPENED → HOLD; RESOLVED tham chiếu đúng dispute; stakeholder bổ sung phải có role, quyền OPEN/RESOLVE, audit, không mâu thuẫn Data Pack | WS5; mô tả trong file nghiệp vụ |
| BTC trả lời 3 | `confidence_score` trong [0, 1], không thay quyết định; đội tự mô tả cách tính | WS4 |
| BTC trả lời 4 | Hidden 250 + holdout 135 nằm trong 405 mốc; pipeline tổng quát | Kiểm 405 dòng, không phụ thuộc mẫu |
| BTC (ELSE) | ELSE là nhánh mặc định → HOLD; sample không cần có ca ELSE | Test ca không khớp luật nào |
| BTC (trình bày) | Slide ≤ 15 trang, trình bày ≤ 5 phút: Bài toán → Giải pháp → Logic xử lý → KPI → Demo/Mockup → Kế hoạch MVP | WS10 |

**Đầu ra:** bảng đối chiếu trong file nghiệp vụ (WS2), danh sách việc còn thiếu.

### WS2. Một file nghiệp vụ duy nhất, lưu trữ tài liệu cũ

- Tạo `docs/NGHIEP_VU.md`, ngắn gọn nhưng đủ (mục tiêu 10–12 trang A4).
- Chuyển `docs/01…33`, `note.md`, `templates/` cũ không còn dùng vào `docs/archive/`; giữ `docs/README.md` chỉ trỏ tới file nghiệp vụ, hướng dẫn triển khai và archive.
- Cập nhật `CLAUDE.md` (gốc và `apps/web`) để "nguồn chuẩn" trỏ sang `docs/NGHIEP_VU.md`; sửa mọi liên kết nội bộ.

Mục lục `docs/NGHIEP_VU.md`:

| # | Mục | Nội dung chính |
| --- | --- | --- |
| 1 | Phạm vi và nguyên tắc | Bronze/Silver/Gold đã làm, an toàn thanh toán, HOLD khi chưa chắc |
| 2 | Vai trò và quyền | Bảng vai trò × thao tác (ai mở/đóng tranh chấp, ai duyệt, ai chuyển chi, SoD) |
| 3 | Dữ liệu | 5 bảng Data Pack, quan hệ, phần bổ sung của đội (người dùng, trình tự ký) có đánh dấu |
| 4 | Vòng đời | Máy trạng thái hợp đồng và mốc |
| 5 | Xử lý event | Thẩm quyền, trùng lặp, trạng thái, vô hiệu (BR-19) |
| 6 | Luật quyết định | Thứ tự first-match, bảng luật theo mã lý do, ELSE |
| 7 | Tính tiền | Ngày hoàn thành, số ngày trễ, phạt, trần, làm tròn Decimal |
| 8 | Confidence | Công thức, thang [0,1], không ảnh hưởng quyết định |
| 9 | Đầu ra | 22 cột, audit trace, thời gian xử lý |
| 10 | KPI và cách đo | Định nghĩa, tập đánh giá, kết quả |
| 11 | Ký số và tài liệu | Tệp gốc (thật/mô phỏng), ràng buộc digest, phạm vi demo |
| 12 | Bảng đối chiếu đề bài và BTC | Từ WS1 |

### WS3. Breakdown engine

Tách evaluator (`tools/kiem_chung_nghiep_vu.py`, 776 dòng) thành package `apps/engine/codecash_engine/`, mỗi bước một module có đầu vào, đầu ra và test riêng. `tools/kiem_chung_nghiep_vu.py` giữ lại làm lệnh kiểm tra đặc tả, gọi vào package.

| Bước | Module | Đầu vào | Đầu ra | Luật/căn cứ |
| --- | --- | --- | --- | --- |
| 1. Nạp và kiểm dữ liệu | `loader` | 5 CSV, schema | Bảng đã kiểm, lỗi dữ liệu | Data dictionary |
| 2. Chuẩn hoá event | `events` | Event của mốc, parties | Event hợp lệ / sai quyền / trùng / sai trạng thái / vô hiệu | Thẩm quyền, trùng lặp, BR-19 |
| 3. Khớp chứng từ bắt buộc | `requirements` | Event hợp lệ, required_event_types | Đủ/thiếu từng loại | `condition_logic` |
| 4. Tranh chấp, từ chối, phê duyệt | `controls` | Event hợp lệ | Dispute mở, rejection hợp lệ, số vai trò duyệt | Quorum, tham chiếu dispute |
| 5. Ngày hoàn thành và trễ hạn | `schedule` | Required event hợp lệ, due, grace | Ngày hoàn thành, số ngày trễ | BTC trả lời 1 |
| 6. Chọn luật | `rules` | Kết quả 2–5, payment_rules | Luật khớp đầu tiên, quyết định, mã lý do (ELSE → HOLD) | First-match theo priority |
| 7. Tính tiền | `amounts` | Luật, giá trị mốc, trễ hạn | Payable, penalty (Decimal) | Công thức luật, trần phạt |
| 8. Confidence | `confidence` | Tín hiệu bước 2–6 | Điểm [0,1] | WS4 |
| 9. Truy vết và xuất | `trace`, `output` | Toàn bộ | 22 cột, audit trace, thời gian | Template nộp |

**Nghiệm thu:** đầu ra 405 dòng trước và sau tách giống hệt (trừ thời gian chạy); mỗi module có test đơn vị.

### WS4. Đánh giá lại Macro F1 và confidence

**Hiện trạng đo ngày 25/10:**
- Macro F1 = 1,0000, đo trên 20 mốc mẫu (RELEASE 8, HOLD 8, PENALTY 2, REJECT 2).
- Thanh toán sai 0/12, giữ nhầm 0/8.
- Trên 405 mốc: RELEASE 348, HOLD 36, PENALTY 15, REJECT 6.
- Confidence chỉ có 2 giá trị: 1,00 (359 mốc) và 0,80 (46 mốc).

**Vấn đề:**
- 20 mẫu quá ít để kết luận; 20/20 đúng thì khoảng tin cậy Wilson 95% của độ chính xác là khoảng 83,9–100%.
- Logic được phát triển khi đã nhìn 20 mẫu này, nên điểm trên chính 20 mẫu không chứng minh khả năng tổng quát.
- Confidence không phân biệt mức chắc chắn.

**Quy trình đánh giá mới** (engine là bộ luật, không huấn luyện, nên "train/test" là tách tập phát triển và tập kiểm tra):

| Bước | Nội dung |
| --- | --- |
| 1 | Đóng băng logic hiện tại; ghi lại kết quả làm mốc so sánh |
| 2 | Chia 20 mẫu công khai theo nhóm tình huống: 10 phát triển, 10 kiểm tra (chỉ chạy ở bước cuối) |
| 3 | Dựng bộ ca tổng hợp có đáp án biết trước bằng cách biến đổi có kiểm soát các mốc thật: bỏ một chứng từ bắt buộc, thêm/đóng tranh chấp, trễ bằng ân hạn và hơn 1 ngày, event sai quyền kèm bản đúng, bản trùng, thiếu hạn, thiếu phê duyệt, từ chối; mỗi nhóm có đủ ca lớp hiếm. Bộ sinh viết độc lập với engine, đáp án suy từ đề bài và câu trả lời BTC |
| 4 | Chia bộ tổng hợp thành tập phát triển và tập kiểm tra theo hợp đồng (không để biến thể của cùng một mốc nằm ở cả hai tập) |
| 5 | Báo cáo trên tập kiểm tra: độ chính xác quyết định, Macro F1, F1 từng lớp, ma trận nhầm lẫn, Unauthorized Payment Rate, độ chính xác số tiền, khoảng tin cậy (Wilson, bootstrap) |
| 6 | Thiết kế lại confidence: kết hợp mức đầy đủ chứng từ, tín hiệu mâu thuẫn (trùng, sai quyền, vô hiệu), biên quorum, chất lượng dữ liệu (thiếu hạn), nhánh ELSE; hiệu chỉnh trên tập phát triển, đo Brier và độ hiệu chỉnh trên tập kiểm tra; quyết định không phụ thuộc confidence |
| 7 | Hiện KPI trên màn "Kết quả Data Pack" và trong báo cáo, ghi rõ tập nào, cỡ mẫu bao nhiêu |

**Nghiệm thu:** không còn chỉ số trình bày mà không kèm cỡ mẫu và tập đo; confidence có phân bố nhiều mức và được hiệu chỉnh; mọi lỗi phát hiện được sửa trong engine và có test.

### WS5. Test bảo đảm logic nghiệp vụ

| Lớp test | Nội dung | Trạng thái |
| --- | --- | --- |
| Ma trận thao tác | 17 thao tác ghi × vai trò (kể cả tổ chức khác, vai trò nội bộ) × trạng thái (mở, giữ, từ chối, đã chi, đã đóng) × lặp lại/sai thứ tự × giả mạo tổ chức/vai trò | Đang dựng (`tests/foundation/business-rules.test.mjs`); lỗi tìm ra được ghi lại và báo trước khi sửa |
| Bất biến engine | Ngày hoàn thành, trễ hạn, trần phạt, payable ≥ 0, dispute mở → HOLD, ELSE → HOLD, confidence ∈ [0,1], đủ 405 dòng mỗi dòng một lần | Cùng file trên |
| Ca biên BTC | Theo WS1 | Bổ sung |
| Snapshot đầu ra | 405 dòng của bản chuẩn | Dùng cho WS3, WS6 |
| Audit | Mỗi thao tác thành công thêm đúng một mục vào chuỗi; thao tác bị từ chối không ghi gì | Cùng file ma trận |

### WS6. Refactor toàn repo

| Việc | Chi tiết |
| --- | --- |
| Engine | Theo WS3 |
| API | Tách `apps/api/src/domain/views.ts` (1.151 dòng) theo màn/khối; gom kiểu trùng giữa `apps/api/src/domain/types.ts` và `packages/contracts/src/workflow.ts` (mỗi file 1.011 dòng) về một nguồn |
| Web | Tách các trang trên 1.000 dòng (`SignaturePositionsPage`, `MilestoneDecisionPage`, `ContractUploadForm`) thành component con; xoá khoá chuỗi không còn dùng sau đợt giản lược; xoá CSS chết |
| Script | Gom `scripts/` còn dùng; bỏ script trùng chức năng |
| Test | Xếp `tests/` thành unit, integration, e2e; giữ nguyên test đặc tả |
| Tài liệu trong code | README gốc ngắn, trỏ `docs/NGHIEP_VU.md` |
| Ràng buộc | Không đổi hành vi: snapshot 405 dòng giống hệt; `pnpm typecheck`, `lint`, `build`, `test`, `test:browser` đạt sau mỗi bước |

### WS7. UI/UX cho demo và người dùng

| Việc | Mô tả | Trạng thái |
| --- | --- | --- |
| Văn bản hợp đồng cạnh thao tác, chữ ký và dấu demo | Có trên nhánh | Xong |
| Giản lược màn hình theo nguyên tắc UX | Có trên nhánh | Xong |
| Ký một chạm | Có trên nhánh | Xong |
| Lịch sử kiểu backoffice, không hiện mã tự sinh | Có trên nhánh | Xong |
| Chặn mở tranh chấp khi đang có tranh chấp | Có trên nhánh | Xong |
| Nút khôi phục dữ liệu demo | Theo C1 | Chờ chốt |
| Kịch bản demo 5 phút | Thanh hướng dẫn từng bước kèm chuyển vai trò nhanh: tải lên → ký → nộp chứng từ → phê duyệt → quyết định và tiền; nhánh tranh chấp, phạt | Chưa làm |
| Dashboard tổng quan | KPI chính, phân bố quyết định, việc đang chờ theo vai trò | Chưa làm |
| Tìm tài khoản theo hợp đồng | Menu tài khoản demo tìm được theo mã hợp đồng, có nhóm "đang có việc chờ" (góp ý CT0105) | Chưa làm |
| Ảnh hướng dẫn | Chụp lại theo giao diện mới | Chưa làm |
| Kiểm tra trực quan | 1440 px và 390 px, sáng/tối, mỗi màn | Mỗi lần giao |

### WS8. Bức tranh tổng thể (big picture full flow)

| Sơ đồ | Dùng ở |
| --- | --- |
| Kiến trúc hệ thống: Web, API (quyền, workflow, audit), Engine Python, lưu trữ, tài liệu | File nghiệp vụ, báo cáo, slide |
| Luồng đầy đủ Contract → Milestone → Events → Validate → Rule → Decision → Amount → Audit, kèm vai trò từng bước | Báo cáo, slide |
| Pipeline engine 9 bước (WS3) | Báo cáo, slide (trọng tâm) |
| Luồng chọn luật first-match và nhánh ELSE | Báo cáo, slide |
| Máy trạng thái mốc và hợp đồng | File nghiệp vụ, báo cáo |
| Ví dụ truy vết một quyết định: event → luật → quyết định → tiền | Báo cáo, phụ lục |

### WS9. Báo cáo (5–10 trang PDF)

Dàn ý theo mục 8 của đề và trọng số chấm:

| Mục | Trọng tâm | Tiêu chí chấm liên quan |
| --- | --- | --- |
| 1. Bối cảnh, vấn đề, insight | Rủi ro thanh toán sai, chậm xử lý, thiếu truy vết | Phù hợp vấn đề (25) |
| 2. Giải pháp tổng thể | Hệ thống hoàn chỉnh; Data Pack là PoC | Phù hợp vấn đề (25) |
| 3. Kiến trúc và luồng | Sơ đồ WS8 | Thiết kế kỹ thuật (30) |
| 4. Dữ liệu | Data Pack, phần bổ sung có đánh dấu | Thiết kế kỹ thuật (30) |
| 5. Core engine | 9 bước, luật first-match, ELSE, tính tiền, confidence | Thiết kế kỹ thuật (30) |
| 6. KPI và kết quả | Cách đo, tập đo, cỡ mẫu, kết quả WS4 | Thiết kế kỹ thuật (30) |
| 7. Đầu ra và tuân thủ | 22 cột, audit, phân quyền, riêng tư, giới hạn ký demo | Đầu ra và tuân thủ (20) |
| 8. Kế hoạch MVP 2–3 tuần | Phân công, mốc, phương án demo | Kế hoạch MVP (15) |
| 9. Rủi ro và kiểm soát | Thanh toán sai, dữ liệu xấu, lạm quyền, cách giảm | Đầu ra và tuân thủ (20) |
| Phụ lục | Bảng luật, audit trace mẫu, ma trận nhầm lẫn, ảnh màn hình | |

Tên tệp: `HSSK_<TenDoi>_D.pdf`.

### WS10. Slide (≤ 15 trang, ≤ 5 phút)

| # | Slide | Thời lượng |
| --- | --- | --- |
| 1 | Tên giải pháp, đội | 10 s |
| 2 | Bài toán | 20 s |
| 3 | Insight | 15 s |
| 4 | Giải pháp tổng thể | 25 s |
| 5 | Kiến trúc và luồng đầy đủ | 25 s |
| 6 | Core engine: pipeline 9 bước | 30 s |
| 7 | Luật first-match, ELSE, tính tiền | 30 s |
| 8 | Xử lý event thiếu, trùng, sai quyền, dispute, rejection | 20 s |
| 9 | Truy vết một quyết định | 20 s |
| 10 | KPI: cách đo và kết quả | 30 s |
| 11 | Demo/Mockup: màn quyết định có văn bản hợp đồng | 25 s |
| 12 | Phân quyền, audit, an toàn thanh toán | 15 s |
| 13 | Kế hoạch MVP 2–3 tuần | 20 s |
| 14 | Rủi ro và kiểm soát | 15 s |
| 15 | Kết | 10 s |

### WS11. Quy chuẩn trình bày báo cáo và slide

| Quy tắc | Cách kiểm |
| --- | --- |
| Một template chuyên nghiệp, bảng màu riêng, không dùng bảng màu mặc định của công cụ | Duyệt bảng màu trước khi làm nội dung |
| Không header, không footer | Kiểm từng trang PDF |
| Không dùng dấu gạch dài (em dash), không ký tự trang trí thừa | Tìm ký tự "—" trong nội dung xuất |
| Văn phong trang trọng, thuật ngữ nhất quán với file nghiệp vụ | Đọc soát |
| Mọi số liệu lấy từ kết quả chạy thật, ghi tập đo và cỡ mẫu | Đối chiếu với WS4 |
| Sơ đồ rõ ở cỡ in A4 và cỡ trình chiếu | Xem ở 100% |
| Slide ≤ 15 trang; báo cáo 5–10 trang; PDF; đúng tên tệp | Kiểm trước khi nộp |

### WS12. Phát hành

| Bước | Nội dung |
| --- | --- |
| 1 | Chạy đủ `typecheck`, `lint`, `format:check`, `build`, `test`, `test:browser` |
| 2 | Push nhánh, mở PR, merge vào `main` |
| 3 | Kiểm tra prod đã nhận bản mới (bundle), tệp gốc mô phỏng đã dựng xong |
| 4 | Khôi phục dữ liệu demo trên prod (theo C1, C2) |
| 5 | Tập trình bày theo kịch bản 5 phút, kiểm thời lượng |

## 3. Thứ tự thực hiện

| Đợt | Hạng mục | Phụ thuộc |
| --- | --- | --- |
| 1 | WS1, WS5 (ma trận test, đang chạy) | Không |
| 2 | WS4 (đánh giá, confidence) | WS1 |
| 3 | WS3 + WS6 (tách engine, refactor) | WS5 snapshot |
| 4 | WS2 (file nghiệp vụ, archive) | WS1, WS3, WS4 |
| 5 | WS7 (UI/UX còn lại) | C1 |
| 6 | WS8 (sơ đồ) | WS3 |
| 7 | WS9, WS10, WS11 (báo cáo, slide) | WS2, WS4, WS8 |
| 8 | WS12 (phát hành) | Tất cả |

## 4. Phân công

| Phần | Người thực hiện |
| --- | --- |
| Thiết kế, quyết định nghiệp vụ, file nghiệp vụ, sơ đồ, báo cáo, slide, gộp và nghiệm thu | Claude (Opus) |
| Việc tách bạch: test ma trận, bộ sinh ca tổng hợp, tách module engine, tách file web/API, dọn chuỗi/CSS, chuyển tài liệu vào archive, chụp ảnh hướng dẫn | Claude (Sonnet), mỗi việc một nhánh riêng, gộp sau khi kiểm |

## 5. Rủi ro

| Rủi ro | Cách giảm |
| --- | --- |
| Refactor làm đổi kết quả quyết định | Snapshot 405 dòng bắt buộc giống hệt; test đặc tả giữ nguyên |
| Bộ ca tổng hợp phản ánh cách hiểu của chính đội | Đáp án suy từ đề và câu trả lời BTC; trình bày rõ giới hạn trong báo cáo |
| Chỉ số trên tập nhỏ bị hiểu sai | Luôn kèm cỡ mẫu và khoảng tin cậy |
| Dữ liệu thử trên prod gây nhiễu khi chấm | Khôi phục dữ liệu demo trước buổi chấm |
| Thời lượng trình bày vượt 5 phút | Bám bảng thời lượng WS10, tập trước |

## 6. Nghiệm thu cuối

- [ ] Bảng đối chiếu WS1 không còn mục "thiếu" thuộc Bronze.
- [ ] Ma trận test nghiệp vụ đạt, không còn mục lỗi chưa xử lý.
- [ ] KPI trình bày kèm tập đo, cỡ mẫu, khoảng tin cậy; confidence nhiều mức, đã hiệu chỉnh.
- [ ] Engine tách module, snapshot 405 dòng giống bản chuẩn.
- [ ] `docs/NGHIEP_VU.md` là tài liệu nghiệp vụ duy nhất; tài liệu cũ trong `docs/archive/`.
- [ ] Demo 5 phút chạy trơn trên prod với dữ liệu sạch.
- [ ] Báo cáo 5–10 trang, slide ≤ 15 trang, đúng quy chuẩn WS11, tên tệp đúng quy định.
