# 09 — Tính năng và vai trò

Tài liệu cho cả đội: người demo, người viết proposal/slide và người phát triển. Nó mô tả app làm gì, mỗi vai trò thấy và làm được gì, các kịch bản demo đã chạy thử, KPI đo được, giới hạn còn lại và đề xuất để tăng điểm. Nguồn chuẩn về luật vẫn là [04 — Đặc tả nghiệp vụ](04_DAC_TA_NGHIEP_VU.md). Cách chạy local xem [README](../README.md), triển khai xem [07](07_HUONG_DAN_TRIEN_KHAI.md).

Mọi con số trong tài liệu đo trên dữ liệu vừa khởi tạo, ngày 23/10/2026. Khi demo vào ngày khác, chỉ số ngày trễ (và tiền phạt) của sự kiện tạo mới trong app thay đổi; số liệu Data Pack không đổi.

## 1. Tóm tắt 30 giây

CodeCash quản lý hợp đồng mua sắm theo mốc thanh toán. Mỗi bên chỉ ghi nhận sự kiện thuộc thẩm quyền của mình: bên mua nghiệm thu, nhà cung cấp giao hàng và xuất hoá đơn, người phê duyệt duyệt chi. Sau mỗi sự kiện, engine Python theo đặc tả v1.0 đánh giá lại và trả một trong bốn quyết định **RELEASE, HOLD, REJECT, PENALTY**, kèm số tiền được trả, tiền phạt, lý do và rule áp dụng.

Không có nút "duyệt chi thủ công". Con người chỉ tác động bằng hai cách: thêm sự kiện đúng thẩm quyền, hoặc hai kiểm soát viên khác nhau cùng duyệt một ngoại lệ BR-19. Toàn bộ 100 hợp đồng, 405 mốc và 1.134 sự kiện của Data Pack được nạp thành dữ liệu sống. Trên 20 mẫu công khai: 20/20 quyết định đúng, chi sai (UPR) 0/10, giữ thừa 0/10, khớp tiền 20/20.

Mọi thao tác ghi vào nhật ký dạng hash chain. Màn **Kiểm tra toàn vẹn** phát hiện nhật ký, chứng từ, dữ liệu gốc của BTC hoặc quyết định bị sửa ngoài ứng dụng. Mỗi mốc có thể **phát lại** từng sự kiện để giải thích vì sao ra quyết định hiện tại.

## 2. Cách hệ thống ra quyết định

### 2.1. Vòng đời một thao tác

```text
Người dùng bấm: nộp chứng từ, phê duyệt, mở/đóng tranh chấp, ký, duyệt ngoại lệ
  → API lấy danh tính, vai trò, tổ chức từ phiên đăng nhập (không tin giá trị trình duyệt gửi)
  → kiểm quyền hệ thống (permissions.json) và thẩm quyền nghiệp vụ (ma trận 4.2: bên nào ghi loại sự kiện nào)
  → ghi sự kiện mới, nguồn APP, đúng cột của events.csv
  → engine Python đánh giá lại toàn bộ dữ liệu: 8 rule theo thứ tự ưu tiên, dừng ở rule đầu tiên khớp
  → lưu kết quả, lịch sử trạng thái (mã lượt chạy, nguyên nhân) và nhật ký trong cùng một giao dịch;
    bản ghi nhật ký được nối vào hash chain, kèm mã băm của sự kiện vừa ghi
  → "Việc cần làm" giao bước tiếp theo cho đúng người; màn hình hiện lý do và điều kiện còn thiếu
```

| Ưu tiên | Khi nào | Quyết định | Mã lý do | Trạng thái mốc |
| --- | --- | --- | --- | --- |
| 10 | Có tranh chấp đang mở | HOLD | `OPEN_DISPUTE` | Tạm giữ |
| 20 | Có từ chối hợp lệ | REJECT | `REJECTION_PRESENT` | Bị từ chối |
| 30 | Có sự kiện bắt buộc do sai bên ghi | HOLD | `UNAUTHORIZED_EVENT` | Tạm giữ |
| 40 | Thiếu sự kiện bắt buộc | HOLD | `MISSING_REQUIRED_EVENT` | Chờ chứng từ |
| 50 | Chưa đủ phê duyệt theo chính sách | HOLD | `APPROVAL_QUORUM_NOT_MET` | Chờ phê duyệt |
| 60 | Đủ điều kiện nhưng hoàn thành sau hạn + ân hạn | PENALTY | `LATE_COMPLETION` | Chi sau khấu trừ |
| 70 | Đủ mọi điều kiện | RELEASE | `ALL_CONDITIONS_MET` | Đủ điều kiện chi |
| 80 | Còn lại | HOLD | `UNRESOLVED_CONDITION` | Tạm giữ |

Tiền phạt: `F = MIN(số ngày trễ × tỷ lệ %/ngày × P, trần % × P)`, làm tròn HALF_UP đến 0,01 triệu; tiền được trả `= P − F`. P là số tiền kế hoạch của mốc.

### 2.2. Nguyên tắc không đổi

- Trình duyệt không tính quyết định. Tiền là chuỗi thập phân, cộng bằng số nguyên (phần trăm triệu), không dùng số thực.
- Mốc bị từ chối và mốc đã chuyển kế toán bị khoá: engine không đổi kết quả của chúng nữa.
- Trước khi bấm, màn hình chạy thử (dry-run) để báo trước kết quả. Ví dụ: "Nếu bạn phê duyệt: PENALTY, trả 737,78, phạt 2,22".
- Mỗi lượt chạy có mã run và dấu SHA-256 của dữ liệu đầu vào. Một thao tác mất khoảng 0,1 giây cho toàn bộ 417–421 mốc (trung vị 96 ms trên 13 lượt, máy dev, gồm cả khởi động Python).
- Đồng hồ nghiệp vụ là giờ Việt Nam (UTC+7). Sự kiện tạo trong app lấy thời điểm bấm.

## 3. Dữ liệu và dấu nguồn gốc

Mọi bảng đều có cột hoặc nhãn **Nguồn**. Rê chuột lên nhãn để xem giải thích.

| Nhãn | Ý nghĩa | Gồm |
| --- | --- | --- |
| **Dữ liệu BTC** (xanh dương, `DATA_PACK`) | Lấy nguyên từ Data Pack | 100 hợp đồng, 35 tổ chức (10 bên mua, 25 NCC), 30 người phê duyệt, 405 mốc, 1.134 sự kiện, 128 rule; 16 mẫu mốc suy từ milestones.csv; 2 tham số (phiên bản đặc tả, ngày chốt dữ liệu) |
| **Dữ liệu bổ sung** (vàng, `SEED`) | Data Pack không có nhưng cần để chạy đủ luồng | 69 tài khoản người dùng; tổ chức nội bộ OPS; thứ tự ký của 104 hợp đồng; 4 hợp đồng demo CT0101–CT0104 với 12 mốc MS0406–MS0417 và 9 sự kiện `SD-EV…` |
| **Tạo trong app** (xanh lá, `APP`) | Sinh ra từ thao tác | Sự kiện `AP-EV…`, mốc của hợp đồng mới, khoản chi `PAY-…`, đề xuất ngoại lệ `EXC-…`, ghi chú |

- Data Pack chỉ có sự kiện `CONTRACT_SIGNED`, không có chữ ký. Thứ tự ký của 100 hợp đồng gốc được dựng lại theo chính sách phê duyệt: NCC ký trước, rồi người phê duyệt tài chính hoặc cấp 2, chủ hợp đồng ký cuối, đúng thời điểm của sự kiện.
- Lần khởi động đầu (bảng hợp đồng trống), API nạp Data Pack cùng dữ liệu bổ sung rồi chạy engine một lượt `IMPORT` (khoảng 150 ms). Bản ghi đầu tiên của nhật ký niêm phong mã SHA-256 của từng bảng dữ liệu BTC lúc nhập. Sau đó dữ liệu sống trong `.data/` (local) hoặc MongoDB (production).
- Muốn về trạng thái ban đầu: dừng API, chuyển thư mục `.data/` đi chỗ khác (đừng xoá khi chưa sao lưu), chạy lại `pnpm dev`.
- Ở **Quản trị hệ thống**, bản ghi Dữ liệu BTC và bản ghi của luồng nghiệp vụ (tổ chức gốc, hồ sơ hợp đồng, mẫu mốc gốc, tham số gốc) chỉ xem và xuất. Sửa, xoá trả lỗi `MANAGED_RECORD`; hồ sơ hợp đồng sửa ở màn **Tải hợp đồng lên**.

## 4. Tài khoản demo

Đăng nhập nhanh bằng menu **Tài khoản demo** ở góc phải trang đăng nhập, hoặc nhập email với mật khẩu `Passw0rd!` (môi trường local; production dùng `SEED_PASSWORD`).

| Email | Người, chức danh | Vai trò | Tổ chức · bên trong Data Pack | Việc lúc đầu |
| --- | --- | --- | --- | --- |
| `owner@novaan.vn` | Nguyễn Văn An, Giám đốc dự án | Chủ hợp đồng | Nova An Business JSC (B010) · A028 | Giải quyết tranh chấp CT0019 mốc 3, CT0014 mốc 2 |
| `finance@novaan.vn` | Lê Quốc Dũng, Kế toán trưởng | Phê duyệt tài chính | B010 · A029 | Phê duyệt chi CT0103 mốc 2 |
| `secondary@novaan.vn` | Phạm Minh Đức, Phó giám đốc | Phê duyệt cấp 2 | B010 · A030 | Chưa có; nhận việc ký CT0102 sau khi NCC ký |
| `legal@novaan.vn` | Trần Thị Mai, Chuyên viên pháp chế hợp đồng | Cán bộ hợp đồng bên mua | B010 · B010 | Nộp nghiệm thu CT0084 mốc 3 (đã trễ), hoàn tất hồ sơ CT0101, nộp nghiệm thu CT0103 mốc 3 và CT0104 mốc 3 |
| `supplier@phuminh.vn` | Vũ Thanh Hà, Đại diện nhà cung cấp | Nhà cung cấp | Phú Minh Technology JSC (S015) | Nộp chứng từ CT0104 mốc 2 (đã trễ), ký CT0102, nộp hoàn tất bảo hành CT0103 mốc 4 |
| `admin@codecash.vn` | Phạm Hoàng Nam | Kiểm soát viên | Tổ kiểm soát CodeCash (OPS) | Xem xét 6 mốc có sự kiện sai thẩm quyền |
| `controller@codecash.vn` | Đỗ Minh Khoa | Kiểm soát viên thứ hai | OPS | Như trên; duyệt đề xuất của người kia |
| `sysadmin@codecash.vn` | Trịnh Hoài Phương | Quản trị hệ thống | OPS | Không có việc nghiệp vụ; quản lý tài khoản, tổ chức, mẫu mốc, tham số |
| `auditor@codecash.vn` | Mai Xuân Lộc | Kiểm toán | OPS | Không có việc; xem mọi thứ, chạy Kiểm tra toàn vẹn |

- Mỗi tổ chức khác trong Data Pack đều có tài khoản riêng: bên mua có `owner@`, `finance@`, `secondary@`, `legal@`, NCC có `supplier@`, tên miền suy từ tên tổ chức. Ví dụ `legal@cuulong.vn` là cán bộ hợp đồng của Cửu Long Business Solutions JSC (B003). Danh sách đầy đủ ở mục **Tất cả tổ chức trong Data Pack** của menu demo, hoặc **Quản trị hệ thống → Người dùng**.
- Phạm vi lúc đầu: bốn tài khoản của Nova An thấy 16 hợp đồng (12 của Data Pack và 4 hợp đồng demo); Phú Minh thấy 6 (không thấy bản nháp CT0101); kiểm soát viên và kiểm toán thấy cả 104; quản trị hệ thống không thấy hợp đồng nào.
- Lần đăng nhập đầu, màn chào yêu cầu chọn ngôn ngữ và giao diện sáng/tối, sau đó các nút Hướng dẫn, Ngôn ngữ, Sáng/tối trên header nhấp nháy kèm gợi ý.

## 5. Bản đồ màn hình

Mọi bảng danh sách có cùng bộ công cụ, hoạt động giống nhau:

- **Phân trang lấy từ server**: mỗi lần đổi trang, cỡ trang (10–100), tìm kiếm, bộ lọc hay sắp xếp là một lần đọc dữ liệu mới; ô "Tổng" là số dòng khớp trên mọi trang.
- **Tìm kiếm** không phân biệt hoa thường và dấu ("thiet bi" ra "thiết bị"), mọi từ gõ vào đều phải có; ô tìm ghi rõ tìm trong cột nào.
- **Bộ lọc** (nút Bộ lọc), **lọc theo cột** (biểu tượng phễu, kính lúp ở tiêu đề cột), **thẻ thống kê** và **tab** là cùng một bộ lọc: chọn ở chỗ này thì chỗ kia hiện theo. Menu lọc luôn liệt kê mọi giá trị có trong phạm vi của bạn, kèm số đếm ở thẻ thống kê.
- **Xuất** CSV hoặc JSON đúng những dòng đang lọc, theo thứ tự đang xem: trang hiện tại, tất cả hoặc N dòng đầu; chỉ các cột đã chọn.
- **Nhập** (chỉ trang Quản trị): tải mẫu, kiểm tra từng dòng, xem trước lỗi, chỉ nhập dòng hợp lệ.
- **Làm mới** đọc lại dữ liệu mà giữ nguyên trang và bộ lọc.

| Menu | Đường dẫn | Dùng để | Ai thấy |
| --- | --- | --- | --- |
| Việc cần làm | `/tasks` | Hộp việc sinh từ lý do của engine. Nhãn: Trễ hạn, có thể bị phạt · Đến lượt bạn · Mốc đang tạm giữ · Đúng hạn; sắp theo độ gấp. Chuông trên header mở cùng danh sách | Vai trò nghiệp vụ (màn đầu tiên) và kiểm soát viên |
| Hợp đồng / Hợp đồng của tôi | `/contracts` | Danh sách theo phạm vi; ô thống kê Đến lượt tôi, Chờ điều kiện, Cần xem xét, Đang ký, Đủ điều kiện; lọc theo cột, tìm, xuất; xem nhanh trong modal phóng được toàn màn | Mọi vai trò trừ quản trị hệ thống |
| Chi tiết hợp đồng | `/contracts/:id` | Dòng thời gian sự kiện và trạng thái, chip điều kiện từng mốc, số phê duyệt đạt/cần, tab Sự kiện, Lịch sử, Ký, Các bên | Theo phạm vi |
| Quyết định của mốc | `/contracts/:id/milestones/:no/decision` | 8 rule với kết quả Khớp/Không khớp/Chưa xét; điều kiện, fact; bảng tính tiền (kế hoạch, hạn, ân hạn, ngày hoàn thành, ngày trễ, tỷ lệ, trần, phạt, được trả); sự kiện đã phân loại; **Diễn biến theo thời gian** (phát lại từng sự kiện); lịch sử trạng thái; khối BR-19; nút Chuyển kế toán | Theo phạm vi |
| Nộp chứng từ | `/submissions/:id/:no` | Một ô cho mỗi loại chứng từ bên mình phải nộp, đính kèm tệp, xem trước kết quả, nộp | NCC, cán bộ hợp đồng |
| Phê duyệt | `/approvals/:id/:no` | Một ô cho mỗi vai trò phê duyệt, xem trước kết quả; Phê duyệt, Từ chối, Yêu cầu bổ sung | Người phê duyệt |
| Tranh chấp | `/contracts/:id/milestones/:no/dispute` | Hồ sơ tranh chấp, mở, đóng (chỉ bên mua), yêu cầu bổ sung, xem trước kết quả sau khi đóng | Các bên của hợp đồng |
| Tải hợp đồng lên | `/contracts/new` → `/sign-positions` → `/digitize` → `/signing` | Năm bước: Tải lên, Vị trí ký, Rà soát điều khoản, Ký số, Có hiệu lực | Chủ hợp đồng, cán bộ hợp đồng; người ký vào ở bước Ký số |
| Kiểm tra chữ ký | `/verify/:id` | Chữ ký từng bên, thời điểm hiệu lực; kiểm một PDF bên ngoài (chỉ nhận ra cấu trúc thì báo "chưa xác minh") | Mọi vai trò trừ quản trị hệ thống |
| Ngoại lệ BR-19 | `/exceptions` | Hàng đợi mốc bị giữ vì sự kiện sai thẩm quyền; đề xuất vô hiệu; người thứ hai duyệt | Kiểm soát viên (màn đầu tiên); kiểm toán chỉ xem |
| Kiểm tra toàn vẹn | `/integrity` | Bốn khối: chuỗi nhật ký, chứng từ ghi trong app, dữ liệu gốc của BTC, đối soát quyết định (chạy lại engine). Có ô so với mã đầu chuỗi đã lưu | Kiểm soát viên, kiểm toán (màn đầu tiên) |
| Nhật ký hoạt động | `/activity-log` (thêm `?contract=CT0103` để lọc) | Sự kiện, đổi trạng thái, thao tác người dùng, có cột nguồn | Mọi vai trò trừ quản trị hệ thống, theo phạm vi |
| Kết quả Data Pack | `/data` | Chạy engine trên Data Pack chính thức hoặc bộ dữ liệu tải lên; khối KPI; trace từng mốc; tải `submission_output.csv`, `audit.json`, `metrics.json` | Bốn vai trò bên mua, kiểm soát viên; kiểm toán chỉ xem |
| Quản trị hệ thống | `/platform/...` | Tổ chức, người dùng (đặt lại mật khẩu, khoá), hồ sơ hợp đồng, mẫu mốc, tham số, tài liệu, nhật ký quản trị, ma trận phân quyền; nhập/xuất theo Base | Quản trị hệ thống (màn đầu tiên); kiểm toán chỉ xem |

## 6. Từng vai trò

Hai lớp quyền khác nhau (đặc tả mục 17): **thẩm quyền nghiệp vụ** lấy từ Data Pack (bên nào được tạo loại sự kiện nào, ai được duyệt theo chính sách) và **quyền hệ thống** do đội thiết kế (ai xem, bấm được gì). Engine kiểm lớp thứ nhất kể cả khi lớp thứ hai cho phép.

### 6.1. Chủ hợp đồng (`CONTRACT_OWNER`)

- **Là ai:** người phê duyệt có vai trò `CONTRACT_OWNER` của bên mua (Nova An: A028). Là người duyệt chính trong cả ba chính sách có người duyệt: Chủ hợp đồng duyệt, Chủ hợp đồng + duyệt cấp 2, Tài chính + chủ hợp đồng.
- **Thấy:** mọi hợp đồng của tổ chức mình, kể cả bản nháp.
- **Việc được giao:** Phê duyệt chi (khi vai trò của mình còn thiếu), Giải quyết tranh chấp, Ký hợp đồng (khi đến lượt).
- **Làm được:** phê duyệt, từ chối, yêu cầu bổ sung; mở và đóng tranh chấp; soạn hồ sơ hợp đồng, đặt vị trí ký, rà soát số hoá, huỷ luồng ký đang chạy; ký; chạy engine và tải bộ dữ liệu ở trang Kết quả Data Pack; tải tài liệu lên.
- **Không làm được:** nộp chứng từ (thuộc cán bộ hợp đồng và NCC), chuyển kế toán, xử lý ngoại lệ BR-19, quản trị người dùng.

### 6.2. Phê duyệt tài chính (`FINANCE_APPROVER`)

- **Là ai:** người phê duyệt vai trò `FINANCE_APPROVER` của bên mua (A029). Bắt buộc với chính sách Tài chính + chủ hợp đồng.
- **Thấy:** hợp đồng của tổ chức, không thấy bản nháp.
- **Việc được giao:** Phê duyệt chi; Ký hợp đồng khi được gán (CT0103 bước 2).
- **Làm được:** phê duyệt, từ chối, yêu cầu bổ sung; **Chuyển kế toán** cho mốc RELEASE hoặc PENALTY (mỗi mốc một lần; mốc chuyển sang "Đã chuyển chi" và bị khoá); chạy engine, tải bộ dữ liệu.
- **Không làm được:** mở, đóng tranh chấp; nộp chứng từ; soạn hợp đồng; duyệt thay vai trò khác.

### 6.3. Phê duyệt cấp 2 (`SECONDARY_APPROVER`)

- **Là ai:** người phê duyệt vai trò `SECONDARY_APPROVER` (A030). Bắt buộc với chính sách Chủ hợp đồng + duyệt cấp 2.
- **Việc được giao:** Phê duyệt chi; Ký hợp đồng khi được gán (CT0102 bước cuối).
- **Làm được:** phê duyệt, từ chối, yêu cầu bổ sung; xem kết quả Data Pack.
- **Không làm được:** chuyển kế toán, chạy engine, mở hoặc đóng tranh chấp, soạn hợp đồng.

### 6.4. Cán bộ hợp đồng bên mua (`LEGAL_REVIEWER`)

- **Là ai:** người đại diện tổ chức bên mua (party B010), ghi các sự kiện nghiệp vụ của bên mua theo ma trận 4.2: Xác nhận khởi động, Biên bản duyệt yêu cầu, Biên bản UAT đạt, Biên bản nghiệm thu. Sự kiện "Hợp đồng đã ký" do hệ thống ghi khi chữ ký cuối hoàn tất.
- **Thấy:** mọi hợp đồng của tổ chức mình, kể cả bản nháp.
- **Việc được giao:** Nộp chứng từ của bên mua; Hoàn tất hồ sơ hợp đồng (bản nháp); Nộp lại chứng từ đúng thẩm quyền (khi mốc bị giữ vì bên kia ghi nhầm).
- **Làm được:** tải hợp đồng lên; chọn người ký và thứ tự (tối đa 4 người, phải có cả hai bên, có mẫu nhanh Bên mua ký trước, NCC ký trước, 3 người NCC → Tài chính → Chủ HĐ); đặt vị trí ký; rà soát số hoá và xác nhận hạn mốc mơ hồ; nộp chứng từ; mở, đóng tranh chấp; huỷ luồng ký.
- **Không làm được:** phê duyệt chi (không thấy màn phê duyệt), chuyển kế toán, chạy engine (chỉ xem kết quả).

### 6.5. Nhà cung cấp (`SUPPLIER`)

- **Là ai:** tổ chức NCC (party S015).
- **Thấy:** chỉ hợp đồng mình là NCC, không thấy bản nháp của bên mua. Mở mã hợp đồng của người khác bị từ chối (`CONTRACT_ACCESS_DENIED`).
- **Việc được giao:** Nộp chứng từ của NCC (Biên bản giao hàng, Hoá đơn, Xác nhận go-live, Xác nhận kích hoạt, Xác nhận hoàn thành dịch vụ, Hoàn tất bảo hành); Ký hợp đồng khi đến lượt.
- **Làm được:** nộp chứng từ; mở tranh chấp (ví dụ khi không đồng ý tiền phạt, mốc về Tạm giữ cho đến khi bên mua đóng); ký; kiểm tra chữ ký; xem nhật ký của hợp đồng mình.
- **Không làm được:** đóng tranh chấp, phê duyệt, ghi sự kiện của bên mua (ví dụ tự ghi biên bản nghiệm thu), xem trang Kết quả Data Pack.

### 6.6. Kiểm soát viên (`ADMIN_AUDITOR`)

- **Là ai:** tổ kiểm soát nội bộ (OPS), không là bên của hợp đồng nào. Demo có hai người để minh hoạ duyệt hai người.
- **Thấy:** mọi hợp đồng (104) và mọi nhật ký. Màn đầu tiên là Ngoại lệ BR-19.
- **Việc được giao:** Xem xét ngoại lệ (mốc bị giữ vì `UNAUTHORIZED_EVENT` hoặc rule 80); Duyệt đề xuất ngoại lệ của kiểm soát viên khác.
- **Làm được:** đề xuất vô hiệu một sự kiện sai thẩm quyền kèm lý do (BR-19); duyệt hoặc bác đề xuất của người khác; chạy Kiểm tra toàn vẹn; xem nhật ký và ma trận quyền; chạy engine, tải bộ dữ liệu.
- **Không làm được:** ghi sự kiện nghiệp vụ, phê duyệt chi, ký, đóng tranh chấp, chuyển kế toán, sửa quyết định; duyệt đề xuất của chính mình (`SECOND_CONTROLLER_REQUIRED`); vô hiệu sự kiện hợp lệ (`EVENT_NOT_VOIDABLE`); quản lý tài khoản hay cấu hình (SoD-1).

### 6.7. Quản trị hệ thống (`SYSTEM_ADMIN`)

- **Là ai:** người quản trị cấu hình thuộc OPS (`sysadmin@codecash.vn`). Màn đầu tiên là Quản trị hệ thống.
- **Làm được:** tạo, sửa, khoá tài khoản và đặt lại mật khẩu; quản lý tổ chức, mẫu mốc, tham số; tải tài liệu; nhập/xuất theo Base; xem nhật ký quản trị và ma trận quyền.
- **Không làm được:** xem hợp đồng, xử lý ngoại lệ, phê duyệt, ký, ghi sự kiện. Bản ghi của Data Pack và của luồng nghiệp vụ vẫn chỉ xem được (`MANAGED_RECORD`); rule và ma trận quyền nằm trong mã.

### 6.8. Kiểm toán (`AUDITOR`)

- **Là ai:** kiểm toán nội bộ thuộc OPS (`auditor@codecash.vn`), chỉ đọc. Màn đầu tiên là Kiểm tra toàn vẹn.
- **Thấy:** mọi hợp đồng, quyết định, hàng đợi ngoại lệ, nhật ký, tài khoản, tổ chức, mẫu mốc, tham số, ma trận quyền; xuất được dữ liệu.
- **Không làm được:** mọi thao tác ghi, kể cả đề xuất ngoại lệ hay chạy engine (`ACTION_FORBIDDEN`, `PERMISSION_DENIED`).

### 6.9. Tách nhiệm đang thực thi

| Nguyên tắc (mục 17) | Thực hiện |
| --- | --- |
| SoD-1: không ai vừa quản trị cấu hình vừa xử lý ngoại lệ | Ba vai trò nội bộ tách nhau: kiểm soát viên (ngoại lệ), quản trị hệ thống (tài khoản, cấu hình), kiểm toán (chỉ đọc) |
| SoD-2: ngoại lệ cần hai kiểm soát viên khác nhau, không là bên của hợp đồng | Người đề xuất không duyệt được; kiểm soát viên thuộc OPS |
| SoD-3: không ai sửa quyết định, số tiền, trạng thái, audit | Không có API sửa kết quả; quyết định chỉ do engine ghi; nhật ký chỉ ghi thêm và nối hash chain; sửa ngoài ứng dụng bị Kiểm tra toàn vẹn phát hiện |
| SoD-4: đổi cấu hình cần người thứ hai | Rule (payment_rules của Data Pack) và ma trận quyền nằm trong mã, đổi qua review; giao diện không sửa được |
| SoD-5: thao tác được ghi lại | Mọi thao tác ghi có nhật ký; đăng nhập demo ghi `LOGIN_DEMO` |
| Phê duyệt đúng người | Người duyệt phải thuộc đúng bên mua, đúng vai trò còn thiếu; một người không duyệt thay vai trò khác; NCC không duyệt được |


## 7. Kịch bản demo

Đã chạy thử từ đầu đến cuối trên dữ liệu vừa khởi tạo. Các kịch bản độc lập với nhau. Mã lỗi trong ngoặc là thứ API trả khi cố làm sai.

### 7.1. Phê duyệt có khấu trừ phạt: CT0103 mốc 2

1. `finance@novaan.vn` → **Việc cần làm**: "Phê duyệt chi · CT0103 · mốc 2".
2. Màn phê duyệt: Chủ hợp đồng đã duyệt, Tài chính đang chờ. Xem trước: **PENALTY, được trả 737,78, phạt 2,22**.
   Vì sao: hạn 12/10, ân hạn 2 ngày nên hạn chót 14/10; giao hàng và hoá đơn ngày 16/10, trễ 2 ngày; phạt = 740 × 0,15% × 2 = 2,22 (trần 8% là 59,20).
3. Bấm **Phê duyệt** → trang quyết định: PENALTY, `LATE_COMPLETION`, rule PR0014, trạng thái "Chi sau khấu trừ". Lịch sử ghi Chờ phê duyệt → Chi sau khấu trừ kèm mã lượt chạy.

Điểm nhấn: người duyệt không nhập số tiền, engine tính.

### 7.2. Chuyển kế toán đúng một lần: CT0103 mốc 1

1. `finance@novaan.vn` mở trang quyết định CT0103 mốc 1 (RELEASE 370,00) → **Chuyển kế toán**.
2. Có khoản chi `PAY-MS0411-<mã lượt chạy>`; mốc thành "Đã chuyển chi" và bị khoá. Bấm lại bị từ chối (`ALREADY_TRANSFERRED`).

### 7.3. NCC nộp chứng từ trễ: CT0104 mốc 2

1. `supplier@phuminh.vn` → việc "Nộp chứng từ · CT0104 · mốc 2", nhãn "Trễ hạn, có thể bị phạt".
2. Màn nộp có hai ô: Xác nhận hoàn thành dịch vụ, Hoá đơn. Đính kèm hai tệp → xem trước: HOLD, chờ phê duyệt.
3. **Nộp** → hai sự kiện `AP-EV…`; chủ hợp đồng nhận việc "Phê duyệt chi · CT0104 · mốc 2".
4. `owner@novaan.vn` phê duyệt → **PENALTY**: hạn 11/10 + 7 ngày ân hạn = 18/10; nộp ngày 23/10, trễ 5 ngày; phạt = 480 × 0,10% × 5 = 2,40, được trả 477,60.

Thẩm quyền: cán bộ hợp đồng bên mua không có ô Hoá đơn; gọi API thẳng cũng bị từ chối (`NOT_YOUR_EVENT_TYPE`).

### 7.4. Đóng tranh chấp: CT0019 mốc 3 và CT0014 mốc 2

1. `owner@novaan.vn` → việc "Giải quyết tranh chấp · CT0019 · mốc 3". Tranh chấp EV00204 do bên mua mở ngày 10/08. Xem trước sau khi đóng: RELEASE 591,00.
2. Đóng kèm ghi chú → sự kiện `DISPUTE_RESOLVED` tham chiếu đúng EV00204 → RELEASE, `ALL_CONDITIONS_MET`, rule PR0007.
3. CT0014 mốc 2: tranh chấp EV00137 do NCC YoungTech Vietnam (S024) mở; chủ hợp đồng đóng → RELEASE 1.425,00.

NCC không đóng được tranh chấp; đóng phải tham chiếu đúng tranh chấp đang mở ("mở dễ, đóng khó").

### 7.5. Bên mua nghiệm thu: CT0084 mốc 3

1. `legal@novaan.vn` → việc "Nộp chứng từ · CT0084 · mốc 3" (Biên bản nghiệm thu). Mốc đã đủ 2/2 phê duyệt.
2. Nộp → **PENALTY**: hạn chót 12/10 (07/10 + 5 ngày), nộp 23/10, trễ 11 ngày; phạt = 408 × 0,15% × 11 = 6,732, làm tròn 6,73; được trả 401,27.

Điểm nhấn: trong Data Pack mốc này là HOLD vì thiếu chứng từ; app cho thấy hợp đồng tiếp tục sống sau ngày chốt dữ liệu.

### 7.6. BR-19, sự kiện sai thẩm quyền: CT0090 mốc 3

1. `admin@codecash.vn` → **Ngoại lệ BR-19**: 6 mốc (CT0017/3, CT0029/2, CT0048/2, CT0071/3, CT0086/2, CT0090/3).
2. CT0090 mốc 3: Biên bản nghiệm thu EV01006 do NCC Hưng Phát Equipment (S008) tự ghi bằng nhập tay. Theo ma trận 4.2, nghiệm thu thuộc bên mua, nên mốc bị HOLD `UNAUTHORIZED_EVENT`.
3. Đề xuất vô hiệu EV01006, ghi lý do → `EXC-0001`. Tự duyệt đề xuất của mình bị từ chối (`SECOND_CONTROLLER_REQUIRED`).
4. `controller@codecash.vn` → việc "Duyệt đề xuất ngoại lệ" → **Duyệt**. Engine chạy lại với sự kiện đã vô hiệu: HOLD `MISSING_REQUIRED_EVENT` (PR0004). Vô hiệu không tạo bằng chứng thay cho ai.
5. `legal@cuulong.vn` (Cửu Long Business Solutions JSC, B003) nộp biên bản nghiệm thu → **PENALTY chạm trần**: trễ 179 ngày, phạt thô 68,47 vượt trần 8% nên phạt 20,40; được trả 234,60.

### 7.7. Ký theo thứ tự ba người: CT0102

Hiện trạng: Chủ hợp đồng đã ký (bước 1, 20/10 09:15) → NCC (bước 2, đang đến lượt) → Phó giám đốc (bước 3, ký cuối).

1. `secondary@novaan.vn` mở luồng ký: chưa đến lượt (`NOT_YOUR_TURN`).
2. `supplier@phuminh.vn` → việc "Ký hợp đồng · CT0102" → chọn VNPT SmartCA (mô phỏng) → gửi yêu cầu → xác nhận.
3. `secondary@novaan.vn` ký → hợp đồng có hiệu lực: ngày ký là ngày bấm; hệ thống ghi `CONTRACT_SIGNED` nhân danh bên mua (B010); engine chạy, mốc 1 "Contract Signing" chuyển sang chờ phê duyệt.
4. Chủ hợp đồng và Phó giám đốc cùng nhận "Phê duyệt chi · CT0102 · mốc 1" (chính sách hai người duyệt). Người thứ nhất duyệt: vẫn HOLD 1/2. Người thứ hai duyệt: RELEASE 320,00.
5. **Kiểm tra chữ ký** (`/verify/CT0102`): 3 chữ ký và thời điểm hiệu lực.

### 7.8. Hợp đồng mới từ đầu: CT0101

1. `legal@novaan.vn` → việc "Hoàn tất hồ sơ hợp đồng · CT0101" → **Tải hợp đồng lên**. Hồ sơ đã điền sẵn: Mua sắm thiết bị phòng thực hành, Cung cấp hàng hoá, 2.400 triệu, Chủ hợp đồng duyệt, người ký Chủ HĐ → NCC, tệp `HopDong_ThietBi_PhongTH.pdf`. Có thể đổi người ký và thứ tự.
2. Lưu → **Vị trí ký**: hai ô chữ ký trên trang ký.
3. **Rà soát điều khoản**: hợp đồng được cắt thành 4 mốc theo quy trình hàng hoá của Data Pack: Ký hợp đồng 480 (20%) hạn 07/11/2026; Giao hàng 960 (40%) hạn 17/12/2026; Nghiệm thu 720 (30%) hạn 05/01/2027; Bảo hành 240 (10%) "12 tháng", cần người xác nhận hạn. Tổng khớp giá trị hợp đồng.
4. Nhập hạn bảo hành → **Xác nhận**: các mốc bị khoá, hợp đồng chuyển "Đang ký"; chủ hợp đồng nhận việc ký.
5. `owner@novaan.vn` ký → `supplier@phuminh.vn` ký → hợp đồng có hiệu lực; mốc 1 chờ chủ hợp đồng phê duyệt.

### 7.9. Chạy lại cho hidden test: trang Kết quả Data Pack

1. `owner@novaan.vn`, `finance@novaan.vn` hoặc kiểm soát viên → **Kết quả Data Pack**, nguồn "Data Pack chính thức" → **Đánh giá dữ liệu**: bảng 405 mốc, khối KPI, trace từng mốc.
2. **Tải bộ dữ liệu lên**: kéo thả CSV hoặc ZIP cả thư mục. Bắt buộc `contracts.csv`, `parties.csv`, `milestones.csv`, `events.csv`, `payment_rules.csv`; tuỳ chọn `decision_sample.csv`, `submission_output_template.csv`, `hidden_test_ids_*.csv`. Hệ thống báo tệp đủ, thiếu, thiếu cột trước khi chạy.
3. **Đánh giá dữ liệu** → **Tải kết quả**: `submission_output.csv` (22 cột đúng thứ tự template), `audit.json` (trace từng mốc), `metrics.json` (tổng hợp và KPI).
4. Có `hidden_test_ids_*.csv` thì chỉ xuất các mốc trong danh sách; engine vẫn đọc toàn bộ dữ liệu.
5. Không cần giao diện: `python3 apps/engine/cli.py --data <thư mục dữ liệu> --output <thư mục kết quả>`.

### 7.10. Phát lại diễn biến: CT0019 mốc 3

1. Mở trang quyết định CT0019 mốc 3 → khối **Diễn biến theo thời gian** → **Phát lại từng sự kiện**.
2. Bảng 4 dòng, mỗi dòng là kết quả engine ngay sau một sự kiện: 10/08 tranh chấp mở (HOLD, còn thiếu biên bản nghiệm thu) → 12/08 có biên bản nghiệm thu → phê duyệt 1/2 → phê duyệt 2/2, vẫn HOLD vì tranh chấp chưa đóng.
3. Sau kịch bản 7.4, chạy lại: có thêm dòng đóng tranh chấp, quyết định thành RELEASE.

Phát lại dùng chế độ as-of của đặc tả (BR-16), không ghi gì vào dữ liệu. Câu trả lời cho "vì sao mốc này bị giữ?" nằm trong một bảng.

### 7.11. Kiểm tra toàn vẹn và phát hiện sửa dữ liệu

1. `auditor@codecash.vn` (hoặc kiểm soát viên) → **Kiểm tra toàn vẹn**: bốn khối đều "Toàn vẹn". Chép **mã đầu chuỗi** ra nơi khác.
2. Muốn demo phát hiện sửa dữ liệu: sao lưu `.data/`, dừng API, sửa một chữ trong `.data/records.json` (ví dụ ghi chú của một sự kiện, hoặc trường `actorId` của một bản ghi nhật ký), chạy lại API.
3. Kiểm tra lại: khối tương ứng báo "Có sai lệch" và chỉ đúng chỗ (bản ghi nhật ký số mấy, sự kiện nào, bảng dữ liệu BTC nào, mốc nào có quyết định lệch với engine).
4. Dán mã đầu chuỗi đã chép vào ô so sánh: nếu cả nhật ký bị viết lại hoặc bị cắt bớt, kết quả là "Không khớp" hoặc "Không thấy bản ghi đó".
5. Trả lại `.data/` đã sao lưu.

API đang chạy giữ dữ liệu trong bộ nhớ và ghi đè tệp ở lần ghi kế tiếp, nên phải dừng API trước khi sửa tệp.

## 8. Quyền theo vai trò

Tóm tắt các quyền chính của 8 vai trò. Đủ 61 quyền ở [`packages/contracts/permissions.json`](../packages/contracts/permissions.json) và trang **Quản trị hệ thống → Ma trận phân quyền**.

| Quyền | Chủ HĐ | Tài chính | Cấp 2 | Cán bộ HĐ | Kiểm soát viên | Quản trị HT | Kiểm toán | NCC |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Xem hợp đồng | tổ chức | tổ chức | tổ chức | tổ chức | tất cả | — | tất cả | của mình |
| Soạn hồ sơ, vị trí ký, số hoá, huỷ ký | tổ chức | — | — | tổ chức | — | — | — | — |
| Ký | khi được gán | khi được gán | khi được gán | khi được gán | — | — | — | khi được gán |
| Nộp chứng từ | — | — | — | tổ chức | — | — | — | của mình |
| Phê duyệt chi | tổ chức | tổ chức | tổ chức | — | chỉ xem | — | chỉ xem | — |
| Chuyển kế toán | — | tổ chức | — | — | — | — | — | — |
| Mở tranh chấp | tổ chức | — | — | tổ chức | — | — | — | của mình |
| Đóng tranh chấp | tổ chức | — | — | tổ chức | — | — | — | — |
| Đề xuất, duyệt ngoại lệ BR-19 | — | — | — | — | tất cả | — | chỉ xem | — |
| Kiểm tra toàn vẹn | — | — | — | — | có | — | có | — |
| Chạy engine, tải bộ dữ liệu | có | có | chỉ xem | chỉ xem | có | — | chỉ xem | — |
| Tài khoản, tổ chức, mẫu mốc, tham số | — | — | — | — | — | tất cả | chỉ xem | — |

"Tổ chức" là hợp đồng của tổ chức mình; "của mình" là hợp đồng mình là một bên; "khi được gán" là bước ký được giao cho chính người đó. Chủ hợp đồng và cán bộ hợp đồng còn đọc được danh mục tổ chức và mẫu mốc để điền form, nhưng không có menu Quản trị. Ngoài quyền hệ thống, engine vẫn kiểm thẩm quyền nghiệp vụ: ví dụ Chủ hợp đồng có quyền phê duyệt nhưng chỉ được tính khi chính sách của hợp đồng có vai trò này.

## 9. KPI đo được

Engine đo theo đặc tả mục 15 ở mỗi lượt chạy; xem khối **Chỉ số KPI** trên trang Kết quả Data Pack hoặc `metrics.json`. Số dưới đây là lượt chạy trên Data Pack chính thức.

| KPI | Kết quả | Đo trên |
| --- | --- | --- |
| Độ chính xác quyết định | 20/20 | 20 mẫu công khai |
| Scenario khớp đủ 17 cột của mẫu | 20/20 | 20 mẫu |
| Macro-F1 (4 lớp quyết định) | 1,0000 | 20 mẫu |
| Chi sai (Unauthorized Payment Rate) | 0/10 | 10 mẫu có nhãn HOLD/REJECT |
| Giữ thừa (Over-hold) | 0/10 | 10 mẫu có nhãn RELEASE/PENALTY |
| Khớp số tiền | 20/20, sai số lớn nhất 0,00 | 20 mẫu |
| Độ phủ đầu ra | 405/405 | toàn bộ mốc |
| Truy vết đầy đủ | 405/405 | toàn bộ mốc |
| Bất biến mục 14.6 | 0 vi phạm | toàn bộ mốc |
| Thời gian xử lý | 34 ms cho 405 mốc trong engine; trung vị 0,06 ms, p95 0,07 ms mỗi mốc; khoảng 0,1 s mỗi thao tác trong app | máy dev Linux x86_64, Python 3.14, 20 CPU |
| Kiểm thử | 53 test Python (gồm 41 test đặc tả mục 16), 16 test workflow, 13 test nền CRUD, 4 test bộ máy danh sách, smoke API và trình duyệt (32 màn) | `pnpm check`, `pnpm test:e2e`, `pnpm test:browser` |

- Phân bố quyết định trên 405 mốc: RELEASE 348, PENALTY 15, HOLD 36 (tranh chấp 10, sai thẩm quyền 6, thiếu chứng từ 10, thiếu phê duyệt 10), REJECT 6. Tổng được trả 365.785,87 triệu, tổng phạt 102,13 triệu.
- Đây là kết quả theo đặc tả, không phải độ chính xác trên 405 mốc hay trên hidden test. Chỉ 20 mẫu có nhãn.
- Có test chứng minh KPI đo thật: bỏ sự kiện tranh chấp của một mẫu đang HOLD thì mốc bị trả tiền và UPR thành 1/10 (`tests/test_engine_dataset.py`).
- 46 mốc phụ thuộc giả định chưa được BTC xác nhận có `confidence_score` 0,80 và ghi giả định trong cột `notes`.

## 10. Đối chiếu yêu cầu đề bài

| Mức | Yêu cầu của đề | Đã có |
| --- | --- | --- |
| Bronze | Nhiều hợp đồng, ≥ 3 loại mốc | 104 hợp đồng, 4 quy trình, 13 loại mốc |
| Bronze | Tự động kiểm điều kiện, chuyển trạng thái | Engine chạy lại sau mọi sự kiện; lịch sử trạng thái có mã lượt chạy và nguyên nhân |
| Bronze | Không RELEASE khi chưa đủ điều kiện | Rule 10–50 chặn trước rule 60–70; bất biến 14.6; UPR 0/10 |
| Bronze | Sinh 4 quyết định, tính tiền, lưu lịch sử, có giao diện | Trang quyết định, danh sách hợp đồng, Việc cần làm, Kết quả Data Pack |
| Silver | Penalty, escrow/time-lock | Phạt trễ có trần, HALF_UP; tiền chỉ chuyển kế toán khi engine cho phép, mỗi mốc một lần |
| Silver | Phân quyền, phê duyệt nhiều bên | 8 vai trò, 61 quyền, tách nhiệm SoD-1 đến SoD-5; quorum theo chính sách; ký nhiều bên theo thứ tự |
| Silver | Xử lý dispute | Mở dễ, đóng khó: chỉ bên mua đóng, phải tham chiếu đúng tranh chấp |
| Silver | Kiểm soát duplicate/unauthorized | BR-03 khử trùng; rule 30 và BR-19 hai người |
| Silver | KPI, scenario test | Mục 9 |
| Gold (một phần) | Multisig/oracle mô phỏng | Ký số nhiều bên theo thứ tự, mô phỏng CA; không gọi là multisig mật mã |
| Gold | Audit trail và kiểm tra rule nâng cao | Trace đủ 8 rule mỗi mốc; nhật ký hash chain có so mã đầu chuỗi; niêm phong chứng từ và dữ liệu gốc của BTC; đối soát mọi quyết định bằng cách chạy lại engine; phát lại as-of từng mốc |
| Gold | Dashboard nhiều hợp đồng | Danh sách hợp đồng có thống kê, Kết quả Data Pack có KPI |
| Gold (một phần) | AI hỗ trợ điều khoản, human-in-the-loop | Màn rà soát điều khoản bắt người xác nhận điểm mơ hồ; trích xuất còn là mô phỏng |
| — | Blockchain | Không dùng; đề không cộng điểm chỉ vì blockchain |

## 11. Giới hạn hiện tại

Nói thẳng khi được hỏi:

- **Ký số là mô phỏng.** Chọn USB token, VNPT SmartCA hoặc Viettel MySign; yêu cầu tự xác nhận sau vài giây. Chưa nối CA thật, chưa ký mật mã lên PDF. Kiểm một PDF bên ngoài mà chỉ nhận ra cấu trúc thì báo "chưa xác minh".
- **Rà soát điều khoản chưa đọc PDF.** Các mốc dựng từ mẫu quy trình của Data Pack và dữ liệu nhập ở form; vị trí điều khoản là minh hoạ. Chưa có OCR hay AI.
- **Độ chính xác chỉ đo trên 20 mẫu công khai.** Không tuyên bố cho 405 mốc hay hidden test.
- **Hash chain không phải blockchain.** Nó phát hiện sửa, xoá, chèn bản ghi; người viết lại được cả nhật ký và cả mã đầu chuỗi chỉ bị phát hiện khi so với mã đã lưu ở nơi khác. Cần định kỳ chép mã đầu chuỗi ra ngoài (biên bản, email).
- **Đổi rule hay ma trận quyền là đổi mã**, cần review hai người (SoD-4); chưa có luồng duyệt phiên bản cấu hình trên giao diện.
- **Không gửi email, không chuyển tiền thật.** "Chuyển kế toán" là ghi nhận; thông báo chỉ nằm trong app.
- **Vận hành:** kho file local dành cho một tiến trình; production dùng MongoDB replica set, chưa kiểm thử tải. Đăng nhập demo phải tắt ở production (`DEMO_LOGIN=false`).
- **"Yêu cầu bổ sung" là ghi chú**, không phải sự kiện; engine không xét.

## 12. Đề xuất để thắng

Theo thang điểm của đề (mục 9) và ba tiêu chí phụ khi bằng điểm.

**Phù hợp vấn đề và giá trị dự kiến (25 điểm)**

- Kể bằng bối cảnh khoa/trường, đáp tiêu chí phụ "áp dụng ngay trong khoa/trường". Bốn hợp đồng demo đã đúng bối cảnh: thiết bị phòng thực hành (CT0101), phần mềm quản lý đào tạo (CT0102), thiết bị mạng phòng lab (CT0103), bảo trì máy chủ (CT0104). Ánh xạ vai trò: phòng quản trị thiết bị là cán bộ hợp đồng, trưởng khoa là chủ hợp đồng, kế toán trưởng là phê duyệt tài chính, phó hiệu trưởng là phê duyệt cấp 2.
- Nêu nỗi đau bằng số của Data Pack: 36 mốc phải giữ, 6 mốc bị từ chối, 15 mốc trễ bị phạt, 10 mốc đang tranh chấp, 6 mốc có sự kiện sai thẩm quyền. Đây đều là chỗ dễ chi sai khi làm thủ công.
- Không hứa phần trăm tiết kiệm khi chưa đo. Đề xuất đo thời gian xử lý cùng một bộ hồ sơ trước và sau khi dùng.

**Thiết kế kỹ thuật và đo lường (30 điểm)**

- Đưa bảng KPI mục 9 vào proposal, ghi rõ tập đo; chụp khối KPI trên trang Kết quả Data Pack.
- Trình bày "thứ tự ưu tiên của rule" bằng bảng mục 2.1 và một trace thật (CT0103 mốc 2).
- Minh hoạ state transition bằng **Diễn biến theo thời gian** (kịch bản 7.10) thay vì sơ đồ suông.
- Minh hoạ "audit nâng cao" bằng **Kiểm tra toàn vẹn** (kịch bản 7.11): sửa một chữ trong dữ liệu, hệ thống chỉ ra đúng chỗ. Ghi rõ giới hạn: cần lưu mã đầu chuỗi ở nơi khác.

**Đầu ra và tuân thủ (20 điểm)**

- `submission_output.csv` 22 cột, 405 dòng; kiểm bằng `python3 tools/kiem_chung_nghiep_vu.py --check` trước khi nộp.
- Riêng tư: phạm vi theo bên (demo NCC bị từ chối khi mở hợp đồng người khác); dữ liệu bổ sung được đánh dấu; không gửi dữ liệu hợp đồng ra dịch vụ AI bên ngoài.
- Có mục "Giả định": A01, A05, A07, A08 kèm số mốc bị ảnh hưởng (tối đa 80, 31, 1, 15) và câu hỏi gửi BTC ([05](05_HUONG_DAN_DOC_VA_VIEC_CON_MO.md)).
- Đạo đức: không có nút ép chi; mọi mốc bị giữ hoặc từ chối đều nói rõ thiếu gì và ai cần làm gì.

**Kế hoạch triển khai MVP 2–3 tuần (15 điểm)**

- Tuần 1: kiểm thử tích hợp MongoDB; tự động gửi mã đầu chuỗi ra ngoài mỗi ngày; luồng duyệt hai người cho phiên bản cấu hình (SoD-4).
- Tuần 2: thí điểm ở một khoa với 3–5 hợp đồng thật đã ẩn danh; nhập hợp đồng qua form; thông báo email.
- Tuần 3: đo KPI vận hành (thời gian từ nộp đến quyết định, số lần trả hồ sơ thiếu, số lần chặn chi sai) và chỉnh theo phản hồi.
- Sau MVP: CA thật, OCR/AI trích điều khoản có tập đánh giá riêng và người duyệt.

**Trình bày và vấn đáp (10 điểm)**

- Kịch bản 5 phút: 7.1 (phạt tự tính) → 7.6 (BR-19 hai người) → 7.4 và 7.10 (tranh chấp, phát lại) → 7.9 (chạy lại và KPI) → 7.11 (kiểm tra toàn vẹn). Dự phòng 7.7 nếu hỏi ký số, 7.8 nếu hỏi số hoá.
- Chuẩn bị dữ liệu sạch trước buổi chấm; quay sẵn video demo dự phòng.
- Mỗi thành viên tập trả lời các câu ở mục 13 trong dưới 30 giây.

## 13. Câu hỏi nhanh 30 giây

| Câu hỏi | Gợi ý trả lời |
| --- | --- |
| NCC tự ghi biên bản nghiệm thu thì sao? | Nghiệm thu thuộc bên mua theo ma trận 4.2. Sự kiện đó bị tính là sai thẩm quyền, mốc HOLD ở rule 30. Muốn gỡ, hai kiểm soát viên khác nhau duyệt vô hiệu, rồi bên mua tự ghi lại (kịch bản 7.6). |
| Ai bấm chi tiền được? | Không ai ép được. Kế toán chỉ "Chuyển kế toán" được mốc mà engine đã cho RELEASE hoặc PENALTY, mỗi mốc một lần; sau đó mốc bị khoá. |
| Làm sao biết quyết định đúng? | 20/20 mẫu công khai, 41 test đặc tả, bất biến trên 405 mốc, và mỗi mốc có trace đủ 8 rule. Không tuyên bố độ chính xác trên dữ liệu ẩn. |
| Đang tranh chấp mà đủ chứng từ thì sao? | Rule 10 ưu tiên cao nhất nên HOLD. Chỉ bên mua đóng được, bằng sự kiện tham chiếu đúng tranh chấp đó. |
| Phạt tính thế nào? | Số ngày trễ sau ân hạn × tỷ lệ × tiền kế hoạch, không quá trần, làm tròn HALF_UP. CT0103 mốc 2: 740 × 0,15% × 2 = 2,22. |
| Gửi trùng chứng từ có bị trả hai lần? | Không. Bản lặp bị khử (BR-03); mỗi mốc chỉ chuyển kế toán một lần, mã khoản chi gắn với lượt quyết định. |
| Dữ liệu ẩn chạy thế nào? | Tải thư mục hoặc ZIP lên trang Kết quả Data Pack, bấm đánh giá, tải CSV 22 cột; hoặc chạy một lệnh CLI. |
| Có blockchain không? | Không cần. Đề chấm logic đúng, an toàn thanh toán và truy vết. Nhật ký là hash chain, chứng từ và dữ liệu gốc được niêm phong; màn Kiểm tra toàn vẹn chỉ ra chỗ bị sửa. |
| Ai đó sửa thẳng cơ sở dữ liệu thì sao? | Kiểm tra toàn vẹn báo đúng bản ghi nhật ký, sự kiện, bảng dữ liệu BTC hoặc mốc có quyết định lệch với engine (kịch bản 7.11). |
| Quản trị viên có tự cấp quyền rồi duyệt chi được không? | Không. Quản trị hệ thống không thấy hợp đồng, không duyệt ngoại lệ hay phê duyệt; ma trận quyền nằm trong mã. |
| Bên này có xem được hợp đồng bên kia? | Không. Phạm vi lấy từ tài khoản đăng nhập; NCC mở mã hợp đồng của người khác bị từ chối. |

## Phụ lục: mã lỗi hay gặp khi demo

| Mã | Ý nghĩa |
| --- | --- |
| `NOT_YOUR_TURN` | Chưa đến lượt ký |
| `NOT_ASSIGNED_SIGNER` | Bước ký này được giao cho người khác |
| `NOT_YOUR_EVENT_TYPE` | Loại chứng từ thuộc bên kia (ma trận 4.2) |
| `NOT_A_REQUIRED_APPROVER` | Chính sách phê duyệt của mốc không có vai trò của bạn |
| `ALREADY_VOTED` | Đã phê duyệt hoặc từ chối mốc này |
| `CONTRACT_ACCESS_DENIED` | Hợp đồng ngoài phạm vi của bạn |
| `MILESTONE_CLOSED` | Mốc đã bị từ chối hoặc đã chuyển kế toán |
| `CONTRACT_NOT_SIGNED` | Hợp đồng chưa có hiệu lực nên chưa ghi chứng từ được |
| `ALREADY_TRANSFERRED` | Mốc này đã được chuyển kế toán |
| `SECOND_CONTROLLER_REQUIRED` | Người đề xuất ngoại lệ không tự duyệt được |
| `EVENT_NOT_VOIDABLE` | Chỉ vô hiệu được sự kiện sai thẩm quyền |
| `DRAFT_LOCKED` | Hồ sơ đã số hoá xong, không sửa được |
| `MANAGED_RECORD` | Bản ghi thuộc Data Pack hoặc luồng nghiệp vụ, không sửa ở trang Quản trị |
| `PERMISSION_DENIED`, `ACTION_FORBIDDEN` | Vai trò không có quyền này (ma trận phân quyền) |
| `APPEND_ONLY_RESOURCE` | Nhật ký chỉ ghi thêm, không sửa, không xoá |
| `INVALID_ANCHOR` | Mã đầu chuỗi phải có dạng số:mã băm 64 ký tự |
