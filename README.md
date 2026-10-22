# CodeCash — Smart Contract Workflow

Monorepo cho Case 4, Bảng D: số hóa hợp đồng, ký theo trình tự, nộp bằng chứng, phê duyệt, xử lý tranh chấp và đánh giá điều kiện thanh toán.

## Khởi chạy

Yêu cầu: Node.js 24 (xem `.nvmrc`), pnpm 12.14.0 (qua corepack), Python 3.9+. Không cần cài thư viện Python cho engine hiện tại.

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

Chế độ local mặc định lưu dữ liệu ở `.data/`, không cần Docker. API tự tạo tài khoản ban đầu khi chưa có dữ liệu; mật khẩu local `Passw0rd!`:

| Tài khoản | Vai trò |
| --- | --- |
| `owner@novaan.vn` | Chủ hợp đồng |
| `legal@novaan.vn` | Pháp chế/nghiệp vụ |
| `finance@novaan.vn` | Phê duyệt tài chính |
| `admin@novaan.vn` | Quản trị/kiểm toán |
| `supplier@phuminh.vn` | Nhà cung cấp |

Tài khoản admin có mục **Quản trị hệ thống**: tổ chức, người dùng, hợp đồng nháp, mẫu milestone, cấu hình, tài liệu và audit. Tài khoản tạo mới có thể đặt mật khẩu ở màn hình Người dùng. Các màn hình workflow cũ giữ route và quy trình; dữ liệu xử lý đã chuyển sang API.

## Cấu trúc

```text
apps/
  web/                  React 19, Router 7, Ant Design 6, i18next, TanStack Query
  api/                  NestJS: auth, quyền, CRUD, tài liệu, workflow, audit
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

Tài liệu kỹ thuật: [06 — Kiến trúc và tái sử dụng](docs/06_KIEN_TRUC_MONOREPO_VA_TAI_SU_DUNG.md), [07 — Triển khai](docs/07_HUONG_DAN_TRIEN_KHAI.md), [08 — Phát triển giao diện](docs/08_HUONG_DAN_PHAT_TRIEN_UI.md). Nghiệp vụ: [hồ sơ](docs/README.md), [đặc tả v1.0](docs/04_DAC_TA_NGHIEP_VU.md).

## Kiểm tra

```bash
pnpm check             # typecheck + lint (0 warning) + format:check + build + test
pnpm format            # Prettier cho apps, packages, scripts
pnpm check:data
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

Bắt buộc 5 tệp `contracts`, `parties`, `milestones`, `events`, `payment_rules`. Không có template thì dựng 22 cột theo `milestones.csv`; có `*test_ids*.csv` thì chỉ xuất các mốc trong đó. Với bộ dữ liệu tải lên, vi phạm bất biến được báo trong `metrics.json` thay vì dừng chạy.

Đầu ra: `submission_output.csv` đúng 22 cột/405 dòng, `audit.json`, `metrics.json`. Adapter gọi đúng bộ quy tắc đang được kiểm chứng, dùng Decimal, giữ sáu trường BTC điền sẵn. Accuracy chỉ công bố trên 20 mẫu công khai; độ phủ 405 mốc không phải ground truth toàn bộ.

Có thể chạy worker riêng bằng `pnpm dev:engine` và đặt `ENGINE_URL=http://127.0.0.1:8000` để API gọi worker thay vì CLI.

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

- Các workflow ký/phê duyệt được chuyển từ bản giao diện hiện có lên server, lưu trạng thái và kiểm danh tính/phạm vi. Luồng ký nhà cung cấp vẫn là mô phỏng; chưa tích hợp CA thật.
- Kiểm một PDF bên ngoài không báo VALID chỉ vì có `/ByteRange`: trạng thái là **chưa xác minh** nếu mới nhận diện cấu trúc.
- Workflow minh họa dùng bộ hợp đồng mẫu ban đầu; đánh giá 100 hợp đồng/405 milestone dùng engine theo đặc tả ở trang Data Pack. Chưa nhập toàn bộ Data Pack thành các hợp đồng có thể sửa/ký trong workflow.
- Các luật mẫu workflow được giữ khi chuyển UI; chưa được coi là bộ thay thế cho engine Data Pack đã kiểm chứng.
- MongoDB có adapter và cấu hình nhưng phải chạy integration test với Mongo thực trước khi triển khai; kiểm thử mặc định dùng kho file.
