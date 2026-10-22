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
    ui/                 PageState, Panel, ToneTag, BrandMark
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
| Tải lại | `onRefresh={() => query.refetch()}` |
| Phân trang | Client: `usePagination` → `pagination={{ current, pageSize }}`, `onPaginationChange={handleTableChange}`; server: `useResource` |
| Xuất/nhập | `exportable` + `onExport` (dữ liệu đã làm phẳng, nhãn đã dịch); `importable` + `onImport` cho tài nguyên CRUD |
| Thao tác hàng | `customActions` **thay thế** nút mặc định: một `IconButton` chính + `Dropdown` chứa Xem chi tiết/Sửa/Xóa… |
| Xem chi tiết | `DetailModal` với `items`, có `onEdit`/`onDelete` nếu được sửa |
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
3. Mục menu mới: thêm vào `navConfig.ts`. Mục con (như Quản trị hệ thống) khai báo `children`; khóa của mục con là đường dẫn.
4. Thêm chuỗi vào **cả** `locales/vi/<ns>.json` và `locales/en/<ns>.json`.

Trang nghiệp vụ không phải danh sách (ký, phê duyệt, tranh chấp) dùng `PageHeader` hoặc `PageContainer` cho tiêu đề, `Panel` cho khối nội dung tự quản padding, `ToneTag` cho trạng thái, `PageState` cho đang tải/lỗi.

## 5. Màn chào lần đầu

- Lần đầu mở ứng dụng (trang đăng nhập hoặc trong app) hiện modal bắt chọn ngôn ngữ và giao diện; nút "Bắt đầu" chỉ bật khi đã chọn cả hai, lựa chọn áp dụng ngay.
- Chọn xong, ba nút Hướng dẫn, Ngôn ngữ, Sáng/tối trên header cùng nhấp nháy và một thẻ gợi ý giải thích; bấm "Đã hiểu" hoặc ra ngoài để đóng.
- Trạng thái lưu ở `localStorage["codecash.onboarding"] = "done"`; xóa khóa này để xem lại từ đầu. Nút Hướng dẫn trên header mở lại thẻ gợi ý bất cứ lúc nào.
- Mã: [`shared/onboarding`](../apps/web/src/shared/onboarding/), [`PreferenceControls`](../apps/web/src/shared/layout/PreferenceControls.tsx).

## 6. Dữ liệu, nghiệp vụ, i18n

- Đọc/ghi qua module trong `features/<miền>/api/` hoặc `shared/api`; TanStack Query với `queryKey` chứa `user.id`. Trình duyệt không quyết định nghiệp vụ; ESLint chặn import mã server.
- Tiền Data Pack là chuỗi thập phân: `formatDecimalString`. Tiền workflow (triệu VND): `formatMillionVnd`. Ngày giờ: `formatDate`, `formatDateTime`.
- Mọi chuỗi hiển thị, gồm `aria-label`, `placeholder`, tooltip, qua i18n; số đếm dùng `key_one`/`key_other`.

## 7. Kiểm tra trước khi mở PR

```bash
pnpm check              # typecheck, lint (0 warning), format:check, build, test
pnpm dev                # rồi, ở terminal khác:
pnpm test:browser       # onboarding, 25 màn desktop/mobile, tạo/xóa qua base; ảnh ở artifacts/browser
```

## 8. Không tạo lại

| Đã gỡ | Thay bằng |
| --- | --- |
| `shared/ui/controls.tsx` (`UiButton`, `UiInput` bọc antd bằng `as any`) | Ant Design trực tiếp hoặc phần tử HTML gốc |
| Shim `features/milestones/components/{Button,Badge,Card,ConfirmDialog,PageMessage}` | `Button`, `ToneTag`, `Panel`, `Modal`, `PageState` |
| `AppShell` dựng lại ở mỗi trang | `AppLayout` + `AppPage` |
| Thanh lọc tự dựng bằng `Select`/`DatePicker` trên trang danh sách | `filters` + FilterBuilder của `DataTable` |
| Khóa i18n dạng hash trong `packages/ui` | Khóa có nghĩa trong namespace `base` |
