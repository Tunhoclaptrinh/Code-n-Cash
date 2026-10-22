# Hướng dẫn phát triển giao diện

Quy ước cho `apps/web` và `packages/ui`. Chuẩn giao diện lấy theo base của UniFlow (`apps/web/src/components/base`, `components/layout/MainLayout.tsx`, `styles/theme.ts`, `styles/global.less`), thay màu thương hiệu bằng màu CodeCash. Đọc kèm [06 — Kiến trúc monorepo](06_KIEN_TRUC_MONOREPO_VA_TAI_SU_DUNG.md).

## 1. Nguyên tắc với base

- `packages/ui/src/components`, `hooks`, `utils` là bản chuyển từ UniFlow (xem [reuse-manifest.json](../packages/reuse-manifest.json)). **Không sửa hành vi hay giao diện của chúng.** Cần khác thì truyền props, dùng biến CSS, hoặc tạo component mới trong `apps/web/src/shared/ui`.
- Những thay đổi đã có so với bản UniFlow, và chỉ những thay đổi này: thương hiệu/màu CodeCash, chuỗi hiển thị qua `uiText()` với khóa có nghĩa (`table.search`, `export.scopeAll`…), hook `useResource` (CodeCash viết thêm, dùng TanStack Query).
- Theme Ant Design nằm ở [`packages/ui/src/theme.ts`](../packages/ui/src/theme.ts) (`lightThemeConfig`/`darkThemeConfig`, cùng cấu trúc với UniFlow). Biến CSS ở [`packages/ui/src/styles/tokens.css`](../packages/ui/src/styles/tokens.css): nhóm `--bg-*`, `--border-*`, `--text-*` cho component base, nhóm `--color-*` cho CSS module của feature; cả hai có bản sáng và tối.
- Style toàn cục kiểu UniFlow (kích thước nút, `base-sidebar-menu`, scrollbar) ở `apps/web/src/styles/global.css`.

## 2. Bố cục ứng dụng

```text
apps/web/src/
  router.tsx            Bảng route; mọi trang lazy, nằm trong AppLayout
  shared/
    layout/             AppLayout, AppPage, navConfig, PreferenceControls, NotificationDrawer
    onboarding/         Màn chào lần đầu (chọn ngôn ngữ, giao diện) và gợi ý trên header
    pages/              NotFoundPage, RouteErrorPage
    ui/                 PageState, Panel, ToneTag, BrandMark, ExpandableModal,
                        ImportPreviewModal, columnSearch
    api/ auth/ lib/     Client có xác thực, phiên đăng nhập, định dạng
  features/<miền>/      api/ components/ pages/ lib/ types.ts
  locales/{vi,en}/      Một namespace cho mỗi miền + common
```

`AppLayout` theo `MainLayout` của UniFlow: header cao 56 px (logo bên trái; hướng dẫn, ngôn ngữ, sáng/tối, thông báo, tài khoản bên phải), sidebar 240/70 px bên dưới header với nút thu gọn tròn, khối "Môi trường" ở chân sidebar. Dưới 992 px sidebar thành drawer. Layout được mount một lần cho mọi route; mỗi trang bọc nội dung bằng `AppPage` để khai báo mục menu và breadcrumb.

## 3. Mẫu trang danh sách (theo `SkuMappingTable` của UniFlow)

Mọi trang danh sách dùng đủ các phần sau của base. Trang mẫu: [ContractListPage](../apps/web/src/features/contracts/pages/ContractListPage.tsx) (lọc phía client), [ResourcePage](../apps/web/src/features/platform/ResourcePage.tsx) (CRUD phía server).

| Phần | Cách dùng |
| --- | --- |
| Khung | `PageContainer` (tiêu đề, `subtitle`, `tooltip`, `extra`) bọc `DataTable` |
| Thống kê | `statisticsData`: thẻ pill có `backgroundColor`/`valueColor`, bấm để chuyển tab |
| Tab nhanh | `tabs`, `activeTab`, `onTabChange` theo trạng thái |
| Tìm kiếm | Lọc client: `searchFields`; lọc server hoặc tìm theo chữ đã dịch: `searchValue` + `onSearch` |
| Bộ lọc | `filters` (`FilterConfig`: `select`, `input`, `date`) + `useFilters` → `filterValues`, `onFilterChange`, `onClearFilters` |
| Lọc theo cột | Cột liệt kê được: `filters` + `onFilter` của Ant Design (thêm `filterSearch` khi nhiều giá trị). Cột chữ: `...columnSearch((row) => text)` từ `shared/ui/columnSearch`. Lọc phía server (ResourcePage): `filteredValue` + `filterMultiple: false`, đổi thành `params.filters` trong `onPaginationChange` |
| Chọn bản ghi liên kết | Trường có `ref` trong `resources.json`: `DebounceSelect` tìm từ xa, lưu id, hiển thị tên; bảng và tệp xuất có cột `<field>_name` |
| Tải lại | `onRefresh={() => query.refetch()}` |
| Phân trang | Client: `usePagination` → `pagination={{ current, pageSize }}`, `onPaginationChange={handleTableChange}`; server: `useResource` |
| Xuất/nhập | Lọc client: `exportable` + `onExport` (dữ liệu đã làm phẳng, nhãn đã dịch). Tài nguyên CRUD (theo Base): xuất phía server `GET /resources/:r/export?format&columns&filters…`; nhập qua `GET …/template` → `POST …/import/validate` → `ImportPreviewModal` (báo lỗi từng dòng) → chỉ nhập dòng hợp lệ |
| Quyền | `useAccess(user).hasPermission("module:action")`; ẩn nút khi không có quyền, API vẫn kiểm lại |
| Thao tác hàng | `customActions` **thay thế** nút mặc định: một `IconButton` chính + `Dropdown` chứa Xem chi tiết/Sửa/Xóa… |
| Xem chi tiết | `DetailModal` với `items`, có `onEdit`/`onDelete` nếu được sửa. Bản ghi dài (tab, bảng con): `ExpandableModal` có nút phóng toàn màn hình, ví dụ [ContractModal](../apps/web/src/features/contracts/components/ContractModal.tsx) |
| Thêm/sửa | `onAdd` (nút "Thêm mới") + `FormModal` với `Form.Item` có `rules` |
| Xóa | `ConfirmModal` (`danger`); xóa nhiều: `batchOperations` + `onBatchDelete` |

Nhật ký kiểm toán chỉ có xem, lọc, xuất: không có sửa/xóa (CLAUDE.md).

## 4. Thêm một màn hình

1. Tạo `features/<miền>/pages/TenPage.tsx`, `export default`, bọc bằng `AppPage`:

   ```tsx
   <AppPage active="contracts" breadcrumb={[{ label: t("list.title") }]}>
     <PageContainer title={t("list.title")}>…</PageContainer>
   </AppPage>
   ```

2. Đăng ký trong `router.tsx` bằng `lazy: () => import(...).then(asRoute)`.
3. Mục menu mới: thêm vào `navConfig.ts`. Menu chia theo khu vực nghiệp vụ (`workflow()`, `monitoring()`, `dataAndAdmin()`, mỗi khu có `labelKey` làm tiêu đề nhóm); mục con (như Quản trị hệ thống) khai báo `children`, khóa của mục con là đường dẫn. Khi sidebar thu gọn, tiêu đề nhóm thành đường kẻ.
4. Thêm chuỗi vào **cả** `locales/vi/<ns>.json` và `locales/en/<ns>.json`.

Trang nghiệp vụ không phải danh sách (ký, phê duyệt, tranh chấp) dùng `PageHeader` hoặc `PageContainer` cho tiêu đề, `Panel` cho khối nội dung tự quản padding, `ToneTag` cho trạng thái, `PageState` cho đang tải/lỗi.

## 5. Màn chào lần đầu và đăng nhập demo

- Trang đăng nhập không hiện màn chào. Sau lần đăng nhập đầu tiên, ngay trên màn chính, hiện modal bắt chọn ngôn ngữ và giao diện; nút "Bắt đầu" chỉ bật khi đã chọn cả hai, lựa chọn áp dụng ngay.
- Chọn xong, ba nút Hướng dẫn, Ngôn ngữ, Sáng/tối trên header cùng nhấp nháy và một thẻ gợi ý giải thích; bấm "Đã hiểu" hoặc ra ngoài để đóng.
- Trạng thái lưu ở `localStorage["codecash.onboarding"] = "done"`; xóa khóa này để xem lại từ đầu. Nút Hướng dẫn trên header mở lại thẻ gợi ý bất cứ lúc nào.
- Mã: [`shared/onboarding`](../apps/web/src/shared/onboarding/), [`PreferenceControls`](../apps/web/src/shared/layout/PreferenceControls.tsx).
- Khi API bật `DEMO_LOGIN` (mặc định ngoài production), góc phải trang đăng nhập có menu "Tài khoản demo" lấy từ `GET /auth/demo-accounts`; chọn một tài khoản là điền email và đăng nhập ngay (`POST /auth/demo-login`). API chỉ nhận 5 tài khoản mẫu còn hoạt động và ghi `LOGIN_DEMO` vào nhật ký.

## 6. Phân quyền

- Nguồn duy nhất: [`packages/contracts/permissions.json`](../packages/contracts/permissions.json), khóa dạng `module:action` (Base), mỗi vai trò có phạm vi `own`/`org`/`all`.
- API: `@RequirePermission("engine:evaluate")` trên route; `BaseService` kiểm `<resource>:<read|create|update|delete|import|export>`; mỗi hành động workflow ánh xạ tới một quyền trong `workflow.controller.ts` (thiếu ánh xạ là bị từ chối).
- Web: `user.permissions` (API tính từ vai trò) → `useAccess(user)`. Trang **Ma trận phân quyền** (`/platform/permissions`) chỉ đọc: đổi quyền cần người thứ hai duyệt (SoD-3, SoD-4) nên đi qua review mã.

## 7. Trang Data Pack và bộ dữ liệu tải lên

- Nguồn dữ liệu: Data Pack chính thức hoặc bộ dữ liệu người dùng tải lên ([DatasetPanel](../apps/web/src/features/platform/components/DatasetPanel.tsx)). Tải lên nhận CSV rời hoặc ZIP của cả thư mục; engine tìm tệp theo tên và báo tệp nào đủ, thiếu, thiếu cột trước khi chạy.
- Không có `submission_output_template.csv` thì engine dựng 22 cột theo thứ tự `milestones.csv`. Có `*test_ids*.csv` (ví dụ `hidden_test_ids_Case4.csv`) thì chỉ xuất các mốc trong danh sách; engine vẫn đọc toàn bộ dữ liệu.
- "Tải kết quả": `submission_output.csv`, `audit.json`, `metrics.json` do engine ghi (`GET /engine/datasets/:id/files/:file`). Quyền `engine:datasets`.

## 8. Dữ liệu, nghiệp vụ, i18n

- Đọc/ghi qua module trong `features/<miền>/api/` hoặc `shared/api`; TanStack Query với `queryKey` chứa `user.id`. Trình duyệt không quyết định nghiệp vụ; ESLint chặn import mã server.
- Tiền Data Pack là chuỗi thập phân: `formatDecimalString`. Tiền workflow (triệu VND): `formatMillionVnd`. Ngày giờ: `formatDate`, `formatDateTime`.
- Mọi chuỗi hiển thị, gồm `aria-label`, `placeholder`, tooltip, qua i18n; số đếm dùng `key_one`/`key_other`.

## 9. Kiểm tra trước khi mở PR

```bash
pnpm check              # typecheck, lint (0 warning), format:check, build, test
pnpm dev                # rồi, ở terminal khác:
pnpm test:browser       # đăng nhập demo, màn chào sau đăng nhập, 27 màn desktop/mobile, modal toàn màn,
                        # tải và chạy bộ dữ liệu, tạo/xóa qua base; ảnh ở artifacts/browser
```

## 10. Không tạo lại

| Đã gỡ | Thay bằng |
| --- | --- |
| `shared/ui/controls.tsx` (`UiButton`, `UiInput` bọc antd bằng `as any`) | Ant Design trực tiếp hoặc phần tử HTML gốc |
| Shim `features/milestones/components/{Button,Badge,Card,ConfirmDialog,PageMessage}` | `Button`, `ToneTag`, `Panel`, `Modal`, `PageState` |
| `AppShell` dựng lại ở mỗi trang | `AppLayout` + `AppPage` |
| Thanh lọc tự dựng bằng `Select`/`DatePicker` trên trang danh sách | `filters` + FilterBuilder của `DataTable` |
| Khóa i18n dạng hash trong `packages/ui` | Khóa có nghĩa trong namespace `base` |
