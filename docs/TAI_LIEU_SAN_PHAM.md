# CodeCash: Tài liệu sản phẩm Vòng 3

Đội **Code & Cash** · Festival Chuyển đổi số 2026 · Bảng D · Case 4: Smart Contract Workflow.

Tài liệu ngắn về phiên bản sản phẩm thực tế ở Vòng 3. Quy tắc nghiệp vụ đầy đủ ở [đặc tả nghiệp vụ](NGHIEP_VU.md); cách cài và chạy ở [README](../README.md).

## 1. Bài toán

Thanh toán theo mốc của hợp đồng đang được kiểm bằng tay, nên:

- tiền bị chi khi chứng từ còn thiếu, do sai bên lập, hoặc đang tranh chấp;
- tính phạt trễ hạn thủ công dễ nhầm ân hạn, trần phạt và ngày hoàn thành;
- không trả lời được "vì sao chi khoản này, ai duyệt, dựa trên chứng từ nào".

Người dùng gồm ba nhóm:

- bên mua: chủ hợp đồng, người duyệt tài chính, người duyệt thứ hai, cán bộ hợp đồng;
- nhà cung cấp: ký, nộp chứng từ giao hàng, hoá đơn, bảo hành;
- nhóm kiểm soát: kiểm soát viên, kiểm toán chỉ đọc, quản trị hệ thống.

## 2. Giải pháp

Mỗi thao tác trên hợp đồng là một sự kiện. Sau mỗi sự kiện, engine chấm lại mốc theo bộ luật và ra một trong bốn quyết định, kèm số tiền, lý do, luật áp dụng và chứng từ làm căn cứ:

| Quyết định | Ý nghĩa |
| --- | --- |
| Chi đủ (RELEASE) | Đủ mọi điều kiện, chi đúng giá trị mốc |
| Chi sau trừ phạt (PENALTY) | Hoàn thành sau hạn + ân hạn, chi phần còn lại sau khi trừ phạt |
| Tạm giữ (HOLD) | Còn tranh chấp, thiếu chứng từ hoặc phê duyệt, sai thẩm quyền, dữ liệu lỗi |
| Từ chối (REJECT) | Có phiếu từ chối hợp lệ |

Ba nguyên tắc thiết kế:

- **Luật là dữ liệu.** Engine đọc bảng luật của BTC, chọn luật khớp đầu tiên theo ưu tiên. Thẩm quyền, cách đóng tranh chấp và cách đếm phê duyệt nằm trong policy pack có phiên bản. Không gắn cứng theo mã hợp đồng hay tình huống.
- **Nghi ngờ thì tạm giữ.** Nhánh mặc định cuối cùng là tạm giữ. Chốt an toàn chặn mọi luật trả tiền khi còn tranh chấp, từ chối hoặc thiếu điều kiện.
- **Không ai sửa kết quả.** Muốn đổi kết quả phải ghi sự kiện mới của đúng bên, hoặc ngoại lệ có hai người khác nhau duyệt.

## 3. Kiến trúc và luồng xử lý

```text
Web (React)  ──►  API (NestJS)  ──►  Engine (Python, Decimal)
                    │                    │
                    ▼                    ▼
           Lưu trữ (tệp hoặc MongoDB)   405 dòng + trace + KPI
           Nhật ký chuỗi băm, neo Merkle
```

- **Web:** mỗi vai trò chỉ thấy việc của mình; hiển thị quyết định, lý do, luật áp dụng, không tự tính.
- **API:** lấy danh tính và phạm vi từ tài khoản đăng nhập, không tin dữ liệu trình duyệt gửi. Mỗi hành động nghiệp vụ có kiểm quyền và chạy lại engine trong cùng giao dịch, rồi ghi nhật ký chuỗi băm.
- **Engine:** chín bước cho mỗi mốc:
  1. cấu trúc;
  2. sự kiện (khử trùng lặp, giữ bản sớm nhất);
  3. chứng từ bắt buộc và thẩm quyền;
  4. tranh chấp, từ chối, quorum theo vai trò;
  5. thời hạn;
  6. chọn luật;
  7. tính tiền;
  8. độ tin cậy;
  9. truy vết.

Luồng: Hợp đồng → Mốc thanh toán → Chứng từ → Kiểm luật → Quyết định và tiền → Lệnh chi → Nhật ký. Sơ đồ chi tiết:

- [kiến trúc hệ thống](bpmn/kien-truc-he-thong.md);
- [luồng theo vai trò](bpmn/README.md);
- [ERD cơ sở dữ liệu](diagrams/erd-codebase.md).

Công thức tiền: `F = min(trễ × mức phạt × P, trần phạt × P)`, `Được chi = max(0, P − F)`. P là giá trị mốc. Tính bằng Decimal, làm tròn F tới 0,01 triệu trước khi trừ.

## 4. Chức năng chính

| Trạng thái | Chức năng |
| --- | --- |
| Đã triển khai | Engine 4 quyết định và tính tiền trên toàn bộ 405 mốc của Data Pack |
| Đã triển khai | Workflow trực tiếp: ký theo trình tự, nộp chứng từ, phê duyệt theo vai trò, tranh chấp, lệnh chi |
| Đã triển khai | Chạy thử trước khi ghi: biết quyết định và số tiền trước khi nộp hay duyệt |
| Đã triển khai | Ngoại lệ hai người: chủ hợp đồng đề xuất vô hiệu chứng từ sai thẩm quyền, kiểm soát viên khác duyệt |
| Đã triển khai | Phân quyền 8 vai trò theo tổ chức, một ma trận quyền, kiểm ở API |
| Đã triển khai | Nhật ký chuỗi băm, niêm phong quyết định, neo gốc Merkle mỗi 15 phút |
| Đã triển khai | Gói kiểm chứng độc lập: chạy lại quyết định bằng Python ngoài hệ thống, so mã băm |
| Đã triển khai | Phiên bản luật có kiểm soát: chứng minh an toàn bộ luật, xem tác động trên 405 mốc trước khi công bố |
| Đã triển khai | Hoá đơn có kiểm ký hiệu, số, mã số thuế, trùng lặp, tổng tiền khớp giá trị mốc |
| Đã triển khai | Phụ lục dời hạn (bên mua đề xuất, nhà cung cấp chấp nhận) và thanh lý, cho hợp đồng tạo trong ứng dụng |
| Mô phỏng | Ký số với chứng thư mô phỏng; cổng thanh toán mô phỏng (đã có adapter HTTP có Idempotency-Key và chữ ký HMAC) |
| Mô phỏng | AI đọc điều khoản từ PDF (Gemini API): chỉ đề xuất 6 điều khoản kèm trang và trích dẫn, người xác nhận |
| Định hướng | Ký qua tổ chức chứng thực chữ ký số được cấp phép; nối cổng ngân hàng thật; phụ lục đổi giá trị hoặc tỷ lệ thanh toán |

## 5. Công nghệ sử dụng

| Thành phần | Công nghệ | Dùng để |
| --- | --- | --- |
| Web | React 19, Ant Design 6, TanStack Query, i18next | Giao diện theo vai trò, tiếng Việt và tiếng Anh |
| API | NestJS, MongoDB (replica set) hoặc lưu tệp | Nghiệp vụ, phân quyền, giao dịch, nhật ký |
| Engine | Python (thư viện chuẩn, Decimal) | Quyết định và tính tiền |
| Tài liệu | LibreOffice, Poppler | Xem trước DOCX/PDF, đọc PDF tải lên |
| Hạ tầng | Docker Compose (nginx + API + MongoDB), GitHub Actions | Triển khai, CI build và smoke mỗi lần push |

Phần do đội xây dựng:

- engine và bộ luật, policy pack;
- phân quyền, workflow;
- nhật ký chuỗi băm, gói kiểm chứng;
- giao diện.

Phần bên ngoài:

- thư viện nền tảng nói trên;
- Google Gemini API (tuỳ chọn, chỉ đề xuất điều khoản, không tham gia quyết định);
- dấu thời gian RFC 3161 (tuỳ chọn);
- cloud chạy bản demo.

## 6. KPI và kết quả

Đo trên Data Pack chính thức, policy `CASE4_BTC` 2.1.0. Tái lập bằng `python apps/engine/cli.py --output out` → `out/metrics.json`.

| KPI | Cách tính | Tập đo | CodeCash | Baseline "luôn chi đủ" |
| --- | --- | --- | --- | --- |
| Rule Execution Accuracy | Quyết định đúng / tổng | 20 mẫu có nhãn | 20/20 | 8/20 |
| Scenario Accuracy / Macro-F1 | Khớp cả 17 cột · trung bình F1 của 4 lớp | 20 mẫu có nhãn | 20/20 · 1,00 | F1 0,14 |
| Unauthorized Payment Rate | Mốc bị chi khi chưa đủ điều kiện / mốc chưa đủ điều kiện | 20 mẫu; bộ ca tổng hợp | 0/10; 0/4.044 | 10/10 |
| Payment / Penalty Amount | Khớp tới 0,01 triệu | 20 mẫu có nhãn | 20/20, sai số 0,00 | — |
| Audit Trace / Processing | Dòng có luật, căn cứ, trace · thời gian mỗi mốc | 405 mốc | 405/405 · trung vị dưới 1 ms | — |

Baseline tính từ phân bố nhãn của 20 mẫu: 8 RELEASE, 8 HOLD, 2 REJECT, 2 PENALTY.

Kết quả trên 405 mốc:

- quyết định: RELEASE 348, HOLD 36, PENALTY 15, REJECT 6;
- tổng chi 365.785,87 triệu; tổng phạt 102,13 triệu;
- 42 mốc tạm giữ hoặc từ chối, tổng giá trị 56.452 triệu không bị chi khi chưa đủ điều kiện;
- 0 vi phạm bất biến;
- độ tin cậy: 385 mốc 1,00; 15 mốc 0,80 (phụ thuộc điểm BTC chưa chốt về hoá đơn); 5 mốc 0,97 (có bản lặp chứng từ).

Bằng chứng thêm:

- **Kiểm thử đột biến:** cài 16 lỗi vào engine. 20 mẫu BTC phát hiện 7/16; bộ ca tổng hợp lần đầu phát hiện 11/16; sau khi bổ sung 5 kịch bản thì phát hiện 16/16. Con số 16/16 đo trên chính bộ lỗi đã dùng để bổ sung, nên con số khách quan là 11/16.
- **An toàn bộ luật:** 16/16 phạm vi luật qua chứng minh tĩnh trên 9.216 tình huống.
- **Giả mạo nhật ký:** khi có neo, phát hiện 5/6 kiểu giả mạo đã thử.

## 7. Hướng dẫn sử dụng

1. Cài và chạy theo [README](../README.md) (`pnpm install`, `pnpm dev`), mở <http://127.0.0.1:5173>.
2. Đăng nhập bằng menu **Tài khoản demo**. Ví dụ `finance@novaan.vn` là người duyệt tài chính, `supplier@phuminh.vn` là nhà cung cấp.
3. Trường hợp điển hình: hợp đồng **CT0103, mốc 2**. Mốc giao hàng trị giá 740 triệu, hạn 12/10/2026, ân hạn 2 ngày, giao ngày 16/10/2026. Trước khi đủ phê duyệt, mốc ở trạng thái Tạm giữ. Người duyệt tài chính phê duyệt xong thì engine trừ phạt 2,22 triệu và chi 737,78 triệu, kèm luật và chứng từ làm căn cứ.
4. Trang **Kết quả Data Pack**: xem 405 dòng, trace từng mốc, KPI; tải CSV đầu ra.
5. Tài khoản kiểm toán (`auditor@codecash.vn`) mở **Kiểm tra toàn vẹn** để kiểm chuỗi băm.

Hướng dẫn chi tiết có ảnh chụp màn hình cho từng vai trò: nút **Hướng dẫn** trên mỗi màn của ứng dụng, hoặc 15 tệp Markdown ở [apps/web/src/guide/vi/](../apps/web/src/guide/vi/).

## 8. Giới hạn

- **Dữ liệu:** chỉ có 20 mẫu có nhãn, và engine được viết khi đã đọc chúng. Khoảng tin cậy 95% của 20/20 là 83,9–100%. Bộ ca tổng hợp gồm 33 kịch bản áp lên 405 mốc, đáp án do đội viết, nên đo độ phủ và lỗi cài đặt, không đo độ chính xác. Độ chính xác thật phụ thuộc 250 mốc ẩn và 135 mốc holdout của BTC.
- **Diễn giải:** còn hai điểm BTC chưa chốt: hoá đơn có bắt buộc khi `invoice_required = TRUE` không, và ai được đóng tranh chấp. Engine đo độ nhạy và hạ độ tin cậy các mốc bị ảnh hưởng, không đổi quyết định. Tranh chấp tính theo mốc (đội chốt).
- **Mô phỏng:** ký số và chi tiền chưa có giá trị pháp lý, chưa thanh toán thật.
- **Nhật ký:** mặc định bên làm chứng ở cùng máy chủ. Muốn có làm chứng bên ngoài thì bật dấu thời gian RFC 3161.

## 9. Hướng phát triển

| Trạng thái | Việc |
| --- | --- |
| Đã có | Triển khai bằng Docker Compose; CI build và smoke mỗi lần push; bản demo chạy trên cloud |
| Đã có | Thêm loại chứng từ, đổi luật, đổi chính sách bằng dữ liệu, không sửa code |
| Tiếp theo | Ký qua tổ chức chứng thực được cấp phép; nối cổng ngân hàng qua adapter đã có |
| Tiếp theo | Chốt các điểm diễn giải BTC còn mở rồi cập nhật bộ luật; phụ lục đổi giá trị hoặc tỷ lệ thanh toán |
| Tiếp theo | Bổ sung bằng chứng độc lập: một người không viết engine tự gán nhãn ca kiểm tra và viết bộ lỗi giữ lại |
| Định hướng | Đưa blockchain vào quy trình: neo nhật ký và niêm phong quyết định lên sổ cái dùng chung, rồi khoá giải ngân liên tổ chức (mục 9.1) |

### 9.1. Ý tưởng: đưa blockchain vào quy trình

Đây là định hướng, chưa triển khai. CodeCash đã dùng đúng nguyên lý của blockchain ở quy mô một máy chủ:

- nhật ký chuỗi băm, mỗi mục chứa mã băm của mục trước;
- gốc Merkle được neo mỗi 15 phút;
- quyết định được niêm phong bằng mã băm.

Giới hạn còn lại là **bên làm chứng mặc định nằm cùng máy chủ** (mục 8), nên người quản trị máy chủ về lý thuyết vẫn viết lại được toàn bộ lịch sử. Blockchain gỡ đúng giới hạn này: bên mua, nhà cung cấp, ngân hàng và kiểm toán cùng giữ một sổ cái mà không bên nào sửa một mình được.

**Nguyên tắc:**

- **Engine vẫn chạy ngoài chuỗi.** Luật, 9 bước và tính tiền bằng Decimal giữ nguyên trong Python. Blockchain chỉ ghi nhận kết quả và kiểm chữ ký, không quyết định thay engine.
- **Chỉ ghi mã băm lên chuỗi.** Không ghi nội dung hợp đồng, chứng từ hay dữ liệu cá nhân, vì dữ liệu trên chuỗi không xoá được. Nhật ký hiện đã lưu dữ liệu cá nhân dạng HMAC.
- **Không dùng tiền mã hoá.** Tiền vẫn chuyển bằng VND qua ngân hàng. Chuỗi chỉ giữ "khoá" cho biết lệnh chi đã đủ điều kiện hay chưa.

**Gắn vào từng bước của quy trình:**

| Bước trong quy trình | Hiện có | Ghi lên blockchain | Được gì |
| --- | --- | --- | --- |
| Ký hợp đồng | Chữ ký gắn mã băm SHA-256 của văn bản; chứng thư mô phỏng | Mã băm văn bản đã ký, mã băm bộ điều khoản đã khoá, phiên bản policy áp dụng | Các bên có chung một bản gốc. Sửa điều khoản sau khi ký là bị phát hiện ngay |
| Nộp chứng từ, phê duyệt, tranh chấp | Mỗi sự kiện là một mục nhật ký chuỗi băm | Không ghi từng sự kiện. Chỉ ghi gốc Merkle của cả lô, mỗi 15 phút như hiện nay | Khoảng 96 giao dịch mỗi ngày, bất kể số sự kiện. Chứng minh một sự kiện có trong lô bằng đường kiểm Merkle đã có (`/trust/anchors/proof`) |
| Engine ra quyết định | Niêm phong quyết định (mã băm đầu vào, luật, đầu ra); gói kiểm chứng chạy lại bằng Python | Mã niêm phong của quyết định | `tools/verify_decision.py` kiểm thêm được "quyết định này đã có trên chuỗi trước khi chi" |
| Ngoại lệ hai người | Nhật ký ghi người đề xuất và người duyệt | Chữ ký của cả hai người trên cùng mã băm đề xuất (đa chữ ký) | Không một quản trị viên nào tự tạo ra ngoại lệ |
| Lệnh chi | Lệnh chi mang mã băm quyết định; khoá chống trùng | Hợp đồng thông minh "khoá giải ngân" cho từng mốc, chỉ mở khi đủ ba điều kiện: có niêm phong quyết định Chi đủ hoặc Chi sau trừ phạt, số tiền không vượt số được chi, đủ chữ ký người duyệt. Ngân hàng đọc trạng thái khoá trước khi chuyển tiền | Không chi hai lần, không chi vượt, kể cả khi máy chủ CodeCash bị chiếm quyền |
| Kiểm toán | Kiểm toán xem mã băm; dấu thời gian RFC 3161 là tuỳ chọn | Kiểm toán, ngân hàng, cơ quan quản lý chạy nút chỉ đọc | Ai cũng tự kiểm được, không phải tin máy chủ của đội |

**Lộ trình:**

| Giai đoạn | Việc | Thay đổi trong mã |
| --- | --- | --- |
| 1. Neo lên chuỗi | Gửi gốc Merkle của mỗi lần neo lên blockchain, song song với bên làm chứng cục bộ và TSA | Thêm `BlockchainAnchorProvider` theo giao diện `AnchorProvider` đã có (`apps/api/src/trust/anchor-provider.ts`); `tools/verify_audit.py` kiểm thêm giao dịch neo. Engine và workflow không đổi |
| 2. Niêm phong hợp đồng và quyết định | Ghi mã băm hợp đồng đã ký và mã niêm phong từng quyết định | Gói kiểm chứng kèm bằng chứng trên chuỗi |
| 3. Sổ cái liên tổ chức | Bên mua, nhà cung cấp, ngân hàng mỗi bên giữ một nút. Khoá giải ngân chạy trên chuỗi | Adapter thanh toán đã có (Idempotency-Key, HMAC) chỉ gửi lệnh khi khoá đã mở |

**Nền tảng:**

- **Giai đoạn 3** cần chuỗi cấp phép, chỉ các tổ chức tham gia hợp đồng mới được ghi, ví dụ Hyperledger Fabric hoặc Hyperledger Besu.
- **Giai đoạn 1** chỉ cần nơi ghi mã băm có dấu thời gian, nên có thể dùng nền tảng blockchain dùng chung trong nước, hoặc một chuỗi công khai mà chỉ ghi mã băm.

Chọn nền tảng nào cần đánh giá thêm về pháp lý, chi phí và độ trễ.

**Blockchain không giải quyết được:**

- **Dữ liệu đầu vào sai vẫn sai.** Biên bản giả ghi lên chuỗi vẫn là biên bản giả. Vẫn cần kiểm thẩm quyền, ngoại lệ hai người và ký số hợp lệ.
- **Mục ghi sau lần neo cuối chỉ được bảo vệ từ lần neo kế tiếp**, giống hiện nay. Muốn thu hẹp khoảng hở thì rút ngắn chu kỳ neo.
- **Khoá ký của engine và của các bên phải giữ trong thiết bị bảo mật phần cứng (HSM).** Mất khoá là mất quyền mở khoá giải ngân.
- **Đổi luật vẫn phải chạy thử trên 405 mốc trước khi công bố.** Hợp đồng thông minh không chứa bộ luật, để không phải triển khai lại hợp đồng mỗi lần đổi luật.
