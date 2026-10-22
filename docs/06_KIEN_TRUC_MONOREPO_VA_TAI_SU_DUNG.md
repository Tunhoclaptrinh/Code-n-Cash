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
- **API workflow:** các hàm nghiệp vụ của bản UI trước đây được chuyển sang `apps/api/src/workflow`; web dùng client gọi API. Không còn hai bản handler chạy độc lập ở server và trình duyệt.
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

Các action được whitelist theo module, đối chiếu actor từ JWT, kiểm hợp đồng/đơn vị và role theo hành động. Người ký phải là signer được gán; nhà cung cấp không được tự nhận role phê duyệt. Khi gọi hành động, snapshot workflow được lưu ở backend để các vai cùng nhìn một trạng thái; lỗi được rollback trước khi lưu.

Bộ hợp đồng minh họa và Data Pack là hai luồng dữ liệu khác nhau:

1. Workflow UI dùng bộ mẫu ban đầu để trình diễn intake/ký/evidence/approval/dispute. Các hàm cũ được giữ để tránh đổi luật lẫn trong đợt đổi UI.
2. Trang Data Pack gọi Python, xử lý 100 hợp đồng/405 mốc, bốn quyết định và tiền Decimal. CSV chuẩn có 22 cột và trace từng mốc.

Việc nhập Data Pack thành toàn bộ đối tượng workflow tương tác, làm đầy đủ validation theo từng hành động và đồng nhất mọi rule ở hai luồng là bước tích hợp tiếp theo; không gọi các thao tác ký mô phỏng là CA thật. Luật grace/penalty trong workflow minh họa vẫn cần đối chiếu với đặc tả trước khi dùng cho hồ sơ thực tế.

## 6. Cách thêm tính năng

1. CRUD đơn giản: khai báo resource/field, xác định scope và quyền; dùng ResourcePage/useResource; thêm test quyền, dữ liệu lỗi và phiên bản.
2. Nghiệp vụ có trạng thái: tạo module/action riêng, không cho generic PATCH sửa decision hoặc chữ ký. Gắn audit và test chuyển trạng thái.
3. API client mới: dùng client chung; query/mutation qua TanStack Query; queryKey chứa identity và tham số truy vấn.
4. UI mới: dùng packages/ui và Ant Design, thêm đủ hai locale, không tự chép layout/bảng/form.
5. Thay đổi luật: cập nhật đặc tả, engine và test cùng nhau; kiểm lại 20 mẫu và invariant toàn 405 mốc.

## 7. Kiểm tra và triển khai

Theo README root: install → typecheck/lint → build → test → smoke HTTP. Bộ nghiệp vụ Python cũ được giữ; adapter CSV có test schema, tiền và trace; nền API có test scope/version/import/persistence; workflow có test giả actor và lưu bền.

CI chưa deploy. Mongo, CA, email và object storage bên ngoài cần cấu hình/kiểm thử riêng khi triển khai. Không có tác vụ tự gửi email hoặc thanh toán thật trong base này.
