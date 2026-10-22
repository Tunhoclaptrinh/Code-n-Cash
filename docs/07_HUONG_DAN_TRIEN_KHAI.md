# Hướng dẫn triển khai

Tài liệu cho người dựng môi trường demo/staging hoặc production một máy chủ. Phát triển local xem [README](../README.md); quy ước code giao diện xem [08 — Phát triển giao diện](08_HUONG_DAN_PHAT_TRIEN_UI.md).

## 1. Kiến trúc triển khai

```text
Trình duyệt ──HTTPS──▶ Reverse proxy TLS trên host (Caddy hoặc nginx)
                         │  127.0.0.1:8080
                         ▼
                 web  (nginx: SPA + proxy /api)
                         │  http://api:3000
                         ▼
                 api  (NestJS + engine Python CLI) ──▶ volume uploads (/data)
                         │  mongodb://mongo:27017/?replicaSet=rs0
                         ▼
                 mongo (MongoDB 7, replica set 1 node) ──▶ volume mongo-data
```

| Thành phần | Image | Ghi chú |
| --- | --- | --- |
| `web` | `Dockerfile`, target `web` | nginx phục vụ `apps/web/dist`, fallback SPA, cache `/assets` 1 năm, proxy `/api` sang API, giới hạn upload 25 MB |
| `api` | `Dockerfile`, target `api` | Node 24 + Python 3; chạy `node apps/api/dist/main.js`, gọi `apps/engine/cli.py` cho Data Pack; healthcheck `/api/v1/health` |
| `mongo` | `mongo:7.0` | Replica set `rs0` để giao dịch dữ liệu cùng audit; **không publish cổng ra host** |

Cả ba khai báo trong [`infra/compose.prod.yaml`](../infra/compose.prod.yaml). CI (job `docker` trong [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) build hai image, chạy đủ stack này và chạy smoke HTTP qua nginx ở mỗi lần push.

## 2. Yêu cầu máy chủ

- Linux x86_64, tối thiểu 2 vCPU, 4 GB RAM, 20 GB đĩa.
- Docker Engine 24+ và Docker Compose v2 (`docker compose version`).
- Tên miền trỏ về IP máy chủ; mở cổng 80 và 443. Không cần cài Node/pnpm/Python trên host.

## 3. Lần triển khai đầu tiên

```bash
git clone <repo> codecash && cd codecash
git checkout <nhánh hoặc tag phát hành>
cp .env.production.example .env.production
openssl rand -hex 48            # dán vào JWT_SECRET
```

Sửa `.env.production`:

| Biến | Bắt buộc | Giá trị |
| --- | --- | --- |
| `JWT_SECRET` | Có | Chuỗi ngẫu nhiên ≥ 48 byte. API từ chối khởi động nếu trống |
| `WEB_ORIGIN` | Có | Origin công khai, ví dụ `https://codecash.example.com` |
| `SEED_PASSWORD` | Lần đầu | Mật khẩu cho 5 tài khoản mẫu; xóa sau lần khởi động đầu (mục 4) |
| `MONGO_URI` | Không | Để trống dùng container `mongo`; điền URI cluster quản lý (Atlas…) nếu có |
| `ENGINE_URL` | Không | URL worker engine chạy riêng; để trống thì API gọi CLI Python trong image. Bộ dữ liệu tải lên luôn chạy bằng CLI trong image |
| `DEMO_LOGIN` | Không | `true` bật menu "Tài khoản demo" ở trang đăng nhập (đăng nhập không cần mật khẩu bằng 5 tài khoản mẫu). Mặc định tắt khi `NODE_ENV=production`; chỉ bật cho bản demo |
| `WEB_BIND`, `WEB_PORT` | Không | Mặc định `127.0.0.1:8080`, chỉ reverse proxy trên host truy cập được |
| `IMAGE_PREFIX`, `IMAGE_TAG` | Không | Tên image khi đẩy lên registry (mục 7) |

Build và chạy (từ thư mục gốc repo):

```bash
docker compose -f infra/compose.prod.yaml --env-file .env.production up -d --build --wait
docker compose -f infra/compose.prod.yaml --env-file .env.production ps
```

Nếu máy có pnpm: `pnpm docker:up` / `pnpm docker:down` là cùng lệnh. `--wait` chỉ trả về khi cả ba service healthy; lần đầu mất vài phút để build.

Kiểm tra:

```bash
curl -s http://127.0.0.1:8080/healthz                 # ok
curl -s http://127.0.0.1:8080/api/v1/health           # "storage":"mongo"
```

## 4. Sau lần khởi động đầu

1. Đăng nhập `admin@novaan.vn` bằng `SEED_PASSWORD`.
2. **Quản trị hệ thống → Người dùng**: bấm biểu tượng chìa khóa ở từng tài khoản để đặt mật khẩu riêng (≥ 12 ký tự). Mật khẩu đổi xong thì token cũ hết hiệu lực.
3. Xóa giá trị `SEED_PASSWORD` trong `.env.production`, rồi áp dụng:
   `docker compose -f infra/compose.prod.yaml --env-file .env.production up -d --wait api`

Seed chỉ chạy khi bảng người dùng trống, nên giữ hay xóa biến không ghi đè tài khoản đã có; xóa để tránh lộ mật khẩu mặc định.

## 5. HTTPS

Container `web` chỉ nghe HTTP trên `127.0.0.1:8080`. Đặt TLS ở host. Cách nhanh nhất là [Caddy](https://caddyserver.com/docs/install) (tự cấp và gia hạn chứng chỉ Let's Encrypt):

```caddyfile
# /etc/caddy/Caddyfile
codecash.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8080
}
```

```bash
sudo systemctl reload caddy
```

Dùng nginx + certbot cũng được: `proxy_pass http://127.0.0.1:8080;`, đặt `client_max_body_size 25m;` và chuyển tiếp `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`.

## 6. Cập nhật và quay lui

```bash
git fetch --tags && git checkout <tag mới>
docker compose -f infra/compose.prod.yaml --env-file .env.production up -d --build --wait
docker image prune -f
```

Quay lui: `git checkout <tag cũ>` rồi chạy lại lệnh trên. Dữ liệu nằm trong volume nên không mất khi rebuild. Sao lưu (mục 8) trước mọi bản cập nhật đổi cấu trúc dữ liệu.

## 7. Dùng registry thay vì build trên máy chủ (tuỳ chọn)

Build một lần ở máy CI/máy dev, máy chủ chỉ pull:

```bash
# Máy build
export IMAGE_PREFIX=ghcr.io/<owner>/codecash IMAGE_TAG=v0.2.0
docker compose -f infra/compose.prod.yaml --env-file .env.production build
docker compose -f infra/compose.prod.yaml --env-file .env.production push

# Máy chủ: đặt IMAGE_PREFIX, IMAGE_TAG giống trên trong .env.production
docker compose -f infra/compose.prod.yaml --env-file .env.production pull
docker compose -f infra/compose.prod.yaml --env-file .env.production up -d --no-build --wait
```

## 8. Sao lưu và khôi phục

Tên volume có tiền tố project `codecash_`.

```bash
# MongoDB
docker compose -f infra/compose.prod.yaml --env-file .env.production exec -T mongo \
  mongodump --archive --gzip --db codecash > backup/mongo-$(date +%F).archive.gz

# Tệp PDF và bộ dữ liệu Data Pack đã tải lên (/data/uploads, /data/datasets)
docker run --rm -v codecash_uploads:/data -v "$PWD/backup":/backup alpine \
  tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

Khôi phục:

```bash
docker compose -f infra/compose.prod.yaml --env-file .env.production exec -T mongo \
  mongorestore --archive --gzip --drop < backup/mongo-YYYY-MM-DD.archive.gz
docker run --rm -v codecash_uploads:/data -v "$PWD/backup":/backup alpine \
  sh -c "cd /data && tar xzf /backup/uploads-YYYY-MM-DD.tgz"
```

Đặt hai lệnh sao lưu vào cron hằng ngày và chép bản sao ra ngoài máy chủ. Lệnh `down -v` **xóa volume**; chỉ dùng khi muốn làm sạch hoàn toàn.

## 9. Nhật ký và theo dõi

```bash
docker compose -f infra/compose.prod.yaml --env-file .env.production ps        # trạng thái healthcheck
docker compose -f infra/compose.prod.yaml --env-file .env.production logs -f api
```

Mỗi phản hồi API có header `x-request-id`; log API ghi cùng mã đó, dùng để tra lỗi người dùng báo. Theo dõi uptime bằng `GET /healthz` (nginx) và `GET /api/v1/health` (API).

## 10. MongoDB quản lý

Với dữ liệu thật nên dùng cluster quản lý (MongoDB Atlas hoặc tương đương) có xác thực, TLS và sao lưu tự động. Điền `MONGO_URI` trong `.env.production` (URI phải hỗ trợ transaction, tức replica set hoặc cluster), rồi chỉ chạy `api` và `web`:

```bash
docker compose -f infra/compose.prod.yaml --env-file .env.production up -d --build --wait --no-deps api web
```

## 11. Chạy không dùng Docker

Cần Node 24, pnpm (theo `packageManager`), Python 3.9+, MongoDB replica set.

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm build
NODE_ENV=production API_HOST=127.0.0.1 STORAGE_DRIVER=mongo \
  MONGO_URI=... JWT_SECRET=... DATA_DIR=/var/lib/codecash node apps/api/dist/main.js
```

Chạy lệnh trên bằng systemd hoặc PM2. Phục vụ `apps/web/dist` bằng nginx với cấu hình như [`infra/nginx/default.conf.template`](../infra/nginx/default.conf.template) (thay `${API_UPSTREAM}` bằng `http://127.0.0.1:3000`).

## 12. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| `mongo` mãi `unhealthy` | Replica set chưa khởi tạo, hoặc volume cũ có cấu hình host khác | Xem `logs mongo`; với dữ liệu thử có thể xóa volume `codecash_mongo-data` |
| API dừng ngay với `JWT_SECRET is required` | Thiếu `JWT_SECRET` | Điền vào `.env.production` |
| API dừng với `Production requires STORAGE_DRIVER=mongo` | Chạy production bằng kho file | Production luôn dùng Mongo; compose đã đặt sẵn |
| Trình duyệt báo 502 | `api` chưa healthy hoặc đang khởi động lại | `ps`, `logs api` |
| Upload báo 413 | Tệp > 20 MB, hoặc reverse proxy host giới hạn thấp hơn | Đặt `client_max_body_size 25m` ở proxy host |
| Trang Data Pack lỗi khi đánh giá | Python không chạy được hoặc thiếu Data Pack trong image | `logs api`; image phải chứa `BangD-Case4/DataPack-CASE4_SmartContractWorkflow` |
| Tải bộ dữ liệu báo 422 `DATASET_INVALID …` | Thiếu tệp bắt buộc hoặc thiếu cột so với Data Pack chính thức | Xem danh sách tệp trên trang Data Pack; bổ sung rồi tải lại |
| Tải bộ dữ liệu báo 413 | Vượt 25 MB mỗi lần gửi (`client_max_body_size` của nginx) | Nén thư mục thành ZIP hoặc tải ít tệp hơn mỗi lần |
| Đăng nhập được nhưng lập tức bị đẩy ra | Đổi `JWT_SECRET` hoặc mật khẩu làm token cũ vô hiệu | Đăng nhập lại |

## 13. Trước khi dùng cho hồ sơ thật

Bản này đủ cho demo, staging và thử nghiệm nội bộ. Còn các điểm sau, cần xử lý hoặc chấp nhận có ý thức:

- MongoDB trong compose **không bật xác thực**; an toàn dựa vào việc không publish cổng. Dữ liệu thật nên dùng cluster quản lý (mục 10) hoặc bật `--auth` kèm keyFile.
- Luồng ký số là **mô phỏng**, chưa tích hợp CA; nút tải bản đã ký đang tắt.
- Dữ liệu workflow là bộ hợp đồng mẫu; Data Pack 100 hợp đồng/405 mốc chỉ được đánh giá ở trang Data Pack, chưa nhập thành hợp đồng thao tác được.
- Swagger `/api/docs` mở công khai qua nginx; chặn ở reverse proxy nếu không cần.
- `DEMO_LOGIN` phải để `false`: khi bật, ai mở trang đăng nhập cũng vào được bằng tài khoản mẫu.
- Ma trận phân quyền nằm trong `packages/contracts/permissions.json` và được đóng vào image; đổi quyền là đổi mã, cần review hai người (SoD-4), không sửa trên giao diện.
- Chưa có giới hạn tần suất đăng nhập, cảnh báo tự động hay sao lưu tự động; API chạy một instance.
- Accuracy chỉ đo trên 20 mẫu công khai, không đại diện cho toàn bộ 405 mốc.
