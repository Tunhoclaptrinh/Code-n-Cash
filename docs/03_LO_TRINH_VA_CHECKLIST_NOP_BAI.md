# Phương án tổng thể — đội 6 người, thực hiện trong 7 ngày

**Case 4: Smart Contract Workflow · Vòng sơ khảo Blueprint**  
**Thời gian:** 19/10/2026 – 25/10/2026 (Giờ Bangkok / Hà Nội)  
**Tài liệu tham chiếu:** [Đề thi PDF](../BangD-Case4/DeThi2026_BangD_SmartContractWorkflow.pdf), [Data Pack README](../BangD-Case4/DataPack-CASE4_SmartContractWorkflow/README.md), [Đặc tả v1.0](04_DAC_TA_NGHIEP_VU.md).

---

## 1. Mục tiêu chung và nguyên tắc vận hành

Hoàn thành bộ hồ sơ nộp bài xuất sắc, đúng đề, có chiều sâu thực thi và có bản demo tối thiểu để chứng minh hệ thống đọc dữ liệu, kiểm tra điều kiện hợp đồng, đưa ra quyết định chính xác và giải thích minh bạch được kết quả.

### Nguyên tắc sống còn (North Star):
1. **Nghiệp vụ đúng → Engine chạy được → Giao diện & minh chứng → Hồ sơ hoàn chỉnh → Nâng cấp mở rộng.** Tuyệt đối không chia 6 người thành 6 hướng nghiên cứu rời rạc rồi ghép lại vào ngày cuối.
2. **Ưu tiên Bronze & Silver trước:** Bảo đảm 100% khớp 20 mẫu BTC công khai, tính đúng tiền, phạt và lý do trên 405 mốc trước khi làm tính năng Gold.
3. **Mốc quyết định cuối D3 (Go/No-Go Gate):** Nếu lõi Engine chưa đạt độ ổn định và an toàn, lập tức dừng toàn bộ các nhánh mở rộng (AI/ký số CA/blockchain) để dồn 100% lực lượng cho bài nộp cốt lõi.
4. **Trung thực về dữ liệu và minh chứng:** Kết quả trong Proposal, Slide và CSV phải xuất phát từ cùng một phiên bản mã nguồn; không tuyên bố "100% chính xác trên 405 mốc" chỉ từ 20 mẫu công khai.

---

## 2. Phân vai và ma trận trách nhiệm RACI

Đội hình 6 thành viên được phân bổ dựa trên thế mạnh chuyên môn:

| Thành viên | Chuyên môn | Vai trò dự án | Trọng tâm phụ trách |
| :--- | :--- | :--- | :--- |
| **Nguyễn Đức Lâm** | DA / DE / BA / PM | **Project Lead & Quality Assurance** | Điều phối tiến độ, quản lý phụ thuộc, kiểm toán dữ liệu/KPI, rà soát hồ sơ và đóng gói nộp bài |
| **Nguyễn Minh Hoàng** | DA / DE / BA / PM | **Business Analyst & Data Domain Lead** | Phân tích Data Pack, chuẩn hóa thuật ngữ & 8 rules, xây dựng use case trường học, kiểm định logic nghiệp vụ |
| **Nguyễn Tiến Tuấn** | IT | **Tech Lead & Core Engine Engineer** | Xây dựng Pipeline Engine, logic tính toán tiền/phạt, hash chain audit, API backend và tích hợp hệ thống |
| **Nguyễn Hà Phương** | CNTT & Kinh tế số | **Frontend Lead & Product Designer** | Thiết kế UI/UX Dashboard, trực quan hóa luồng duyệt/mốc/lý do, xây dựng kịch bản demo và video demo |
| **Phạm Mai Anh** | HTTT kinh tế | **Security, Compliance & QA Engineer** | Ma trận phân quyền RBAC, kiểm thử ngoại lệ (BR-19, tranh chấp, lặp event), rà soát pháp lý & quy chế ký số |
| **Bùi Phương Thúy** | QTKD | **Business Value & Proposal Lead** | Tổng hợp đề án, phân tích bài toán/giá trị kinh tế/ROI, chấp bút Proposal PDF (5–10 trang), thiết kế Slide PDF (≤15 trang) |

### Ma trận RACI theo 4 đầu ra bắt buộc của BTC:
*(R = Responsible - Làm chính, A = Accountable - Chịu trách nhiệm chốt, C = Consulted - Tham vấn, I = Informed - Nhận bàn giao)*

| Đầu ra nộp bài | Lâm (Lead/QA) | Hoàng (BA/Data) | Tuấn (Tech/Engine) | Phương (UI/Demo) | Mai Anh (Security/Test) | Thúy (Proposal/Slide) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Proposal PDF (5–10 trang)** | **A** | C | C | C | C | **R** |
| **2. Slide Pitching (≤15 trang)** | **A** | C | C | C (Ảnh/Demo) | C | **R** |
| **3. Output CSV (405 dòng × 22 cột)** | **A** | C | **R** | I | C (Kiểm thử) | I |
| **4. Demo & Video minh chứng** | A | C | C (API/Engine) | **R** | C (Kịch bản ngoại lệ) | C (Kịch bản pitch) |

---

## 3. Lịch trình chi tiết 7 ngày (Day-by-Day WBS)

Mỗi ngày chia làm 3 khung giờ chuẩn:
- **08:30 – 09:00:** Daily Standup (Đánh giá việc hôm qua, cam kết việc hôm nay, tháo gỡ điểm nghẽn).
- **09:00 – 17:30:** Deep Work & Hand-off (Thực thi công việc và bàn giao đầu ra chéo).
- **21:00 – 21:30:** Daily Sync & Checkpoint (Kiểm tra chất lượng đầu ra trong ngày, ký nhận bàn giao).

```
   D1: Thống nhất & Nền tảng (Scope, Data Pack, Architecture, Skeleton)
   D2: Dựng nền Engine & UI (Pipeline lõi, mock dữ liệu, draft Proposal)
   D3: Hoàn thiện Lõi & Ngoại lệ [CỔNG GO/NO-GO CUỐI NGÀY D3]
   D4: Tích hợp Full-stack & Kiểm thử độc lập (Đo lường KPI, ráp UI-API)
   D5: Đóng băng tính năng (Feature Freeze, hoàn thiện Proposal & Slide)
   D6: Tổng duyệt & Diễn tập Demo (Dry Run, kiểm tra định dạng nộp)
   D7: Dự phòng khẩn cấp & Nộp bài trước hạn (Submission Buffer)
```

---

### Ngày 1 (D1 — Thứ Hai 19/10/2026): Thống nhất phạm vi & Khởi tạo nền tảng

* **Mục tiêu:** Cả đội cùng hiểu chung một bài toán; thiết lập workspace làm việc, thống nhất cấu trúc tài liệu, ma trận phân vai và kịch bản lõi.

| Thành viên | Đầu việc chi tiết | Đầu vào (Input) | Đầu ra bàn giao (Deliverable) | Tiêu chí nghiệm thu (DoD) |
| :--- | :--- | :--- | :--- | :--- |
| **Lâm** | Thiết lập Git monorepo, quy ước commit/PR, checklist tài liệu nộp, lịch sync hàng ngày | Đề bài, danh sách đội | Workspace chung, `.gitignore`, bảng Kanban tiến độ | 6 thành viên truy cập được workspace, nắm rõ deadline |
| **Hoàng** | Phân tích toàn bộ Data Pack (100 hợp đồng, 405 mốc, 1134 sự kiện, 66 bên, 8 rules) | Data Pack CSV | Tài liệu Data Dictionary diễn giải tiếng Việt, danh sách 8 rules chuẩn hóa | Phân loại rõ các thực thể, xác định 5 loại mốc có trong sample |
| **Tuấn** | Khởi tạo cấu trúc monorepo (Backend NestJS + Engine Python CLI), scripts kiểm tra dữ liệu | Data Pack CSV | Khung source code, script load 5 bảng CSV vào bộ nhớ | Đọc thành công 100 hợp đồng, 405 mốc không bị lỗi định dạng |
| **Phương** | Nghiên cứu luồng màn hình người dùng (Buyer, Supplier, Approver), vẽ Wireframe | Đề bài, Data Pack | Wireframe Figma/bản vẽ luồng màn hình Contract $\rightarrow$ Milestone $\rightarrow$ Decision | Đầy đủ các luồng: Xem danh sách, Chi tiết mốc, Nộp bằng chứng, Phê duyệt |
| **Mai Anh** | Lập ma trận thẩm quyền (Actor matrix) sơ bộ theo bảng parties và allowed_event_types | `parties.csv`, `payment_rules.csv` | Bảng phân vai: 6 vai trò chính và quyền sinh event tương ứng | Phân định rõ quyền của Buyer, Supplier, Approver |
| **Thúy** | Khởi tạo dàn ý Proposal PDF (9 trang gợi ý) và dàn ý Slide (15 trang) | [PROPOSAL_OUTLINE.md](templates/PROPOSAL_OUTLINE.md) | File sườn Proposal và Slide có cấu trúc mục chuẩn | Có khung sẵn các phần: Vấn đề, Giải pháp, Kiến trúc, KPI, Roadmap |

* **Checkpoint cuối ngày D1:** Tất cả 6 thành viên ký duyệt phạm vi bài toán; không còn tranh cãi về thuật ngữ.

---

### Ngày 2 (D2 — Thứ Ba 20/10/2026): Dựng nền Engine & Giao diện mẫu

* **Mục tiêu:** Có pipeline xử lý dữ liệu chạy được từ đầu đến cuối; có giao diện đọc dữ liệu mẫu; hoàn thiện chương 1-2 của Proposal.

| Thành viên | Đầu việc chi tiết | Đầu vào (Input) | Đầu ra bàn giao (Deliverable) | Tiêu chí nghiệm thu (DoD) |
| :--- | :--- | :--- | :--- | :--- |
| **Lâm** | Giám sát chất lượng dữ liệu, thiết lập bộ test kiểm tra tính toàn vẹn (invariant checks) | Dữ liệu Data Pack | Script kiểm tra bất biến (tổng tiền mốc = giá trị HĐ, ngày mốc hợp lệ) | Phát hiện và ghi nhận các điểm bất thường của Data Pack |
| **Hoàng** | Viết đặc tả nghiệp vụ chi tiết cho 8 rules thanh toán và cơ chế First-match priority | `payment_rules.csv`, 20 sample | Bảng quyết định (Decision Table) giải thích từng điều kiện fact | Định nghĩa rõ điều kiện kích hoạt từng rule từ R1 đến R8 |
| **Tuấn** | Xây dựng lõi Engine Python: trích xuất Facts từ Events và Contracts | Bảng quyết định của Hoàng | Code Engine trích xuất fact (có dispute không, có approval không, ngày hoàn thành) | Trích xuất đúng fact cho 20 mốc mẫu của BTC |
| **Phương** | Dựng giao diện Web (React/AntD): Trang danh sách Hợp đồng và Chi tiết mốc với dữ liệu mẫu | Wireframe D1, data schema | Giao diện chạy local đọc từ JSON mẫu | Hiển thị được bảng 100 hợp đồng và chi tiết mốc thanh toán |
| **Mai Anh** | Xây dựng bộ test case độc lập cho các trường hợp ngoại lệ (trễ hạn, tranh chấp, thiếu duyệt) | Bảng quyết định | Danh sách 20 kịch bản test biên (boundary test cases) | Bao phủ các trường hợp: quá hạn ân hạn, lặp approval, sai quyền |
| **Thúy** | Viết nội dung Proposal: Phần 1 (Tóm tắt điều hành), Phần 2 (Bối cảnh, Vấn đề & Insight) | Phân tích bài toán | Bản thảo 2 trang đầu của Proposal | Nêu bật nỗi đau: thất thoát dòng tiền, chậm giải ngân, thiếu minh bạch |

* **Checkpoint cuối ngày D2:** Engine đọc được dữ liệu, xuất ra bảng fact cơ bản; UI hiển thị được giao diện tĩnh có dữ liệu mẫu.

---

### Ngày 3 (D3 — Thứ Tư 21/10/2026): Hoàn thiện Lõi Engine & Cổng Go/No-Go

* **Mục tiêu:** Engine chạy ra quyết định và tiền; so khớp 100% với 20 mẫu công khai; **ĐÁNH GIÁ CỔNG QUYẾT ĐỊNH GO/NO-GO**.

| Thành viên | Đầu việc chi tiết | Đầu vào (Input) | Đầu ra bàn giao (Deliverable) | Tiêu chí nghiệm thu (DoD) |
| :--- | :--- | :--- | :--- | :--- |
| **Lâm** | Tổ chức buổi kiểm định Go/No-Go cuối ngày; đối chiếu kết quả Engine với 20 sample BTC | Output của Tuấn, 20 sample | Biên bản nghiệm thu Lõi Bronze & Báo cáo tỷ lệ khớp sample | Xác nhận: Khớp 20/20 mẫu công khai $\rightarrow$ Bật đèn xanh |
| **Hoàng** | Xây dựng use case ứng dụng thực tế tại trường học/đơn vị sự nghiệp công lập | Đề bài Case 4 | Tài liệu Use Case: "Quản trị hợp đồng mua sắm thiết bị lab/phòng thí nghiệm" | Có số liệu giả lập, luồng quy trình thực tế để đưa vào Proposal |
| **Tuấn** | Hoàn thiện logic 8 rules: tính tiền `payable_amount`, phạt trễ hạn `penalty_amount`, format lý do | Facts D2, công thức phạt | Engine chạy ra kết quả 405 dòng đầy đủ 22 cột | Khớp 100% 20 sample BTC; chạy hết 405 mốc trong < 1 giây |
| **Phương** | Dựng trang Chi tiết quyết định (`/decision`): hiển thị 8 rules, bảng tính tiền, fact trích xuất | Output Engine của Tuấn | UI trực quan hóa: Rule nào khớp, vì sao phạt, tiền trừ bao nhiêu | Người dùng nhìn vào hiểu ngay tại sao tiền bị giữ hoặc phạt |
| **Mai Anh** | Kiểm thử thuật toán tính phạt: số ngày trễ, áp dụng ân hạn, tỷ lệ phạt/ngày, trần phạt | Công thức BR-06, BR-07 | Bảng đối soát tiền phạt trên toàn bộ 405 mốc | Khớp chuẩn công thức: `MIN(days * rate * planned, cap * planned)` |
| **Thúy** | Viết Proposal: Phần 3 (Kiến trúc giải pháp tổng thể, Luồng dữ liệu và State Machine) | Sơ đồ kiến trúc | Bản thảo trang 3-4 Proposal và 4 slide kiến trúc | Thể hiện rõ kiến trúc module hóa: Ingestion $\rightarrow$ Engine $\rightarrow$ Audit $\rightarrow$ UI |

> [!IMPORTANT]
> ### 🚨 CỔNG QUYẾT ĐỊNH CUỐI NGÀY D3 (GO / NO-GO GATE)
> - **Tiêu chí ĐẠT:** Engine chạy offline, xuất ra đúng 405 dòng x 22 cột, khớp hoàn toàn 20/20 sample công khai, giải thích được lý do và số tiền.
> - **Hành động:**
>   - **NẾU ĐẠT (GO):** Bật chế độ mở rộng Silver & Gold có kiểm soát (Ngoại lệ BR-19, Audit Hash Chain, Demo Ký số, Rule động).
>   - **NẾU CHƯA ĐẠT (NO-GO):** Cắt bỏ 100% các tính năng mở rộng. Toàn đội 6 người tập trung tối đa sửa lỗi tính toán và hoàn thiện tài liệu Bronze.

---

### Ngày 4 (D4 — Thứ Năm 22/10/2026): Tích hợp Full-stack & Kiểm thử độc lập

* **Mục tiêu:** Ráp nối hoàn chỉnh Giao diện với Backend API; chạy kiểm thử toàn diện; đo lường các chỉ số KPI thực tế.

| Thành viên | Đầu việc chi tiết | Đầu vào (Input) | Đầu ra bàn giao (Deliverable) | Tiêu chí nghiệm thu (DoD) |
| :--- | :--- | :--- | :--- | :--- |
| **Lâm** | Đo lường và thu thập số liệu KPI: thời gian xử lý, độ phủ dữ liệu, số lỗi bắt được | Hệ thống chạy thật | Bảng số liệu KPI chính thức (Latency, Accuracy on sample, Coverage) | Có số liệu thật để Thúy điền vào Proposal và Slide |
| **Hoàng** | Rà soát toàn bộ văn bản Đặc tả nghiệp vụ v1.0, đối chiếu từng câu chữ với code thực tế | Code của Tuấn, UI | Bản Đặc tả v1.0 hoàn chỉnh ([04_DAC_TA_NGHIEP_VU.md](04_DAC_TA_NGHIEP_VU.md)) | Không còn độ lệch giữa tài liệu mô tả và logic phần mềm |
| **Tuấn** | Xây dựng API NestJS bọc Engine, tích hợp Audit Hash Chain (SHA-256 chuỗi giao dịch) | Engine Python D3 | API hoàn chỉnh: `/api/v1/engine/evaluate`, `/api/v1/contracts`, `/audit` | Audit log có hash liên kết bất biến; kiểm tra phát hiện sửa đổi |
| **Phương** | Kết nối Web frontend với API thật: Luồng nộp bằng chứng, duyệt thanh toán, xem audit | API của Tuấn | Web chạy mượt mà trên dữ liệu sống (Live data) | Thao tác duyệt/nộp bằng chứng làm thay đổi trạng thái mốc tức thì |
| **Mai Anh** | Thực hiện kiểm thử độc lập: Test phân quyền RBAC, test ngoại lệ BR-19 (hai người duyệt) | Hệ thống tích hợp | Biên bản kiểm thử an toàn & Báo cáo ma trận rủi ro | Xác nhận: Nhà cung cấp không xem được HĐ khác; vi phạm bị chặn |
| **Thúy** | Viết Proposal: Phần 4 (KPI, Bằng chứng kiểm nghiệm) & Phần 5 (Kế hoạch triển khai MVP 2–3 tuần) | KPI của Lâm, Use case | Bản thảo trang 5-7 Proposal và 4 slide nghiệp vụ/KPI | Trình bày lộ trình MVP 2–3 tuần rõ ràng: Tuần 1 Core, Tuần 2 ERP, Tuần 3 Pilot |

* **Checkpoint cuối ngày D4:** Hệ thống hoạt động trơn tru từ Frontend đến Backend; có bảng KPI đo lường thực tế.

---

### Ngày 5 (D5 — Thứ Sáu 23/10/2026): Đóng băng tính năng & Hoàn thiện Hồ sơ

* **Mục tiêu:** **FEATURE FREEZE** (Đóng băng code, không thêm tính năng mới); tập trung 100% vào Proposal, Slide, Video demo và xuất bản file CSV cuối.

| Thành viên | Đầu việc chi tiết | Đầu vào (Input) | Đầu ra bàn giao (Deliverable) | Tiêu chí nghiệm thu (DoD) |
| :--- | :--- | :--- | :--- | :--- |
| **Lâm** | Kiểm tra định dạng kỹ thuật file CSV nộp bài: đúng 405 dòng, 22 cột, tên file, encoding UTF-8 | File CSV xuất từ Engine | File `submission_output.csv` chốt nộp | Giữ nguyên 6 cột BTC điền sẵn, không thừa thiếu dòng nào |
| **Hoàng** | Rà soát nội dung học thuật và tính logic của Proposal và Slide; kiểm tra Use case trường học | Bản thảo của Thúy | Góp ý chi tiết bằng văn bản cho Thúy sửa | Đảm bảo tính thuyết phục cao đối với hội đồng giám khảo |
| **Tuấn** | Tối ưu hóa hiệu năng, đóng gói Dockerfile standalone, chuẩn bị môi trường chạy demo offline | Source code | Image Docker và kịch bản chạy offline trong 1 lệnh | Chạy mượt mà trên máy tính khác không cần kết nối mạng |
| **Phương** | Chụp toàn bộ ảnh giao diện sắc nét; quay video demo hoàn chỉnh (3–5 phút) có thuyết minh | Web hoàn thiện | Bộ ảnh giao diện chuẩn + Video clip demo MP4 độ phân giải cao | Thể hiện trọn vẹn: Đăng nhập vai trò $\rightarrow$ Xem mốc $\rightarrow$ Xử lý tranh chấp $\rightarrow$ Kết quả |
| **Mai Anh** | Kiểm tra lần cuối các yếu tố tuân thủ pháp lý (Luật Giao dịch điện tử, tính hợp lệ chữ ký số) | Proposal, Slide | Bản nhận xét pháp lý: Khẳng định rõ phạm vi mô phỏng vs thực tế | Tránh lỗi hứa quá về pháp lý; phân biệt rõ CA thật và demo |
| **Thúy** | Hoàn thiện bản Draft cuối của Proposal PDF (5–10 trang) và Slide PDF (≤15 trang) | Toàn bộ ảnh, số liệu, bài viết | File PDF Proposal v1.0 và Slide v1.0 | Định dạng chuyên nghiệp, đẹp mắt, đúng quy định số trang của đề |

> [!WARNING]
> ### 🛑 LỆNH ĐÓNG BĂNG TÍNH NĂNG (FEATURE FREEZE) TỪ 17:30 D5
> Nghiêm cấm mọi hành vi thêm tính năng mới hoặc tái cấu trúc mã nguồn. Mọi thay đổi code sau thời điểm này chỉ nhằm sửa lỗi chí mạng (critical bugs). Toàn đội chuyển sang trạng thái thẩm định hồ sơ.

---

### Ngày 6 (D6 — Thứ Bảy 24/10/2026): Tổng duyệt (Dry Run) & Kiểm tra chéo

* **Mục tiêu:** Diễn tập thuyết trình thử; kiểm tra toàn bộ hồ sơ trên thiết bị lạ; chuẩn bị bộ câu hỏi phản biện Q&A.

| Buổi | Hoạt động chính | Người phụ trách | Tiêu chí hoàn thành |
| :--- | :--- | :--- | :--- |
| **Sáng (09:00 – 12:00)** | **Tổng duyệt thuyết trình (Dry Run 1 & 2):** Bùi Phương Thúy trình bày slide trong đúng 7 phút; Hà Phương thao tác demo live song song. Cả đội đóng vai giám khảo phản biện. | Thúy, Phương, Cả đội | Căn chuẩn thời gian 7 phút; demo mượt mà không vấp, chuyển slide ăn khớp lời nói |
| **Chiều (14:00 – 17:00)** | **Kiểm tra chéo hồ sơ (Cross-Check):**<br>- Lâm & Mai Anh: Rà soát từng quy định đề thi, dung lượng file, tên file, font chữ không bị lỗi.<br>- Hoàng & Tuấn: Đối chiếu từng con số trong Slide/Proposal với kết quả chạy từ file CSV.<br>- Thử nghiệm mở file PDF và chạy demo trên 2 máy tính khác nhau (máy trắng chưa cài môi trường). | Toàn đội | Không còn bất kỳ lỗi chính tả, sai số liệu hay lỗi font chữ nào trên máy khác |
| **Tối (20:00 – 22:00)** | **Xây dựng bộ câu hỏi phản biện (Q&A Defense Sheet):** Chuẩn bị sẵn 15 câu hỏi hóc búa nhất của giám khảo (về ngoại lệ, tính toán trễ hạn, pháp lý chữ ký số, khả năng chịu tải, chi phí). | Lâm, Hoàng, Tuấn | Mỗi câu hỏi có sẵn câu trả lời súc tích dưới 1 phút kèm slide tham chiếu |

---

### Ngày 7 (D7 — Chủ Nhật 25/10/2026): Dự phòng khẩn cấp, Đóng gói & Nộp bài

* **Mục tiêu:** Nộp bài thành công trước hạn ít nhất 4 tiếng; lưu trữ bằng chứng tiếp nhận; họp tổng kết đội.

| Mốc giờ | Nội dung thực hiện | Người thực hiện | Bằng chứng hoàn thành |
| :--- | :--- | :--- | :--- |
| **08:30 – 10:00** | Rà soát danh mục tệp nộp bài lần cuối theo đúng quy chế BTC: Proposal PDF, Slide PDF, CSV kết quả, Link Video/Demo. | Lâm, Thúy | Danh mục hồ sơ đóng gói đầy đủ trong thư mục `submission_final/` |
| **10:00 – 11:30** | **TIẾN HÀNH NỘP BÀI CHÍNH THỨC:** Đăng tải bài nộp lên hệ thống tiếp nhận của BTC theo hướng dẫn chính thức. | Lâm (Lead) thực hiện, Cả đội quan sát | Nộp thành công lên cổng tiếp nhận của BTC |
| **11:30 – 12:00** | **Xác nhận tiếp nhận & Lưu trữ:** Chụp ảnh màn hình xác nhận, lưu mã biên nhận nộp bài (submission ID), tải bản nộp về máy để đối chiếu khi cần. | Lâm | Email / Ảnh màn hình xác nhận tiếp nhận của BTC |
| **14:00 – 16:00** | **Họp tổng kết đội (Retrospective):** Đánh giá quá trình 7 ngày, cảm ơn các thành viên và chuẩn bị tâm thế cho vòng thuyết trình. | Cả đội | Tinh thần đội vững vàng, sẵn sàng cho vòng bảo vệ |

---

## 4. Quản lý rủi ro và phương án ứng phó khẩn cấp

| # | Rủi ro tiềm ẩn | Mức độ | Biện pháp phòng ngừa | Kịch bản xử lý khẩn cấp nếu xảy ra | Người quyết định |
| :-: | :--- | :-: | :--- | :--- | :-: |
| **R1** | Kết quả Engine lệch so với 20 mẫu công khai của BTC | **Cao** | Bám sát fact dictionary và thứ tự ưu tiên 8 rules từ ngày D2 | Dừng phát triển mới, debug bằng `tools/kiem_chung_nghiep_vu.py` để tìm rule bị tính sai | **Hoàng + Tuấn** |
| **R2** | Mạng Internet trục trặc hoặc web demo sập khi ban giám khảo chấm | **Cao** | Đóng gói bản chạy offline hoàn chỉnh trong Docker; chuẩn bị video quay sẵn | Sử dụng Video demo chất lượng cao quay sẵn và slide chụp chi tiết từng bước | **Phương** |
| **R3** | Quá tải thời gian, Proposal hoặc Slide có nguy cơ trễ hạn | **Cao** | Bắt đầu viết draft từ D1; chốt cấu trúc mục lục trước khi điền ruột | Thu gọn số trang về mức tối thiểu an toàn (Proposal 5 trang, Slide 10 trang) | **Thúy + Lâm** |
| **R4** | Bất đồng quan điểm về logic nghiệp vụ giữa các thành viên | **Vừa** | Có tài liệu Đặc tả v1.0 làm chuẩn pháp lý duy nhất của cả đội | Nếu đề bài chưa rõ, áp dụng nguyên tắc: **Ưu tiên bảo toàn vốn (an toàn dòng tiền $\rightarrow$ HOLD)** | **Lâm (Lead)** |
| **R5** | File nộp bị lỗi định dạng (thừa dòng, sai encoding, lỗi font PDF) | **Cao** | Kiểm tra chéo trên nhiều hệ điều hành (Windows, Mac, Linux) vào ngày D6 | Dùng script tự động kiểm tra cấu trúc CSV (đủ 22 cột, đúng header) trước khi nộp | **Lâm** |

---

## 5. Bảng checklist chốt bài trước khi bấm nộp (Final Verification Checklist)

- [ ] **Hồ sơ Proposal:** File PDF từ 5 đến 10 trang, không lỗi chính tả, có biểu đồ kiến trúc, có use case trường học, có bảng KPI đo thật, có lộ trình MVP 2–3 tuần.
- [ ] **Slide thuyết trình:** File PDF tối đa 15 trang, thông điệp rõ ràng, có hình ảnh dashboard thật từ hệ thống, font chữ dễ đọc khi chiếu.
- [ ] **Tệp dữ liệu CSV:** File `submission_output.csv` đúng chính xác 405 dòng dữ liệu (cộng 1 dòng header = 406 dòng), đúng 22 cột theo thứ tự mẫu BTC, không sửa 6 cột BTC điền sẵn, định dạng UTF-8.
- [ ] **Kiểm chứng mã nguồn:** Lệnh `python3 tools/kiem_chung_nghiep_vu.py --check` và `pnpm check` chạy qua 100% không báo lỗi.
- [ ] **Demo & Video:** Video demo 3–5 phút xem rõ chữ, có phụ đề/thuyết minh; hệ thống demo cục bộ chạy được offline không cần internet.
- [ ] **Quy cách đặt tên tệp:** Tên file PDF và CSV đúng theo quy ước thông báo của BTC (ví dụ: `HSSK_<TenDoi>_D.pdf`).
- [ ] **Xác nhận tiếp nhận:** Đã nhận được email hoặc thông báo màn hình xác nhận bài nộp thành công từ hệ thống BTC. Lưu biên bản vào kho lưu trữ đội.
