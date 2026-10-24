# Rà soát theo BTC: Đồng trước, Bạc sau, Vàng cuối

Cập nhật 24/10/2026. Đọc cùng [15 — Xác nhận BTC và giả định](15_XAC_NHAN_BTC_VA_GIA_DINH.md). Mục tiêu là xử lý đúng dữ liệu và có minh chứng, không ưu tiên số lượng tính năng hay tự nhận đã thắng/đạt hạng.

## 1. Kết luận có thể kiểm chứng

Engine bản spec **1.1** vẫn cho 405 kết quả theo đúng template 22 cột, giữ sáu trường BTC điền sẵn. Kết quả hiện tại: **348 RELEASE, 15 PENALTY, 36 HOLD, 6 REJECT**; payable **365785.87** và penalty **102.13 triệu VND**. Khớp **20/20 mẫu trên 17 cột so sánh**, không có vi phạm bất biến được kiểm.

Đây là kết quả của engine theo cách hiểu đã ghi trong đặc tả. **Không có ground truth HIDDEN/HOLDOUT**, nên chưa thể kết luận accuracy cho 405 mốc, độ đúng của 250 mốc chấm, hoặc chứng minh toàn bộ engine không có lỗi.

Minh chứng tái tạo:

```bash
python3 tools/kiem_chung_nghiep_vu.py --check
python3 tools/ra_soat_btc.py
python3 apps/engine/cli.py --output artifacts/btc-review
python3 -m unittest discover -s tests -v
pnpm check
```

`artifacts/btc-review/review.json` chứa checks, SHA-256 5 CSV nguồn, thống kê theo loại mốc, độ phủ mẫu, confidence và độ nhạy của giả định. `submission_output.csv`, `audit.json`, `metrics.json` là artifact engine. Đây là tệp sinh lại được, không phải dữ liệu/đáp án BTC mới.

## 2. Phát hiện và cách xử lý

| Mức | Phát hiện | Nguyên do/rủi ro | Xử lý và chứng cứ |
| --- | --- | --- | --- |
| P0 Đồng | Gặp danh sách test ID có thể tự thu hẹp output | Có thể chỉ xuất 250 dòng hoặc một tập con, trái chỉ dẫn xuất toàn template | Mặc định `FULL_TEMPLATE`; `--apply-scope` chỉ opt-in chẩn đoán. Test cùng thư mục có test IDs vẫn xuất 405 dòng |
| P0 Đồng | File template thiếu/lặp/sai metadata hoặc input trùng ID có thể bị chấp nhận/ghi đè âm thầm | Dictionary theo ID có thể mất dòng; CSV đầu ra thiếu/nhân mốc hoặc sai sáu trường chuẩn | Reject empty/duplicate/incomplete template, metadata mismatch và duplicate/empty primary IDs; chuẩn hóa đúng 22 cột |
| P0 Đồng | Ngoại lệ workflow trong `voided_events.csv` có thể tác động pipeline xuất bài | Đây là extension Silver, không thuộc 5 CSV chuẩn BTC | Profile `BTC_SUBMISSION` bỏ qua file này; chỉ `--workflow` mới áp ngoại lệ được kiểm. Test hai profile và rollback |
| P0 Đồng | Trộn giới hạn người resolve do ứng dụng định nghĩa vào việc đọc Data Pack | BTC không yêu cầu resolver RBAC ở Bronze | Bronze xử lý linked RESOLVED; workflow Silver giữ buyer-side policy và audit. 405 kết quả gốc không đổi |
| P0/Bạc | Rule động có thể qua 20 mẫu và bất biến nhưng đổi mốc không có nhãn | Public chỉ phủ ít scope; đổi RELEASE thành HOLD ở scope chưa có sample vẫn không vi phạm bất biến an toàn | Preview/submit đòi **0 đổi decision/reason/payable/penalty trên 405** so baseline, đủ số mốc, mẫu và bất biến đều qua. Test sửa scope SIGNING vẫn 20/20 nhưng bị chặn |
| P1 Bạc | Giao dịch live có thể ghi trạng thái dù engine báo vi phạm bất biến | Có diagnostic không đồng nghĩa được phép ghi nghiệp vụ/chi | Workflow write rollback trước applyRun và audit success; profile bài nộp không xuất artifact khi vi phạm |
| P1 Giao diện | Form tự điền mặc định làm khó phân biệt dữ liệu thật/demo | Người dùng có thể lưu mà chưa chủ động chọn/nhập | Form mới trống; một nút điền mẫu toàn bộ form, chỉ điền ô trống, giữ 0/false và lựa chọn đã nhập; không tự gửi. Tách mở lại bản nháp qua `?draft=CODE` |
| P1 Rà soát | Test mới kỳ vọng sai tên lỗi khi supplier đọc draft | Guard thực trả `ACTION_FORBIDDEN` trước BaseService | Sửa test theo guard thực, giữ nguyên chính sách từ chối |

Rule “tương thích baseline toàn pack” bảo vệ hành vi hiện tại, **không chứng minh baseline chính là ground truth ẩn**. Nếu BTC làm rõ một giả định làm đổi baseline, cập nhật spec + engine + test + báo cáo cùng nhau rồi review lại; không khóa một cách hiểu sai chỉ để giữ regression xanh.

CI cũng được chỉnh: cài công cụ LibreOffice/Poppler để test preview không phụ thuộc phần mềm tình cờ có trên runner; chạy báo cáo BTC trong CI. Smoke HTTP dùng đăng nhập có mật khẩu cho tài khoản tài chính, không phụ thuộc demo-login vốn tắt mặc định ở production. Cấu hình CI đã sửa; không nhận là pipeline remote/Docker đã chạy nếu chưa có kết quả từ runner.

## 3. Insight về public/hidden và số liệu

- BTC xác nhận 20 PUBLIC / 250 HIDDEN / 135 HOLDOUT trong cùng 405 mốc. Chỉ 20 mốc có nhãn công khai; **385 mốc còn lại không có nhãn để đối chiếu**.
- Public chỉ phủ **5/13 loại milestone và 5/16 scope rule**. Vì vậy 20/20 chưa đủ để duyệt thay đổi quy tắc hoặc tuyên bố sẵn sàng hidden test. Test đảo thứ tự event, bỏ nhãn và đổi toàn bộ ID kiểm việc engine không tra đáp án theo scenario/ID.
- Sự kiện sau ngày hiện tại/snapshot vẫn phải đọc trong batch toàn pack; cắt lịch sử để chạy như demo hiện thời sẽ làm sai so mẫu. As-of là chế độ phân tích riêng, không dùng thay bài nộp full-history.
- “Event cuối cùng” và “required event hoàn thành cuối” khác nhau dù một số dữ liệu có thể cho cùng số ngày phạt. Test đúng ví dụ BTC, kèm resolve muộn, giúp kiểm ý nghĩa thay vì chỉ khớp số hiện có.
- `invoice_required` và required list mâu thuẫn tại 15 ACTIVATION; không sửa dữ liệu BTC hay tự thêm INVOICE để làm UI trông đầy đủ. Quyết định hiện tại theo required list và ghi A08.
- 15 ca PENALTY chưa chạm cap; kiểm đúng 15 ca không đủ chứng minh biên cap/rounding. Test synthetic đã có biên ân hạn, cap, quorum, duplicate, sai actor và half-cent. A07 vẫn cần nêu là cách chọn của đội.
- Confidence hiện là heuristic 1.00/0.80/0.50, không phải ML accuracy hay xác suất đã calibration. Có thể HOLD với confidence 1.00 vì hệ thống chắc chắn đang có dispute.

## 4. Cổng nghiệm thu theo thứ tự

| Ưu tiên | Đầu ra cần có | Hiện trạng/phần còn lại |
| --- | --- | --- |
| Đồng P0 | Loader đúng schema/ref/ID; 405 dòng × 22 cột; 4 decision; Decimal và phạt; trace/missing/evidence; dashboard đa hợp đồng | Đã có code và artifact kiểm chứng công khai; giữ review các giả định còn mở ở tài liệu 15 |
| Đồng P0 | Chạy độc lập không cần UI, CA, blockchain, Mongo hay nhãn kín; 20 mẫu và bất biến có báo cáo đúng phạm vi | CLI/Python chạy offline; không suy số liệu hidden; cần đội rà bản CSV/PDF cuối trước nộp |
| Đồng P0 | Proposal 5–10 trang, slide tối đa 15 trang; nội dung và file nộp khớp đề | Không coi việc code chạy là đã có đủ hồ sơ. Cần đội chốt bản PDF, kênh nộp, hạn và link minh chứng theo thông báo BTC |
| Bạc P1 | RBAC/scope/SoD, multi-role approval, dispute, dedup, penalty/time-lock, payment simulation, replay | Có workflow/test; quyền mở rộng của đội phải ghi rõ. Không giả làm escrow/chi ngân hàng thật |
| Bạc P1 | Form/dữ liệu/tài liệu có luồng dùng thử rõ; sửa mẫu không sửa hồ sơ đã khóa; không đè dữ liệu bằng demo | Đã triển khai; kiểm trình duyệt và cập nhật ảnh hướng dẫn theo bản cuối |
| Vàng P2 | Hash-chain/verify, witness/outbox, rule version có người thứ hai duyệt, hỗ trợ trích xuất/human review | Là extension; không dùng để bù thiếu P0. Chỉ trình bày chức năng đã chạy và giới hạn thực |
| Vàng/production | CA/PAdES, OCR scan, TSA/OCSP/CRL, blockchain, escrow/ngân hàng, Mongo integration thực | Chưa có bằng chứng tích hợp toàn bộ; adapter/mô phỏng không được gọi là tích hợp thật. Để roadmap nếu chưa có đối tác và test |

## 5. Vì sao vẫn cho rule động

Giữ bộ luật BTC và Data Pack gốc. Rule mới là phiên bản có hash, người soạn và người duyệt khác nhau; hợp đồng giữ phiên bản đã pin. Cho sửa mô tả và thử biểu thức, nhưng **chỉ phát hành khi không đổi baseline toàn 405**, mẫu và bất biến đều đạt. Mẫu mốc điều chỉnh chỉ tác động hồ sơ APP mới, không thay 405 milestone gốc.

Phiên bản ở REVIEW từ trước khi có cổng này không có bằng chứng `BTC_FULL_PACK_V1` sẽ bị chặn phát hành. Published cũ thiếu validation mới không được tự chọn cho hồ sơ mới; cần soạn/kiểm/duyệt lại phiên bản tương thích. Hồ sơ đã pin vẫn giữ lịch sử và hash, không bị sửa ngầm.

Nếu đội cần thử luật làm đổi kết quả chuẩn, giữ ở DRAFT/preview để nghiên cứu. Muốn một profile nghiệp vụ khác hẳn cần bàn lại và phân biệt rõ với bài nộp BTC, không âm thầm bật cho cuộc thi.

## 6. Trước khi chốt nộp

1. Chạy lại các lệnh ở mục 1 từ source cuối; mở CSV kiểm header/order/405 ID duy nhất, đối chiếu hash input.
2. Kiểm 20 mẫu và review ít nhất một trace cho mỗi loại mốc không có sample; đây là self-review, không phải ground truth.
3. Đọc lại các giả định A01/A04/A05/A07/A08/A13/A15 và không nhận là BTC đã xác nhận hết.
4. Chọn artifact **Tải kết quả → submission_output.csv**, không nộp CSV export của bảng đang lọc/trang hiện tại. Không dùng `--apply-scope`, `--workflow` hoặc as-of cho bài nộp mặc định.
5. Đội chốt hồ sơ PDF và hướng dẫn chạy; ghi rõ demo, tích hợp thật, dữ liệu mẫu và phần roadmap. Không cam kết hạng hoặc hidden accuracy.

Đã lập [16 — Bảng đối chiếu raw event cho 8 loại chưa có sample](16_DOI_CHIEU_CAC_LOAI_MOC_CHUA_CO_SAMPLE.md), gồm ID, actor, timestamp, quorum, due/grace và số tiền. Đây là self-review theo baseline, cần đội rà trước khi trích vào hồ sơ; không đổi thành ground truth ẩn.

## 7. Kết quả kiểm tra bản hiện tại

- `pnpm check`: đạt **120 test** (60 Python + 60 foundation), typecheck/lint/format/build đạt.
- Browser smoke: đạt 34 màn/kịch bản desktop/mobile, gồm form mới trống, điền mẫu giữ nội dung đã nhập và không còn khóa dịch thô.
- HTTP smoke: đạt cả khi `DEMO_LOGIN=false`, kiểm rule preview/full pack, quyền, scope, CRUD và workflow. Chưa chạy lại GitHub Actions hay Docker/Mongo thực trong phiên này.
- `tools/ra_soat_btc.py`: 10/10 check đạt, hash 5 CSV khớp manifest BTC, 405 ID theo đúng thứ tự template, khớp 20 mẫu/17 cột.
- Hướng dẫn: 66 ảnh gốc + 66 ảnh khoanh vùng, 0 bước lỗi/thiếu dấu. Gallery chung `playwright-report/guide/index.html`, theo vai trò `playwright-report/guide/roles/index.html`; manifest trong `apps/web/public/guide/images/manifest.json`.
- Bản thử riêng: web 5319 → API 3247, `STORAGE_DRIVER=file`, dữ liệu `/tmp/codecash-compact-release-guide`. Không ghi đè dữ liệu môi trường mặc định.
