# Kiểm tra và khởi chạy trên máy local

Ngày kiểm tra: **17/11/2026**, múi giờ Bangkok/Hà Nội. Bản hiện tại: `7e6767f`, nhánh `feat/late-payment-interest`. Các sửa lỗi local từ `fix/local-development-20261117` được đưa sang có chọn lọc, giữ các tính năng nghiệm thu và lãi chậm trả của nhánh này.

## 1. Cấu hình máy hiện tại

- Node.js 24 qua nvm, pnpm theo `packageManager`, Python 3, LibreOffice, Poppler (`pdftotext`, `pdftoppm`), Google Chrome và Docker Compose.
- Web: <http://127.0.0.1:5173>; API: <http://127.0.0.1:3000/api/v1>; Swagger: <http://127.0.0.1:3000/api/docs>.
- Dữ liệu nghiệp vụ dùng **MongoDB local**, database `codecash`, container `codecash-local-mongo-1`. Không dùng MongoDB Atlas trong `.env` local hiện tại.
- Seed hiện tại: **104 hợp đồng, 417 mốc, 102 tài khoản**; trong đó 100 hợp đồng/405 mốc thuộc Data Pack, còn lại là fixture demo có đánh dấu.
- MongoDB có replica set `rs0` để cập nhật nghiệp vụ và audit cùng giao dịch; chỉ công bố cổng `127.0.0.1:27017`. Volume `codecash-local_mongo-data` giữ dữ liệu khi restart.
- Tệp tải lên/PDF/cache nằm ở `.data/local`; khóa và neo demo ở `.data-trust/local`; dữ liệu của dịch vụ ký mô phỏng ở `.data/signer-local`. Việc giữ tệp/khóa trên đĩa không thay thế database nghiệp vụ MongoDB.

`.env` local đã được sao lưu riêng ở đợt thiết lập trước. Đợt sửa sau đổi nhánh giữ nguyên cấu hình và dữ liệu Mongo local; database cloud không bị truy cập để reset/migrate. Các kiểm thử có thay đổi nghiệp vụ dùng fixture file riêng, không dùng database người dùng đang thao tác.

## 2. Chạy lại

Từ thư mục gốc dự án, trong terminal đã nạp nvm:

```bash
nvm use
pnpm install --frozen-lockfile
pnpm dev:local
```

Docker daemon phải đang chạy trước lệnh trên. Nếu bị tắt trên Ubuntu, chạy `sudo systemctl start docker` và xác thực trong terminal. `pnpm dev:local` chạy `infra:up`, chờ database healthy rồi mới chạy API, Vite và dịch vụ ký. Có thể chạy riêng `pnpm infra:up` rồi `pnpm dev`. Không khởi động thêm lượt thứ hai khi các cổng này đang có dịch vụ chạy.

Các biến cốt lõi trong `.env`:

```dotenv
API_HOST=127.0.0.1
API_PORT=3000
WEB_ORIGIN=http://127.0.0.1:5173,http://localhost:5173
STORAGE_DRIVER=mongo
MONGO_URI=mongodb://127.0.0.1:27017/codecash?replicaSet=rs0
DATA_DIR=.data/local
TRUST_DIR=.data-trust/local
SIGNING_PROVIDER=remote
SIGNER_URL=http://127.0.0.1:3200
EXTRACTION_PROVIDER=local
```

`SIGNER_DATA_DIR` trên máy này dùng đường dẫn tuyệt đối đến `.data/signer-local`. Không ghi đè `.env` bằng file example khi đã có khóa/cấu hình riêng. API và signer cùng đọc `.env`; biến truyền trực tiếp vào tiến trình vẫn được ưu tiên.

Đăng nhập bằng menu **Tài khoản demo**, ví dụ `owner@novaan.vn`, `legal@novaan.vn`, `supplier@phuminh.vn`, `sysadmin@codecash.vn`. Dùng browser profile riêng nếu mở đồng thời các vai trò. Dịch vụ ký là mô phỏng CA qua HTTP local, PIN demo mặc định `123456`; không phải CA được công nhận.

## 3. Các lỗi đã tìm và cách sửa

| Hiện trạng | Xử lý |
| --- | --- |
| `.env` trỏ MongoDB Atlas | Chuyển URI sang loopback và khởi tạo replica set local; không kết nối cloud để chuyển dữ liệu |
| Sau đổi nhánh, Docker daemon tắt nhưng web/signer vẫn chạy | Bật lại Docker, dùng đúng project/volume local; `dev:local` dừng nếu database không khởi động được thay vì mở mỗi giao diện |
| Vite bỏ proxy `/signer-api` | Khôi phục dùng chung proxy API + signer cho dev và preview |
| Signer không đọc `.env` như API | Nạp cùng file cấu hình bằng Node, không ghi đè biến đã truyền vào process |
| Build API không dọn output | Xóa riêng `apps/api/dist` trước `tsc`, tránh file cũ che thư mục module mới |
| Reset demo làm số yêu cầu ký bắt đầu lại, lấy nhầm giao dịch cũ | Khóa idempotency gắn hash payload; signer trả conflict nếu cùng khóa nhưng khác hash/người ký/kênh; API từ chối ghép transaction khác hash |
| Webhook báo ký xong trước lượt polling | Nếu overview đã xác nhận bước của chính người dùng là SIGNED, chuyển đúng trang kiểm tra chữ ký |
| Chrome chưa đóng hết khi dọn profile test | Cho phép thử lại khi xóa profile, tránh che lỗi kiểm thử ban đầu bằng ENOTEMPTY |

Compose có tên project cố định để `pnpm infra:up/down` quản lý đúng container. MongoDB có chính sách restart `unless-stopped`. Các thay đổi ở `extra-docs` của người dùng được giữ nguyên.

## 4. Trích xuất local và Gemini

Phiên local chọn `EXTRACTION_PROVIDER=local` để không phụ thuộc dịch vụ AI ngoài hệ thống. Bộ trích xuất local vẫn yêu cầu bằng chứng rõ, không tự đoán trường thiếu; không bảo đảm OCR cho mọi bản scan. Người dùng phải đối chiếu kết quả.

Khóa và model Gemini hiện có được giữ trong file riêng, không đưa vào Git hay trình duyệt. Lượt kiểm tra ngày 17/11: metadata model trả HTTP 200, nhưng lượt trích xuất PDF trả **HTTP 503 UNAVAILABLE** do model đang quá tải. Không kết luận khóa sai và không dùng kết quả giả thay AI.

Muốn dùng lại AI, đổi `EXTRACTION_PROVIDER=gemini` trong `.env` rồi khởi động lại API; `.env.gemini.local` cung cấp khóa/model. Biến trong `.env` được nạp trước nên có ưu tiên hơn file Gemini. Khi nhà cung cấp lỗi, giao diện phải báo lỗi để thử lại hoặc chọn bộ trích xuất local có chủ đích; không tự chuyển provider ngầm.

## 5. Kiểm tra và xử lý sự cố

```bash
curl http://127.0.0.1:3000/api/v1/health
curl http://127.0.0.1:5173/signer-api/health
docker compose -f infra/compose.yaml ps
pnpm check
pnpm integration:check
pnpm check:btc
```

Health API phải báo `storage: "mongo"`; signer phải báo `service: "codecash-signer"`. Nếu web báo proxy refused, kiểm tra API và signer đã chạy; nếu lỗi transaction Mongo, kiểm tra replica set đã PRIMARY, không chạy Mongo standalone.

Browser smoke có thay đổi dữ liệu: chạy trên API `STORAGE_DRIVER=file`, `DATA_DIR` và `TRUST_DIR` tạm riêng, không chạy HTTP smoke và browser smoke đồng thời trên cùng fixture. Script browser chủ động từ chối Mongo chung. Đợt này luồng ký hai thiết bị dùng API/web/signer fixture riêng ở cổng 3011/5175/3210, không ảnh hưởng yêu cầu ký người dùng. Đợt thiết lập trước đã kiểm luồng tương ứng trên Mongo local.

Kết quả sau sửa:

| Kiểm tra | Kết quả |
| --- | --- |
| `pnpm check` | Đạt typecheck, lint, format, build; 213 test Python, 207 test Node và 24 test web đều đạt |
| `pnpm integration:check` | Đủ 405 mốc, khớp 20/20 mẫu công khai, không khác baseline |
| `pnpm check:btc` | Đạt; không suy ra accuracy trên các nhãn ẩn |
| HTTP smoke, API fixture riêng | Đạt auth, quyền/scope, CRUD, phân trang, rules, upload và pipeline |
| Browser smoke, fixture sạch | Đạt 35 màn hình, desktop/mobile, nút thao tác, hướng dẫn, mẫu/PDF/upload, quyền, rule preview và dữ liệu |
| Ký hai thiết bị, fixture remote riêng | Đạt nhận yêu cầu, cùng mã xác nhận, từ chối PIN sai, ký và chuyển sang kiểm chữ ký |
| Mongo local sau đổi nhánh | API dùng đúng `codecash-local_mongo-data`; giữ nguyên database thay vì dùng volume trống `infra_mongo-data` |
| Lãi chậm trả | Đạt công thức theo ngày, kiểm tra cặp tham số, cộng lãi vào lệnh chuyển, giữ nguyên quyết định/tiền engine và tính lại kỳ hạn sau dispute |
| Build từ output cũ | Tệp `domain/actions.js`/`views.js` cũ được dọn, Node nạp đúng `index.js` hiện hành |

Ảnh/report browser nằm ở `artifacts/browser/`, integration ở `artifacts/integration/`, đối chiếu BTC ở `artifacts/btc-review/` (đều được Git bỏ qua). Đã xem ảnh danh sách hợp đồng, khung đặt ô ký và hướng dẫn mobile. Kết quả này xác nhận các trường hợp đã chạy, không thay thế kiểm tra dịch vụ CA/AI bên ngoài hoặc đáp án hidden của BTC.

Muốn khôi phục demo: đăng nhập quản trị, dùng **Khôi phục dữ liệu demo**. Muốn tạm dừng Mongo: `pnpm infra:down`; volume vẫn giữ nguyên. Không dùng `down -v` hay xóa thư mục trust để sửa lỗi mà chưa hiểu ảnh hưởng đến chữ ký và audit.
