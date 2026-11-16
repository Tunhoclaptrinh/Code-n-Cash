# CodeCash — Smart Contract Workflow

Sản phẩm của đội **Code & Cash**, Festival Chuyển đổi số 2026, Bảng D, Case 4.

CodeCash chạy hợp đồng có điều kiện thanh toán từ ký đến chi: số hoá điều khoản, ký theo trình tự, nộp chứng từ, phê duyệt, xử lý tranh chấp, rồi để engine Python chấm từng mốc theo bộ luật và ra quyết định **Chi đủ (RELEASE) / Tạm giữ (HOLD) / Từ chối (REJECT) / Chi sau trừ phạt (PENALTY)** kèm số tiền, lý do và truy vết. Chưa đủ căn cứ thì không chi.

## Chức năng chính

| Trạng thái | Chức năng |
| --- | --- |
| Đã triển khai | Engine 9 bước: khử trùng lặp, kiểm thẩm quyền, đủ chứng từ, tranh chấp, từ chối, quorum theo vai trò, trễ hạn, chọn luật khớp đầu tiên, tính tiền bằng Decimal, độ tin cậy, trace |
| Đã triển khai | Workflow trực tiếp: nộp chứng từ, phê duyệt theo vai trò, mở và đóng tranh chấp, lệnh chi; engine chạy lại sau mỗi thao tác |
| Đã triển khai | Phân quyền 8 vai trò theo tổ chức, kiểm ở API; ngoại lệ chứng từ cần hai người khác nhau |
| Đã triển khai | Nhật ký chuỗi băm, niêm phong quyết định, neo gốc Merkle tự động; gói kiểm chứng chạy lại bằng Python ngoài hệ thống |
| Đã triển khai | Phiên bản luật có kiểm soát (chứng minh an toàn, xem tác động trên 405 mốc); hoá đơn có kiểm hợp lệ; phụ lục dời hạn và thanh lý cho hợp đồng tạo trong ứng dụng |
| Đã triển khai | Trang Kết quả Data Pack: 405 dòng theo mẫu BTC, KPI, tải CSV, chạy trên bộ dữ liệu tải lên |
| Mô phỏng | Ký số với chứng thư mô phỏng; cổng thanh toán mô phỏng (đã có adapter HTTP); AI đọc PDF chỉ đề xuất 6 điều khoản |
| Định hướng | Ký qua tổ chức chứng thực được cấp phép; nối cổng ngân hàng thật; phụ lục đổi giá trị hoặc tỷ lệ thanh toán |
| Định hướng | Blockchain trong quy trình: neo gốc Merkle và niêm phong quyết định lên sổ cái dùng chung, khoá giải ngân liên tổ chức; engine vẫn chạy ngoài chuỗi ([tài liệu sản phẩm](docs/TAI_LIEU_SAN_PHAM.md) mục 9.1) |

Chi tiết: [tài liệu sản phẩm](docs/TAI_LIEU_SAN_PHAM.md) và [đặc tả nghiệp vụ](docs/NGHIEP_VU.md).

## Cấu trúc thư mục

```text
apps/
  web/                  React 19, Router 7, Ant Design 6, i18next (Việt/Anh), TanStack Query
  api/                  NestJS: xác thực, phân quyền, workflow, tài liệu, nhật ký; src/domain: nạp Data Pack, seed, hành động nghiệp vụ
  engine/               Engine Python (codecash_engine), CLI xuất 405 dòng + trace + KPI, bộ ca tổng hợp
  signer/               Dịch vụ ký từ xa mô phỏng
packages/
  ui/                   Thành phần giao diện dùng chung
  contracts/            Kiểu dữ liệu và định nghĩa resource dùng chung
  api-client/           HTTP client có kiểu
  config/               Cấu hình TypeScript dùng chung
tools/                   Kiểm chứng nghiệp vụ, kiểm thử đột biến, verify_decision.py, verify_audit.py
tests/                   Kiểm thử Python (engine, đặc tả, golden) và tests/foundation (API, workflow, nhật ký)
scripts/                 Smoke test HTTP và trình duyệt
infra/                   compose.yaml (MongoDB local), compose.prod.yaml (production), nginx/
docs/                    Tài liệu sản phẩm, đặc tả nghiệp vụ, API, sơ đồ, slide
BangD-Case4/             Đề và Data Pack của BTC, giữ nguyên
```

## Yêu cầu môi trường

- Node.js 24 (xem `.nvmrc`) và pnpm 12.14.0 (qua corepack).
- Python 3.9 trở lên (CI dùng 3.12). Engine chỉ dùng thư viện chuẩn, không cần `pip install`.
- Xem trước tệp PDF/DOCX và đọc PDF tải lên cần LibreOffice Writer và Poppler (`pdftotext`, `pdftoppm`). Thiếu hai công cụ này thì các chức năng khác vẫn chạy. Image Docker đã cài sẵn.
- Docker chỉ cần khi chạy MongoDB hoặc bản production.

Trên Windows: đặt `PYTHONUTF8=1`, trỏ `LIBREOFFICE_BIN` tới `soffice.exe` trong `.env`, và chạy `pnpm dev` từ PowerShell (bản `pdftotext` đi kèm Git Bash thiếu tuỳ chọn hệ thống cần).

## Thư viện và dịch vụ bên ngoài

- Phụ thuộc JavaScript khoá trong `pnpm-lock.yaml`. Thư viện nền: React, Ant Design, NestJS, MongoDB driver.
- Phần đội tự xây dựng: engine và bộ luật, policy pack, phân quyền, workflow, nhật ký chuỗi băm, giao diện.
- AI API: Google Gemini, chỉ khi bật `EXTRACTION_PROVIDER=gemini` và có `GEMINI_API_KEY`, dùng để đề xuất điều khoản từ PDF. Mặc định dùng bộ trích xuất local. AI không tham gia quyết định thanh toán.
- Ký số và cổng thanh toán là mô phỏng. Dấu thời gian RFC 3161 là tuỳ chọn (`TSA_URL`).
- Bản demo trên cloud chạy bằng `Dockerfile.standalone`; sản phẩm chạy local đầy đủ, không cần Internet.

## Cài đặt và chạy

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

- Web: <http://127.0.0.1:5173>
- API: <http://127.0.0.1:3000/api/v1> · Swagger: <http://127.0.0.1:3000/api/docs> · cách đọc và gọi API: [docs/API.md](docs/API.md)
- Chạy riêng: `pnpm dev:web`, `pnpm dev:api`, `pnpm dev:signer`.

Mặc định dữ liệu lưu ở `.data/`, không cần Docker. Lần khởi động đầu, API nạp toàn bộ Data Pack (100 hợp đồng, 405 mốc, 1.134 sự kiện), thêm dữ liệu bổ sung có đánh dấu (tài khoản, thứ tự ký, 4 hợp đồng demo CT0101–CT0104) và chạy engine một lượt.

### MongoDB local

```bash
pnpm infra:up
# Trong .env:
# STORAGE_DRIVER=mongo
# MONGO_URI=mongodb://127.0.0.1:27017/codecash?replicaSet=rs0
pnpm dev
```

MongoDB cần replica set vì mỗi thao tác ghi dữ liệu và nhật ký trong cùng một giao dịch.

## Chạy demo

Hướng dẫn từng màn có ảnh: nút **Hướng dẫn** trong ứng dụng (bản Markdown ở `apps/web/src/guide/vi/`). Trường hợp điển hình là hợp đồng **CT0103, mốc 2**: giao hàng trễ 2 ngày sau ân hạn, phê duyệt xong thì engine trừ phạt 2,22 triệu và chi 737,78 triệu.

Về dữ liệu ban đầu: đăng nhập `sysadmin@codecash.vn`, mở menu tài khoản, chọn **Khôi phục dữ liệu demo**. Dữ liệu và nhật ký cũ được lưu trữ, không bị xoá.

## Tài khoản demo

Đăng nhập bằng menu **Tài khoản demo** ở trang đăng nhập, hoặc email với mật khẩu local `Passw0rd!` (chỉ dùng cho dữ liệu mẫu; production đặt qua `SEED_PASSWORD`).

| Tài khoản | Vai trò |
| --- | --- |
| `owner@novaan.vn` | Chủ hợp đồng (Nova An, bên mua B010) |
| `finance@novaan.vn` | Phê duyệt tài chính |
| `secondary@novaan.vn` | Phê duyệt cấp 2 |
| `legal@novaan.vn` | Cán bộ hợp đồng bên mua |
| `supplier@phuminh.vn` | Nhà cung cấp (Phú Minh, S015) |
| `controller@novaan.vn` | Kiểm soát viên của Nova An: duyệt đề nghị ngoại lệ chứng từ do chủ hợp đồng đề xuất (hai người khác nhau) |
| `controller@phuminh.vn` | Kiểm soát viên của Phú Minh: theo dõi, không thao tác nghiệp vụ |
| `sysadmin@codecash.vn` | Quản trị hệ thống: tài khoản, tổ chức, mẫu mốc, tham số |
| `auditor@codecash.vn` | Kiểm toán: chỉ kiểm tra toàn vẹn (băm, bằng chứng), không mở hợp đồng |

Tổng cộng 102 tài khoản mẫu: 30 người phê duyệt của Data Pack; mỗi bên mua một cán bộ hợp đồng và một kiểm soát viên; mỗi nhà cung cấp một tài khoản và một kiểm soát viên; cộng quản trị hệ thống và kiểm toán. Vai trò và quyền: [đặc tả nghiệp vụ](docs/NGHIEP_VU.md) mục 2.

## Dữ liệu mẫu và đầu ra

Dữ liệu vào là Data Pack chính thức trong `BangD-Case4/DataPack-CASE4_SmartContractWorkflow/` (snapshot 18/10/2026), giữ nguyên. Chạy engine trên Data Pack:

```bash
python3 apps/engine/cli.py --output out
```

Đầu ra: `submission_output.csv` (đúng 22 cột, 405 dòng theo mẫu BTC), `audit.json` (trace từng dòng), `metrics.json` (KPI). Trên Data Pack: RELEASE 348, HOLD 36, PENALTY 15, REJECT 6; tổng chi 365.785,87 triệu, tổng phạt 102,13 triệu; 20/20 mẫu có nhãn khớp.

Chạy trên bộ dữ liệu khác (ví dụ dữ liệu chấm của BTC), từ thư mục CSV rời hoặc tệp ZIP:

```bash
python3 apps/engine/cli.py --data duong/dan/bo-du-lieu --inspect          # tệp nào đủ, thiếu, thiếu cột
python3 apps/engine/cli.py --data duong/dan/bo-du-lieu --output out-hidden
```

Bắt buộc 5 tệp `contracts`, `parties`, `milestones`, `events`, `payment_rules`. Mặc định luôn xuất đủ template, bỏ qua `*test_ids*.csv`. Profile bài nộp dừng nếu vi phạm bất biến, không xuất CSV có thể bị hiểu nhầm là hợp lệ. Trên web: trang **Kết quả Data Pack**, nút **Tải bộ dữ liệu lên**.

## Kiểm thử và tái lập KPI

```bash
pnpm check                                   # typecheck + lint + format:check + build + test
python3 tools/kiem_chung_nghiep_vu.py --check  # kiểm mẫu và bất biến trên 405 mốc
python3 apps/engine/benchmark.py             # bộ ca tổng hợp: 33 kịch bản áp lên 405 mốc
python3 tools/mutation_check.py              # bộ ca có bắt được 16 lỗi cài vào engine không
python3 tools/verify_audit.py --records .data/records.json   # kiểm độc lập chuỗi nhật ký
pnpm test:e2e                                # cần API đang chạy
pnpm test:browser                            # cần web + API đang chạy và Google Chrome
```

KPI, tập đo, baseline và giới hạn: [đặc tả nghiệp vụ](docs/NGHIEP_VU.md) mục 10.

## Triển khai

```bash
cp .env.production.example .env.production   # điền JWT_SECRET, WEB_ORIGIN, SEED_PASSWORD
docker compose -f infra/compose.prod.yaml --env-file .env.production up -d --build --wait
```

Stack gồm nginx (SPA + proxy `/api`), API (kèm engine Python) và MongoDB replica set. HTTPS, sao lưu, cập nhật và xử lý sự cố: [docs/07](docs/07_HUONG_DAN_TRIEN_KHAI.md).

## Giới hạn và lưu ý

- Mọi quyết định và số tiền do engine Python đưa ra (policy `CASE4_BTC` 2.1.0); trình duyệt và API không tự quyết định.
- Độ chính xác chỉ đo được trên 20 mẫu có nhãn, và engine được viết khi đã đọc 20 mẫu này. Không suy ra độ chính xác trên 405 mốc; bộ ca tổng hợp do đội gán đáp án nên đo độ phủ, không thay được tập ẩn của BTC.
- Điểm BTC chưa chốt (hoá đơn bắt buộc khi `invoice_required = TRUE`, ai được đóng tranh chấp) được đo độ nhạy và phản ánh vào độ tin cậy, không đổi quyết định. Tranh chấp tính theo mốc.
- Ký số và chi tiền là mô phỏng, chưa có giá trị pháp lý, chưa thanh toán thật. Kiểm một PDF bên ngoài chỉ báo **chưa xác minh** nếu mới nhận diện cấu trúc chữ ký.
- Chế độ lưu file chỉ dành cho một tiến trình local; production bắt buộc MongoDB và `JWT_SECRET`.
- Kết quả là mô phỏng theo phạm vi đề bài, không phải quyết định pháp lý hay giải ngân thực tế.
