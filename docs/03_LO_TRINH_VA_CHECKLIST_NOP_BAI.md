# Phương án tổng thể — đội 6 người, thực hiện trong 7 ngày

**Case 4: Smart Contract Workflow · Vòng sơ khảo Blueprint**

## 1. Mục tiêu chung

Hoàn thành bộ hồ sơ nộp bài rõ ràng, đúng đề; có bản demo tối thiểu để chứng minh hệ thống đọc dữ liệu, kiểm tra điều kiện hợp đồng, đưa ra quyết định và giải thích được kết quả.

**Hướng ưu tiên:** nghiệp vụ đúng → engine chạy được → giao diện và minh chứng → hồ sơ hoàn chỉnh → nâng cấp nếu còn thời gian. Không chia thành sáu hướng nghiên cứu độc lập rồi mới ghép vào cuối tuần.

Nguồn đối chiếu: [PDF đề thi](../BangD-Case4/DeThi2026_BangD_SmartContractWorkflow.pdf) và [README Data Pack](../BangD-Case4/DataPack-CASE4_SmartContractWorkflow/README.md).

## 2. Review note và phạm vi cần thống nhất

Các hướng trong note đều cần thiết, nhưng nên gom thành năm nhóm có đầu ra cụ thể:

| Nhóm việc | Cần hoàn thành | Giới hạn trong 7 ngày |
| --- | --- | --- |
| **Tổ chức làm việc** | Workspace chung, phân vai, bảng công việc, nơi lưu tài liệu và người tổng hợp | Dùng công cụ đội đã quen; mỗi đầu việc có một người chính, hạn và người kiểm tra |
| **Nghiệp vụ và dữ liệu** | Hiểu Data Pack, thuật ngữ, quy trình hợp đồng, điều kiện thanh toán, vai trò và ngoại lệ | Thống nhất một bộ mô tả chung, bàn giao sớm cho kỹ thuật; không chỉ thu thập tài liệu |
| **Giải pháp và demo** | Rule engine, tính tiền/phạt, trạng thái, audit log, dashboard tối thiểu | Ưu tiên đúng dữ liệu và giải thích được; không cần blockchain hoàn chỉnh |
| **Kiểm chứng và an toàn** | Kiểm thử mẫu, sai quyền, thiếu phê duyệt, duplicate, dispute, rejection, trễ hạn | Phải làm cùng engine, không để đến ngày cuối |
| **Hồ sơ và trình bày** | Proposal, slide, sơ đồ, minh chứng, demo script và checklist nộp | Viết sườn từ ngày đầu, cập nhật kết quả thật trong quá trình làm |

### Phần bắt buộc ưu tiên

- Engine xử lý dữ liệu BTC và sinh `RELEASE / HOLD / REJECT / PENALTY`, tính payable/penalty, lưu lý do và bằng chứng.
- Xử lý quyền actor, approval quorum, event thiếu/lặp, dispute/rejection và thời hạn. Dù một số mục được xếp Silver trong đề, vẫn cần chúng để xử lý đúng Data Pack.
- Dashboard đơn giản theo dõi hợp đồng/mốc, điều kiện thiếu, quyết định và audit trace.
- CSV đúng template, kiểm thử có kết quả và hồ sơ đúng yêu cầu.

### Phần mở rộng nếu còn thời gian

- Hash chain kèm kiểm tra phát hiện chỉnh sửa audit log.
- Demo ký/verify hợp đồng giả lập bằng khóa thử nghiệm; phân biệt chữ ký với quyền phê duyệt.
- AI hỗ trợ giải thích hoặc trích xuất điều khoản, có người kiểm tra; không quyết định thay engine.

Blockchain/testnet, CA ký số thật, OCR phức tạp và nhiều module AI nên để roadmap. Tìm hiểu pháp lý ở mức xác định phạm vi, vấn đề cần kiểm chứng và nguồn chính thức; không biến demo thành dự án triển khai pháp lý đầy đủ.

## 3. Phân công tổng thể 6 thành viên

Phân vai sau là đề xuất dựa trên chuyên môn đã cung cấp; đội xác nhận người điều phối và công cụ trong buổi khởi động.

| Thành viên | Vai trò đề xuất | Phần việc chính / đầu ra |
| --- | --- | --- |
| **Nguyễn Đức Lâm** — DA/DE/BA/PM | Điều phối, tích hợp và kiểm soát chất lượng | Chốt phạm vi, theo dõi tiến độ/phụ thuộc, phối hợp kiểm thử/KPI, kiểm và đóng gói bài nộp |
| **Nguyễn Minh Hoàng** — DA/DE/BA/PM | Nghiệp vụ và dữ liệu | Phân tích Data Pack, thống nhất thuật ngữ/quy trình/rule, chuẩn hóa dữ liệu, xây use case trường học và kiểm logic kết quả |
| **Nguyễn Tiến Tuấn** — IT | Engine và kỹ thuật lõi | Xây pipeline, kiểm điều kiện, decision/state, tính tiền/phạt, export CSV và audit log; tích hợp với giao diện |
| **Nguyễn Hà Phương** — CNTT & Kinh tế số | Dashboard và trải nghiệm demo | Thiết kế luồng sử dụng, làm giao diện đọc kết quả/trace, chuẩn bị ảnh và video demo |
| **Phạm Mai Anh** — HTTT kinh tế | Phân quyền, kiểm soát nghiệp vụ và kiểm thử | Ma trận vai trò/quyền, test sai quyền và ngoại lệ, rà audit; tìm hiểu ký số/pháp lý và phối hợp demo mở rộng nếu đủ thời gian |
| **Bùi Phương Thúy** — QTKD | Hồ sơ, giá trị giải pháp và trình bày | Tổng hợp bài toán/giá trị, viết proposal, làm slide, phối hợp use case trường học, chuẩn bị pitch và Q&A |

**Điểm phối hợp chính:** Hoàng bàn giao nghiệp vụ/dữ liệu cho Tuấn và Mai Anh; Tuấn bàn giao output/trace cho Hà Phương; cả nhóm cung cấp minh chứng cho Thúy; Lâm theo dõi tích hợp và chốt chất lượng. Hoàng hỗ trợ loader/dữ liệu để tránh dồn toàn bộ phần kỹ thuật vào Tuấn.

## 4. Tiến độ 7 ngày

Lịch D1–D7 neo theo ngày yêu cầu ban đầu: **19–25/10/2026**, giờ Bangkok. Đây là lịch nội bộ dự kiến, chưa phải hạn BTC. Nếu bắt đầu sau D1, điều chỉnh lịch theo thời gian còn lại và hạn chính thức; không tính ngày đã qua là ngày còn khả dụng.

| Ngày | Trọng tâm | Kết quả cần có |
| --- | --- | --- |
| **D1 — Thống nhất** | Đọc đề, chốt phạm vi/phân vai, phân tích dữ liệu, dựng workspace, sườn hồ sơ và giao diện | Cả đội hiểu cùng một bài toán; có người phụ trách, quy trình và đầu ra chung |
| **D2 — Dựng nền** | Chuẩn hóa dữ liệu, xây engine bản đầu, làm giao diện từ dữ liệu mẫu, viết nội dung bài toán/kiến trúc | Có luồng xử lý ban đầu từ CSV đến kết quả và giao diện |
| **D3 — Hoàn thiện lõi** | Hoàn thiện rule, quyền/quorum, dispute, dedup, penalty và audit; kết nối UI | Demo tối thiểu xuyên suốt; so mẫu và ghi lỗi cụ thể |
| **D4 — Kiểm chứng** | Sửa lỗi, kiểm thử độc lập, đo KPI; hoàn thiện proposal/slide bản đầu | Output đúng định dạng, test report và minh chứng để đưa vào hồ sơ |
| **D5 — Hoàn thiện** | Review chéo, chốt demo/hồ sơ, chỉ thêm nâng cấp nhỏ nếu lõi đã ổn | Bộ nộp ứng viên đầy đủ; đóng băng tính năng |
| **D6 — Tổng duyệt** | Tái chạy, thử demo máy khác/offline, rà PDF/trang/tên/dung lượng, luyện Q&A | Gói sẵn nộp, ít nhất hai người kiểm |
| **D7 — Dự phòng và nộp** | Chỉ sửa lỗi bắt buộc, nộp theo kênh BTC, lưu bản cuối và biên nhận | Bài được xác nhận tiếp nhận trước hạn |

**Mốc quyết định:** cuối D3 đánh giá lõi và lỗi an toàn. Nếu chưa ổn, bỏ toàn bộ AI/ký số/blockchain mở rộng, tập trung P0. Hồ sơ và UI bắt đầu từ D1 bằng skeleton/mock, không chờ code hoàn tất.

## 5. Những đầu ra phải quản lý

| Đầu ra | Yêu cầu / lưu ý |
| --- | --- |
| **Proposal PDF** | 5–10 trang: vấn đề, insight, kiến trúc/dữ liệu/rule/state, KPI, output, roadmap MVP và rủi ro |
| **Slide PDF** | Không quá 15 trang; bám bài toán → giải pháp → workflow/rule → KPI/output → kế hoạch/rủi ro → demo |
| **Kết quả hệ thống** | CSV **405 dòng, 22 cột** theo template; giữ sáu trường BTC điền sẵn, không sửa file gốc; kèm audit trace và test/KPI |
| **Bản demo và minh chứng** | Dashboard tối thiểu, sơ đồ, ví dụ quyết định/tiền, hướng dẫn chạy; ảnh/video dự phòng |

PDF đề thi mục 8 quy định hai PDF bắt buộc, phụ lục tùy chọn; Data Pack có yêu cầu định dạng output. Lâm cần xác minh **cách gửi CSV/source/video, hạn, tên file và dung lượng** theo thông báo BTC. Không tự suy tất cả artifact đều phải nộp riêng.

**Lưu ý quan trọng:** proposal vẫn cần **kế hoạch xây MVP 2–3 tuần theo đề**. Lịch 7 ngày ở đây là thời gian chuẩn bị bài; trong roadmap ghi rõ phần bản demo đã làm và phần cần phát triển tiếp.

## 6. Nguyên tắc phối hợp và nghiệm thu

- Một workspace chung, một nơi cập nhật task; mỗi đầu việc có người chính, hạn, đầu ra và người review. Đồng bộ ngắn mỗi ngày; vướng phải báo sớm.
- Kiểm trên 20 mẫu công khai và scenario độc lập; ưu tiên không chi sai khi thiếu điều kiện. **Không tuyên bố “100% chính xác trên 405 mốc” chỉ từ 20 nhãn.**
- Kết quả/ảnh/KPI trong hồ sơ phải cùng phiên bản chạy; không ghi thành tích chưa đo, pilot chưa thực hiện hay tính năng chưa xây.
- Audit log khác bảo đảm bất biến tuyệt đối; ký bằng khóa thử nghiệm khác tích hợp ký số thực tế. Tính năng mở rộng cần có demo kiểm chứng.
- Dữ liệu có sự kiện giả lập ở tương lai: khi so mẫu phải thống nhất chế độ đánh giá, không tự lọc theo ngày máy.
- Nộp sớm khi có thể; giữ demo offline và bản nộp cuối. Upload chưa đồng nghĩa hoàn tất nếu chưa có bước submit/xác nhận tiếp nhận.

## 7. Checklist chốt bài

- [ ] Hiểu đúng đề, có một use case trường học và mô tả luồng nghiệp vụ thống nhất.
- [ ] Engine/dashboard tối thiểu chạy; xử lý đầy đủ ngoại lệ quan trọng, giải thích được quyết định và tiền.
- [ ] CSV đúng template; test/KPI ghi phạm vi và bằng chứng, không nhận đạt hidden test.
- [ ] Proposal 5–10 trang, slide ≤15 trang; roadmap MVP 2–3 tuần và rủi ro đầy đủ.
- [ ] Mọi nội dung kỹ thuật/nghiệp vụ đã được người phụ trách review; tính năng chưa làm ghi là roadmap.
- [ ] Tái chạy và demo dự phòng được; PDF mở tốt trên máy khác, tên/dung lượng/link theo BTC.
- [ ] Có xác nhận bài được tiếp nhận; lưu bản cuối và biên nhận.
