# CodeCash — Smart Contract Workflow

Monorepo cho Case 4, Bảng D: số hóa hợp đồng, ký theo trình tự, nộp bằng chứng, phê duyệt, xử lý tranh chấp và đánh giá điều kiện thanh toán.

**Nhận việc hoặc sửa tiếp:** bắt đầu ở [hướng dẫn tiếp quản](docs/30_HUONG_DAN_TIEP_QUAN_VA_PHAT_TRIEN_TIEP.md): cách chạy, bản đồ mã nguồn, điểm nối, fixture kiểm thử, việc còn mở và mẫu bàn giao. Tích hợp engine/AI xem thêm [tài liệu 29](docs/archive/29_BAN_GIAO_TICH_HOP_ENGINE_VA_AI.md).

## Khởi chạy

Yêu cầu: Node.js 24 (xem `.nvmrc`), pnpm 12.14.0 (qua corepack), Python 3.9 trở lên (CI dùng 3.12). Không cần cài thư viện Python cho engine hiện tại.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

- Web: <http://127.0.0.1:5173>
- API: <http://127.0.0.1:3000/api/v1>
- Swagger: <http://127.0.0.1:3000/api/docs>
- Chạy riêng: `pnpm dev:web`, `pnpm dev:api`.

Chế độ local mặc định lưu dữ liệu ở `.data/`, không cần Docker. Lần khởi động đầu, API nạp toàn bộ Data Pack (100 hợp đồng, 405 mốc, 1.134 sự kiện) làm dữ liệu sống, thêm dữ liệu bổ sung có đánh dấu (tài khoản, thứ tự ký, 4 hợp đồng demo CT0101–CT0104) và chạy engine một lượt. Đăng nhập bằng menu **Tài khoản demo** ở trang đăng nhập, hoặc email với mật khẩu local `Passw0rd!`:

| Tài khoản | Vai trò |
| --- | --- |
| `owner@novaan.vn` | Chủ hợp đồng (Nova An, bên mua B010) |
| `finance@novaan.vn` | Phê duyệt tài chính |
| `secondary@novaan.vn` | Phê duyệt cấp 2 |
| `legal@novaan.vn` | Cán bộ hợp đồng bên mua |
| `supplier@phuminh.vn` | Nhà cung cấp (Phú Minh, S015) |
| `admin@codecash.vn`, `controller@codecash.vn` | Kiểm soát viên (hai người cho duyệt ngoại lệ BR-19) |
| `sysadmin@codecash.vn` | Quản trị hệ thống: tài khoản, tổ chức, mẫu mốc, tham số |
| `auditor@codecash.vn` | Kiểm toán: chỉ đọc, Kiểm tra toàn vẹn |

Mỗi tổ chức khác trong Data Pack cũng có tài khoản (69 tài khoản). Vai trò và quyền: [đặc tả nghiệp vụ](docs/NGHIEP_VU.md) mục 2. Muốn về dữ liệu ban đầu: đăng nhập tài khoản quản trị hệ thống, mở menu tài khoản, chọn "Khôi phục dữ liệu demo"; dữ liệu và nhật ký cũ được lưu trữ, không bị xoá.

## Cấu trúc

```text
apps/
  web/                  React 19, Router 7, Ant Design 6, i18next, TanStack Query
  api/                  NestJS: auth, quyền, CRUD, tài liệu, audit; src/domain: Data Pack, seed, workflow
  engine/               Adapter Python: Data Pack → CSV chuẩn + trace + KPI
packages/
  ui/                   Base UI chuyển từ UniFlow và chuẩn hóa cho CodeCash
  contracts/            Kiểu trao đổi và định nghĩa resource dùng cho form/API
  api-client/           HTTP client, CRUD client, upload/download
  config/               TypeScript dùng chung
infra/                   compose.yaml (Mongo local), compose.prod.yaml (stack production), nginx/
Dockerfile               Image api (NestJS + engine Python) và web (nginx + SPA)
scripts/                 Smoke test HTTP và trình duyệt
BangD-Case4/              Đề và dữ liệu BTC, giữ nguyên
```

Tài liệu kỹ thuật: [06 — Kiến trúc và tái sử dụng](docs/06_KIEN_TRUC_MONOREPO_VA_TAI_SU_DUNG.md), [07 — Triển khai](docs/07_HUONG_DAN_TRIEN_KHAI.md), [08 — Phát triển giao diện](docs/08_HUONG_DAN_PHAT_TRIEN_UI.md). Nghiệp vụ: [đặc tả nghiệp vụ](docs/NGHIEP_VU.md); tài liệu cũ ở [docs/archive](docs/archive/).

## Kiểm tra

```bash
pnpm check             # typecheck + lint (0 warning) + format:check + build + test
pnpm format            # Prettier cho apps, packages, scripts
pnpm check:data
python3 tools/mutation_check.py   # bộ ca tổng hợp có bắt được 16 lỗi cài vào engine không
python3 tools/verify_audit.py --records .data/records.json   # kiểm độc lập chuỗi audit
pnpm test:e2e          # Cần API đang chạy; tạo/xóa dữ liệu smoke riêng
pnpm test:browser      # Cần web + API đang chạy và Google Chrome; ảnh lưu ở artifacts/browser
```

`pnpm test` gồm bộ kiểm chứng nghiệp vụ Python, adapter đầu ra và kiểm thử nền API/workflow. CI chạy cùng các lệnh này và kiểm tra HTTP với thư mục dữ liệu tạm. TypeScript 5.9 dùng cho tooling/API để tương thích ESLint; ứng dụng web tiếp tục dùng TypeScript 7.

## Đánh giá Data Pack

Vào **Kết quả Data Pack** để chạy đánh giá, xem quyết định/trace và tải CSV. Hoặc:

```bash
python3 apps/engine/cli.py --output artifacts/run-local
```

Chạy từ đầu trên bộ dữ liệu khác (ví dụ khi BTC phát dữ liệu chấm): trên trang Data Pack chọn **Tải bộ dữ liệu lên**, hoặc dùng CLI với thư mục chứa CSV rời hay ZIP của Data Pack:

```bash
python3 apps/engine/cli.py --data duong/dan/bo-du-lieu --inspect          # tệp nào đủ, thiếu, thiếu cột
python3 apps/engine/cli.py --data duong/dan/bo-du-lieu --output artifacts/run-hidden
```

Bắt buộc 5 tệp `contracts`, `parties`, `milestones`, `events`, `payment_rules`. Không có template thì dựng 22 cột theo `milestones.csv`; mặc định luôn xuất đủ template, bỏ qua `*test_ids*.csv`; `--apply-scope` chỉ dành cho chẩn đoán riêng, không dùng cho bài nộp. Profile bài nộp dừng nếu vi phạm bất biến, không xuất CSV có thể bị hiểu nhầm là hợp lệ. Profile workflow giữ diagnostic để kiểm tra nhưng API chặn ghi giao dịch khi kết quả vi phạm.

Đầu ra: `submission_output.csv` đúng 22 cột/405 dòng, `audit.json`, `metrics.json`. Adapter gọi đúng bộ quy tắc đang được kiểm chứng, dùng Decimal, giữ sáu trường BTC điền sẵn. Accuracy chỉ công bố trên 20 mẫu công khai; độ phủ 405 mốc không phải ground truth toàn bộ.

Có thể chạy worker riêng bằng `pnpm dev:engine` và đặt `ENGINE_URL=http://127.0.0.1:8000` để trang Data Pack gọi worker thay vì CLI; workflow trực tiếp và bộ dữ liệu tải lên vẫn chạy CLI.

## MongoDB local

```bash
pnpm infra:up
# Trong .env:
# STORAGE_DRIVER=mongo
# MONGO_URI=mongodb://127.0.0.1:27017/codecash?replicaSet=rs0
pnpm dev:api
```

Mongo cần replica set để giao dịch cập nhật dữ liệu cùng audit. Chế độ file dành cho một tiến trình local; production bắt buộc Mongo và `JWT_SECRET`. Không sao chép `.env`, tài khoản dịch vụ hoặc khóa của UniFlow.

## Triển khai

```bash
cp .env.production.example .env.production   # điền JWT_SECRET, WEB_ORIGIN, SEED_PASSWORD
docker compose -f infra/compose.prod.yaml --env-file .env.production up -d --build --wait
```

Stack gồm nginx (SPA + proxy `/api`), API (kèm engine Python) và MongoDB replica set; web nghe ở `127.0.0.1:8080` để đặt sau reverse proxy TLS. HTTPS, sao lưu, cập nhật/quay lui và xử lý sự cố: [docs/07](docs/07_HUONG_DAN_TRIEN_KHAI.md). CI build hai image và chạy smoke qua nginx ở mỗi lần push.

## Phạm vi cần hiểu đúng

- Mọi quyết định (RELEASE/HOLD/REJECT/PENALTY, số tiền, phạt) do engine Python theo đặc tả v1.1 đưa ra trên toàn bộ dữ liệu sau mỗi thao tác; trình duyệt và API không tự quyết định.
- Ký số là mô phỏng, chưa tích hợp CA thật. Kiểm một PDF bên ngoài không báo VALID chỉ vì có `/ByteRange`: trạng thái là **chưa xác minh** nếu mới nhận diện cấu trúc.
- Rà soát điều khoản có extractor local và adapter Gemini đọc PDF thật, đề xuất sáu trường kèm trang/đoạn trích để người dùng đối chiếu. Mốc vẫn theo mẫu quy trình Data Pack; AI không quyết định thanh toán.
- Accuracy chỉ đo trên 20 mẫu công khai; không suy ra cho 405 mốc hay hidden test.
- Kiểm thử cục bộ mặc định dùng kho file riêng; CI có smoke MongoDB qua compose/nginx và image standalone. Cấu hình môi trường triển khai vẫn phải kiểm riêng.

Rà soát theo trả lời BTC: `python3 tools/ra_soat_btc.py` tạo báo cáo kiểm tra 405 mốc và giới hạn kết luận. Xem [đặc tả nghiệp vụ](docs/NGHIEP_VU.md) mục 12. Profile `BTC_SUBMISSION` không áp ngoại lệ của ứng dụng; `--workflow` dành cho nghiệp vụ Silver.

## Bàn giao engine và AI cho Hoàng, Lâm

Không có yêu cầu bắt buộc huấn luyện mô hình trong trả lời BTC đội cung cấp. Ground truth là đáp án chấm; lõi hiện tại chạy luật Data Pack. `pnpm integration:check` sinh JSON/CSV tham chiếu và kiểm 405 mốc; `pnpm integration:check --candidate /tmp/engine-response.json` kiểm module thay thế. Xem [hướng dẫn tích hợp](docs/archive/29_BAN_GIAO_TICH_HOP_ENGINE_VA_AI.md) và [đặc tả nghiệp vụ](docs/NGHIEP_VU.md) mục 10, 12.
