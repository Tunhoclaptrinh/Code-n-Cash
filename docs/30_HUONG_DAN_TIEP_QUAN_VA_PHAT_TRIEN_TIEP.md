# Hướng dẫn tiếp quản và phát triển tiếp CodeCash

Cập nhật ngày 25/10/2026 (giờ Bangkok). Dành cho bất kỳ thành viên nào nhận việc, sửa giao diện, thay thuật toán hoặc nối module mới. Phân công trong tài liệu cũ là gợi ý phối hợp; mọi người có thể đổi đầu mối và cách triển khai, ghi lại thay đổi để người sau tiếp tục được.

## 1. Đọc gì trước?

| Muốn làm việc gì | Bắt đầu từ đâu |
| --- | --- |
| Chạy app, xem tài khoản demo | [README gốc](../README.md) và mục 2 dưới đây |
| Hiểu luật, biến và lý do có các quyết định | [04 — Đặc tả v1.1](04_DAC_TA_NGHIEP_VU.md), [15 — Trả lời BTC](15_XAC_NHAN_BTC_VA_GIA_DINH.md), [19 — Công thức/biến](19_DIEU_KIEN_CONG_THUC_VA_BIEN_QUY_TAC.md) |
| Sửa UI hoặc thêm trang | [08 — Quy ước UI](08_HUONG_DAN_PHAT_TRIEN_UI.md), `apps/web/CLAUDE.md` |
| Thay/nối engine, AI | [29 — Contract, adapter và lệnh kiểm tích hợp](29_BAN_GIAO_TICH_HOP_ENGINE_VA_AI.md) |
| Triển khai, Render, môi trường, sao lưu | [07 — Triển khai](07_HUONG_DAN_TRIEN_KHAI.md) |
| Viết hồ sơ, chuẩn bị trình bày | [Proposal](templates/PROPOSAL_OUTLINE.md), [slide](templates/SLIDE_STRUCTURE.md) |
| Tra toàn bộ tài liệu | [Mục lục docs](README.md) |

Đọc thêm `CLAUDE.md` ở gốc. Tài liệu ghi nhận một đợt kiểm tra hoặc kế hoạch cũ không tự thay thế trạng thái code hiện tại. Khi khác nhau, xác minh bằng mã/test và nguồn BTC; cập nhật tài liệu liên quan thay vì chỉ sửa con số.

## 2. Bắt đầu trên máy của mình

Dùng Node 24 theo `.nvmrc`, pnpm 12.14.0 theo `package.json`; Python 3.12+ để cùng môi trường CI. Engine hiện không cần thêm thư viện Python. Xem PDF/DOCX cần LibreOffice Writer, Poppler (`pdftotext`, `pdftoppm`) và font DejaVu.

Trên Ubuntu, nếu chưa có các công cụ đọc tài liệu:

```bash
sudo apt-get update
sudo apt-get install -y libreoffice-writer poppler-utils fonts-dejavu-core
```

Từ thư mục gốc repo:

```bash
git status --short
git pull --ff-only origin main
git switch -c feat/ten-cong-viec
corepack enable
pnpm install --frozen-lockfile
test -f .env || cp .env.example .env
pnpm dev
```

Nếu đang có thay đổi local, giữ lại/commit trên nhánh của mình trước khi cập nhật; không dùng reset để bỏ công việc đang làm. Lệnh tạo `.env` ở trên giữ nguyên file đã tồn tại.

- Web: `http://127.0.0.1:5173`.
- Health API: `http://127.0.0.1:3000/api/v1/health`.
- Swagger: `http://127.0.0.1:3000/api/docs`.
- Tài khoản: dùng menu **Tài khoản demo**; danh sách vai trò ở README gốc. Đổi tài khoản khi thử lượt ký/phê duyệt, không đổi role trong request để giả quyền.

Để thử offline, đặt `STORAGE_DRIVER=file`, `EXTRACTION_PROVIDER=local`, `SIGNING_PROVIDER=local`, để trống `ENGINE_URL`. API lưu hồ sơ local vào `DATA_DIR` (mặc định `.data`); khóa/bằng chứng trust dùng `TRUST_DIR` (mặc định `${DATA_DIR}-trust`). Không dùng chung một kho file cho nhiều tiến trình API.

Muốn làm mới demo, dừng API rồi chuyển **cả dữ liệu và thư mục trust tương ứng** sang chỗ sao lưu hoặc chọn một cặp thư mục mới. Không xóa dữ liệu production để tạo lại seed. Với Gemini/provider thật, cấu hình tại backend theo tài liệu 07/29; không đưa khóa vào code, ảnh, file mẫu hay `VITE_*`.

## 3. Tìm đúng chỗ để sửa

| Nhu cầu | Tệp/thư mục chính | Điều cần kiểm sau khi sửa |
| --- | --- | --- |
| Trang, menu, breadcrumb | `apps/web/src/router.tsx`, `shared/layout` | Đúng vai trò, một tiêu đề trang, responsive |
| Form hợp đồng, mẫu và người ký | `apps/web/src/features/contracts` | Form mới trống; một nút điền mẫu; thay thông tin phải phát hiện tài liệu cũ |
| Khung PDF, vị trí ký, trình tự trích xuất/ký | `apps/web/src/features/signing` | PDF thật, tọa độ đúng người/trang, thứ tự ký và điều kiện khóa |
| Preview tài liệu và thành phần app | `apps/web/src/shared/ui` | Cuộn/zoom, đọc được cả sáng/tối và điện thoại |
| Hành động nghiệp vụ và kiểm quyền | `apps/api/src/domain`, `common/permissions.ts` | Actor từ phiên đăng nhập, đúng tổ chức/bên, transaction/audit |
| Loader/DSL/tính tiền | `apps/engine`, `tools/kiem_chung_nghiep_vu.py` | Data Pack đầy đủ, first-match, Decimal, required events, quorum/dispute |
| Ràng buộc output engine | `apps/api/src/domain/engine-contract.ts` | 22 cột, đủ ID/metadata, trace và tổng tiền khớp |
| AI đề xuất điều khoản | `apps/api/src/trust/term-provider.ts`, `extraction-service.ts`, `gemini-extractor.ts` | Sáu trường có nguồn hoặc null; hash/version và xác nhận người dùng |
| Adapter ký/niêm phong | `apps/api/src/trust/signing-provider.ts`, `anchor-provider.ts` | Payload/hash/danh tính, timeout/lỗi, không âm thầm fallback |
| Kiểu dùng chung/quyền/resource | `packages/contracts`, `packages/api-client` | Một số kiểu được sao đồng bộ với API; test sẽ báo nếu lệch |
| Hướng dẫn Việt/Anh | `apps/web/src/guide/vi`, `guide/en`, `public/guide/images` | Nội dung/ảnh/role/callout đúng màn mới |
| Thành phần base UniFlow | `packages/ui` | Giữ base theo quy ước repo; mở rộng bằng props/token hoặc component trong app |

Chuỗi giao diện nằm trong `apps/web/src/locales/vi` và `en`. Khi thêm chuỗi, bổ sung cả hai ngôn ngữ. Không đưa xử lý quyết định hoặc tính tiền vào React.

## 4. Những ranh giới cần giữ khi phát triển tiếp

- Ưu tiên Bronze đúng dữ liệu trước, rồi Silver/Gold. Chưa có yêu cầu bắt buộc huấn luyện model trong trả lời BTC đội cung cấp.
- Profile `BTC_SUBMISSION` dùng cho bài nộp; `WORKFLOW` phục vụ event/ngoại lệ của ứng dụng. `ENGINE_URL` hiện chỉ thay nhánh Data Pack chính thức, không thay live workflow/dataset upload.
- ELSE là rule mặc định cuối cùng, không phải event. Completion là thời điểm muộn nhất của bộ required events hợp lệ cần thiết; approval/resolve muộn hơn không tự đẩy ngày hoàn thành.
- Giữ CSV gốc trong `BangD-Case4`; test bổ sung dùng dữ liệu synthetic/fixture. Tiền nghiệp vụ dùng Decimal, qua JSON là chuỗi thập phân; confidence `[0,1]` không thay quyết định HOLD.
- Identity/quyền do API kiểm; audit không phải CRUD sửa/xóa. Thay stakeholder/nghiệp vụ mới phải nêu rõ role, quyền, event và ảnh hưởng tới profile BTC.
- Hai mươi nhãn công khai là ground truth có sẵn để đối chiếu. Baseline 405 mốc do đội sinh chưa phải đáp án HIDDEN/HOLDOUT. Khi có căn cứ sửa baseline, cập nhật spec, code, test và giải thích cùng nhau.
- PDF preview và ô ký là thật; ký demo còn dùng bằng chứng tách rời, chưa phải tích hợp CA/PAdES hoàn chỉnh. AI là đề xuất có nguồn, không có quyền tự duyệt chi.

Được phát triển thêm nghiệp vụ ngoài cuộc thi; mô tả nó là phần mở rộng và kiểm hồi quy profile BTC. Không cần giữ một giả định sai chỉ vì báo cáo cũ đang xanh.

## 5. Quy trình nhận và hoàn thành một việc

1. Ghi vấn đề bằng tình huống cụ thể: vai trò, hợp đồng/mốc, thao tác, kết quả hiện tại và kết quả mong muốn. Nếu là thay luật, dẫn nguồn đề/BTC hoặc ghi rõ giả định mới.
2. Chọn nhánh, phạm vi sửa và chỗ tiếp nhận trong bảng trên. Có thể đổi đầu mối; báo cho người đang sửa cùng tệp để tránh đè việc.
3. Thực hiện, cập nhật kiểu/locale/tài liệu liên quan. Với engine hoặc provider mới, chạy contract/gate tại tài liệu 29 trước khi nối luồng lưu dữ liệu.
4. Chạy kiểm tra phù hợp ở mục 6. Nếu thay UI, mở ảnh thật để đánh giá và cập nhật hướng dẫn khi ảnh/nhãn/bước thao tác đã đổi.
5. Commit phần của mình, push nhánh và mở PR để team review/merge. Nếu được phân công làm trực tiếp trên main, cập nhật main trước khi push, không force push.
6. Bàn giao bằng [mẫu ghi việc](templates/HANDOFF_TEMPLATE.md): đã làm gì, còn gì, cách chạy, kết quả kiểm, hạn chế và commit. Người sau phải tái hiện được mà không cần đọc lịch sử chat.

## 6. Kiểm tra và dùng fixture đúng cách

Với thay đổi code, từ gốc repo:

```bash
pnpm check
pnpm check:btc
pnpm integration:check
```

`pnpm check` gồm typecheck/lint/format/build/test. Khi chỉ sửa tài liệu, kiểm đường dẫn/nội dung/lệnh đã dẫn; không ghi rằng đã chạy lại toàn bộ test nếu chưa chạy. Với candidate engine, dùng câu lệnh `--candidate`/`--out` trong tài liệu 29.

Các script smoke có thể phê duyệt, ký, đóng tranh chấp hoặc tạo/xóa bản ghi. Mỗi kịch bản dùng **API và DATA_DIR riêng, bắt đầu từ seed sạch**; không nối vào Render, Mongo dùng chung hoặc dữ liệu đang demo cho team. Chỉ đặt DATA_DIR chưa đủ nếu `.env` đang chọn Mongo: phải ghi `STORAGE_DRIVER=file`.

Ví dụ chạy fixture cho HTTP smoke, terminal A tại gốc repo:

```bash
pnpm build
CODECASH_FIXTURE_DIR=$(mktemp -d /tmp/codecash-handoff-http.XXXXXX)
NODE_ENV=development STORAGE_DRIVER=file DATA_DIR="$CODECASH_FIXTURE_DIR" \
  TRUST_DIR="$CODECASH_FIXTURE_DIR/trust" EXTRACTION_PROVIDER=local \
  SIGNING_PROVIDER=local ENGINE_URL= DEMO_LOGIN=true SEED_PASSWORD='Passw0rd!' \
  API_HOST=127.0.0.1 PORT=3350 API_PORT=3350 node apps/api/dist/main.js
```

Terminal B, kiểm health rồi chạy:

```bash
curl -fsS http://127.0.0.1:3350/api/v1/health
API_BASE_URL=http://127.0.0.1:3350/api/v1 node scripts/smoke.mjs
```

API phục vụ luôn web build ở cùng cổng. Dùng cách khởi động tương tự nhưng đổi cả `PORT`/`API_PORT` và tạo thư mục mới cho các nhóm sau (`PORT` được ưu tiên nếu có):

| Kịch bản | Lệnh tại terminal B | Kết quả |
| --- | --- | --- |
| PDF/DOCX 1–4 người | `API_BASE_URL=http://127.0.0.1:3351/api/v1 node scripts/real-contract-smoke.mjs` | Upload/preview, nguồn trích xuất, ô ký, khóa hồ sơ |
| Browser theo vai trò | `WEB_URL=http://127.0.0.1:3352 node scripts/browser-smoke.mjs` | Kiểm UI/luồng, ảnh trong `artifacts/browser` |
| Ảnh hướng dẫn có khoanh vùng | `WEB_URL=http://127.0.0.1:3353 node scripts/guide-screenshots.mjs` | Ảnh trong `apps/web/public/guide/images`, ảnh gốc/báo cáo trong `playwright-report/guide` |
| Luồng PDF và trích xuất có hướng dẫn | `WEB_URL=http://127.0.0.1:3354 node scripts/refinement-smoke.mjs` | Ảnh kiểm chứng tại `playwright-report/refinement`, làm mới ảnh PNG tương ứng trong hướng dẫn |

Không chạy browser smoke và script chụp hướng dẫn chung fixture sau khi một script đã phê duyệt/đóng tranh chấp; trạng thái đầu vào sẽ khác kỳ vọng. Dừng đúng API fixture bằng Ctrl+C khi xong. Không build lại web trong lúc browser đang chụp/kiểm, vì tên chunk có thể thay đổi giữa phiên.

Chụp nhanh để xem bố cục bằng `scripts/visual-review.mjs`: chuẩn bị fixture riêng có CT0105 PDF thật (chạy `real-contract-smoke.mjs` với `REAL_CONTRACT_COUNTS=3` trên seed sạch), rồi xem các bộ lọc `VISUAL_CASES`, `VISUAL_WIDTHS`, `VISUAL_THEMES` ở [28 — Rà bố cục](28_RA_SOAT_BO_CUC_TOAN_UNG_DUNG.md). Đặt `WEB_URL` tới fixture và `VISUAL_ASSERT=1` để có mã thoát lỗi khi kiểm không đạt. Mở ảnh desktop/mobile, sáng/tối và modal đại diện; số lượng ảnh tự nó không chứng minh giao diện đẹp.

## 7. Những phần có thể nhận làm tiếp

| Ưu tiên | Việc | Đầu ra để người khác kiểm được |
| --- | --- | --- |
| P0 | Nối module engine/AI riêng khi có mã | JSON candidate, báo cáo gate, phiên bản/provider và test tích hợp |
| P0 | Rà các giả định còn mở và trường hợp chưa có nhãn | Trace/event cụ thể, căn cứ diễn giải, test synthetic; không tự nhận hidden accuracy |
| P0 | Chốt hồ sơ/demo sơ khảo | Proposal, slide ≤15 trang, bài nói theo dự kiến ≤5 phút, video/ảnh dự phòng, kênh/hạn nộp được xác nhận |
| P1 | Cải thiện UI hoặc thêm luồng thực tế | Điều kiện đầu/cuối, API có kiểm quyền, ảnh và hướng dẫn cập nhật |
| P1 | Đánh giá trích xuất trên hợp đồng khác/scan | Dữ liệu được phép dùng, nhãn trường/trang/quote, thống kê lỗi và cách xử lý null |
| P2 | CA/PAdES, timestamp hoặc blockchain/TSA thật | Contract provider, cấu hình backend, bằng chứng kiểm và giới hạn; không đổi trạng thái mô phỏng thành “đã xác minh” khi chưa tích hợp |

Các mục này là hướng tiếp tục, không phải phân công cứng hay xác nhận đã triển khai.

## 8. Mốc tham chiếu và bằng chứng

Mốc code `1817cc5`: gói engine/AI đã có contract/adapter và tài liệu 29. Đợt đó đạt 167 test (78 Python, 89 Node), 36 kịch bản browser, PDF 1–4 người ký, gate 405 mốc/20 mẫu công khai và [CI verify/Docker](https://github.com/Tunhoclaptrinh/Code-n-Cash/actions/runs/40162361256). Đây là kết quả của **mốc đó**, không phải bảo đảm cho thay đổi sau này hoặc xác nhận Render đang chạy cùng commit.

Các thư mục `artifacts`, `playwright-report`, `.data`, `.env*` riêng không được đưa vào Git; người nhận chạy lại script để tạo bằng chứng. Chỉ commit ảnh hướng dẫn công khai đã rà soát, tài liệu và mã/test cần thiết. Không chia sẻ token, dữ liệu hợp đồng riêng hoặc toàn bộ audit production trong bộ bàn giao.
