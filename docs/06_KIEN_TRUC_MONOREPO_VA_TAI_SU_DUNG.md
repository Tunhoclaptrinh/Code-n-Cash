# Kiến trúc monorepo và tái sử dụng UniFlow

## 1. Phạm vi chuyển đổi

CodeCash được tổ chức lại thành `apps/web`, `apps/api`, `apps/engine` và các package dùng chung. Chuyển toàn bộ màn hình A1–C3 và đăng nhập sang Ant Design; giữ nội dung Việt/Anh, route, thứ tự thao tác và mô hình nghiệp vụ hiện có.

Nguồn tham khảo: repo UniFlow-PTIT_Aka do người dùng chỉ định. Không sao chép node_modules, .env, dữ liệu thật, token, key, connector sàn hoặc module AI/SKU không liên quan. Manifest nguồn: [reuse-manifest.json](../packages/reuse-manifest.json).

## 2. Những phần đã chuyển và chỉnh

| Phần nền | Nguồn UniFlow | Đích / điều chỉnh |
| --- | --- | --- |
| Workspace | package.json, pnpm-workspace.yaml | Lệnh root chạy web/API, kiểm tra, build, test và infra |
| Base component | apps/web/src/components/base | packages/ui: bảng, form modal/drawer, card, stat, trạng thái, xác nhận, tìm kiếm, import/export |
| Hook | useDebounce, useFilters, useLocalStorage, useAsync, usePagination | Tái sử dụng, sửa phân trang; thêm useResource dựa trên TanStack Query |
| Tiện ích | export, clipboard, storage, validation, eventEmitter | Namespace CodeCash; CSV dùng parser thực, hỗ trợ dấu phẩy/quote/newline và UTF-8 |
| API client | services/api.ts, base.service.ts | packages/api-client: client có kiểu, lỗi chuẩn, token provider, resource client và file download |
| Backend base | common controllers/services/guards/filters/interceptors | apps/api/common: validation/allowlist, scope từ actor, version check, lưu bền và audit cùng giao dịch |

Base UI được tách chuỗi hiển thị ra resource Việt/Anh; thương hiệu UniFlow được thay bằng CodeCash. Web giữ React 19/Router 7/TanStack Query/i18next. Ant Design 6 dùng icons 6. Root/API dùng TypeScript 5.9 cho hệ lint hiện tại, web dùng TypeScript 7.

## 3. Ranh giới trách nhiệm

- **Web:** trình bày, form, phân trang, lọc, gửi hành động, hiển thị kết quả. Không giữ bản dữ liệu nghiệp vụ có thể tự quyết định thay server.
- **API nền:** auth, role/scope, dữ liệu quản trị, tài liệu, xử lý phiên bản, audit, Swagger và persistence.
- **API nghiệp vụ (`apps/api/src/domain`):** nạp Data Pack thành bảng, dữ liệu bổ sung, hành động có kiểm quyền (nộp chứng từ, phê duyệt, tranh chấp, ký, chuyển kế toán, ngoại lệ BR-19), màn xem và việc cần làm. Mọi quyết định lấy từ engine Python; web chỉ gọi `POST /workflow/:module/:action`.
- **Engine Python:** đánh giá Data Pack dựa trên đặc tả/kiểm chứng hiện có. Adapter bổ sung định dạng nộp, trace, fingerprint và thời gian thực thi; không sửa các luật đã được duyệt bằng cách đổi UI.

Kiểu dữ liệu trao đổi nằm trong `packages/contracts`. Resource CRUD khai báo ở `resources.json`; các field được dùng để dựng form và whitelist/validate ở API. TypeScript không tự chia sẻ kiểu trực tiếp với Python: adapter xuất schema CSV và có test hợp đồng đầu ra.

## 4. Nền CRUD và phân quyền

Các resource: organizations, users, contract-drafts, milestone-templates, settings; documents và audit chỉ đọc qua CRUD, ghi qua nghiệp vụ riêng.

- Phân trang server, tìm kiếm toàn tập, sort trên trường cho phép, filter được kiểm kiểu.
- Tạo/sửa/xóa và batch/import có kiểm quyền. Update gửi version; dữ liệu cũ bị từ chối thay vì ghi đè người khác.
- Scope tổ chức lấy từ actor đăng nhập, không tin x-tenant-id hoặc role/userId từ request.
- Password băm; API không trả passwordHash. Admin có thao tác đặt lại mật khẩu; tài khoản bị vô hiệu không dùng được token cũ.
- Thay đổi tài nguyên và audit lưu cùng snapshot file hoặc cùng transaction Mongo.
- Audit không cung cấp API sửa/xóa; cơ chế này chưa phải hash chain được neo độc lập.
- Upload PDF vào hợp đồng nháp có kiểm scope, giới hạn 20 MB, hash SHA-256 và download có xác thực.

Kho file local có hàng đợi và ghi file tạm/rename, dùng cho một instance. Mongo dùng transaction, cần replica set; đây là đường mở rộng cho triển khai nhiều tiến trình. Chưa được xem là đã kiểm chứng tải lớn hoặc production.

## 5. Workflow và dữ liệu thật

Các action được whitelist theo module trong `workflow.controller.ts`, mỗi action ánh xạ tới một quyền; actor lấy từ JWT, phạm vi hợp đồng lấy từ tổ chức của actor. Người ký phải là signer được gán; người phê duyệt phải đúng bên mua và đúng vai trò còn thiếu; mỗi bên chỉ ghi loại sự kiện thuộc thẩm quyền của mình (ma trận 4.2).

Một luồng dữ liệu duy nhất:

1. Lần khởi động đầu, `DomainService.bootstrap()` nạp contracts, parties, milestones, events, payment_rules của Data Pack (nguồn `DATA_PACK`) và dữ liệu bổ sung mà Data Pack không có: tài khoản, thứ tự ký, bốn hợp đồng demo CT0101–CT0104 (nguồn `SEED`).
2. Mỗi hành động ghi sự kiện theo đúng schema `events.csv` (nguồn `APP`), rồi chạy engine trên toàn bộ dữ liệu: ghi bảng ra thư mục tạm, gọi `apps/engine/cli.py --data`, khoảng 0,1 giây. Kết quả, lịch sử trạng thái (mã lượt chạy, nguyên nhân) và audit lưu cùng một giao dịch (`Repository.transact`).
3. Mốc bị từ chối hoặc đã chuyển kế toán bị khoá. Quyết định ngoại lệ BR-19 được duyệt chuyển thành `voided_events.csv` cho engine.
4. Trang Data Pack vẫn chạy engine trên Data Pack gốc hoặc bộ dữ liệu tải lên để xuất CSV 22 cột, trace và KPI mục 15.

Generic CRUD không sửa được bản ghi của Data Pack và của luồng nghiệp vụ: resource khai báo `managedOrigins` trong `resources.json`, API trả `MANAGED_RECORD`.

Toàn vẹn: `Repository.transact` nối mọi bản ghi nhật ký vào hash chain (`common/audit-chain.ts`: `seq`, `prevHash`, `hash` = SHA-256 của JSON chuẩn hoá) và từ chối sửa, xoá bản ghi cũ (`APPEND_ONLY_RESOURCE`). Bản ghi đầu niêm phong mã băm từng bảng dữ liệu BTC lúc nhập; bản ghi của mỗi thao tác niêm phong mã băm các sự kiện nó tạo. Hành động `integrity.verifyIntegrity` kiểm lại chuỗi, các niêm phong và chạy lại engine để đối soát mọi quyết định đã lưu; `contracts.getMilestoneTimeline` phát lại một mốc theo từng sự kiện (`cli.py --timeline`, chế độ as-of BR-16). Ký số vẫn là mô phỏng, không gọi là CA thật. Tính năng theo vai trò và kịch bản demo ở [09 — Tính năng và vai trò](09_HUONG_DAN_TINH_NANG_VA_VAI_TRO.md).

## 6. Cách thêm tính năng

1. CRUD đơn giản: khai báo resource/field, xác định scope và quyền; dùng ResourcePage/useResource; thêm test quyền, dữ liệu lỗi và phiên bản.
2. Nghiệp vụ có trạng thái: tạo module/action riêng, không cho generic PATCH sửa decision hoặc chữ ký. Gắn audit và test chuyển trạng thái.
3. API client mới: dùng client chung; query/mutation qua TanStack Query; queryKey chứa identity và tham số truy vấn.
4. UI mới: dùng packages/ui và Ant Design, thêm đủ hai locale, không tự chép layout/bảng/form. Quy ước chi tiết ở [08 — Phát triển giao diện](08_HUONG_DAN_PHAT_TRIEN_UI.md).
5. Thay đổi luật: cập nhật đặc tả, engine và test cùng nhau; kiểm lại 20 mẫu và invariant toàn 405 mốc.

## 7. Kiểm tra và triển khai

Theo README root: install → typecheck/lint → build → test → smoke HTTP. Bộ nghiệp vụ Python cũ được giữ; adapter CSV có test schema, tiền, trace, BR-19 và KPI; nền API có test scope/version/import/persistence; workflow có test trên Data Pack thật: phạm vi, việc theo vai trò, thẩm quyền, tranh chấp, BR-19, chuyển kế toán, ký theo thứ tự, hợp đồng mới, bản ghi được bảo vệ và lưu bền.

CI build image `api`/`web` và chạy stack `infra/compose.prod.yaml` với smoke qua nginx, nhưng không tự deploy. Cách dựng môi trường ở [07 — Triển khai](07_HUONG_DAN_TRIEN_KHAI.md). CA, email và object storage bên ngoài cần cấu hình/kiểm thử riêng. Không có tác vụ tự gửi email hoặc thanh toán thật trong base này.
