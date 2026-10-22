# Hướng dẫn phát triển giao diện

Quy ước cho `apps/web` và `packages/ui` sau đợt chuẩn hóa Ant Design. Đọc kèm [06 — Kiến trúc monorepo](06_KIEN_TRUC_MONOREPO_VA_TAI_SU_DUNG.md).

## 1. Bố cục ứng dụng

```text
apps/web/src/
  router.tsx            Bảng route; mọi trang lazy, nằm trong AppLayout
  shared/
    layout/             AppLayout (sidebar, header, drawer mobile), AppPage, navConfig
    pages/              NotFoundPage, RouteErrorPage
    ui/                 PageState, Panel, ToneTag, BrandMark
    api/                Client có xác thực, workflowCall
    auth/               Phiên đăng nhập, LoginPage, RequireAuth
    lib/                format.ts (tiền, ngày), initials.ts
  features/<miền>/      api/ components/ pages/ lib/ types.ts — mỗi miền tự chứa
  locales/{vi,en}/      Một namespace cho mỗi miền + common
packages/ui/src/
  theme.ts              Theme Ant Design (màu thương hiệu, token component)
  styles/tokens.css     Biến CSS cho CSS module, có bản dark
  components/base/      PageContainer, DataTable, StatisticCard, FormModal, IconButton…
```

`AppLayout` được mount **một lần** cho mọi route đã đăng nhập; chuyển trang không dựng lại sidebar/header. Lỗi trong một trang hiện `RouteErrorPage` mà vẫn giữ điều hướng.

## 2. Thêm một màn hình

1. Tạo `features/<miền>/pages/TenPage.tsx`, `export default`.
2. Bọc nội dung bằng `AppPage` để khai báo mục menu đang chọn và breadcrumb:

   ```tsx
   export default function InvoiceListPage() {
     const { t } = useTranslation("invoices");
     return (
       <AppPage active="contracts" breadcrumb={[{ label: t("list.title") }]}>
         <PageContainer title={t("list.title")} subtitle={t("list.subtitle")}>
           <DataTable rowKey="id" columns={columns} dataSource={rows} />
         </PageContainer>
       </AppPage>
     );
   }
   ```

3. Đăng ký trong `router.tsx` bằng `lazy: () => import(...).then(asRoute)`.
4. Cần mục menu mới: thêm vào `navConfig.ts` (khóa `NavKey`, icon `@ant-design/icons`, nhóm theo vai trò).
5. Thêm chuỗi vào **cả** `locales/vi/<ns>.json` và `locales/en/<ns>.json`.

## 3. Chọn thành phần

| Nhu cầu | Dùng | Tránh |
| --- | --- | --- |
| Tiêu đề trang, tabs, nút ở góc phải | `PageContainer` | Tự dựng `h1` + flex |
| Bảng có tìm kiếm, lọc, xuất/nhập, phân trang | `DataTable` (bảng tự cuộn ngang khi hẹp) | `Table` trần cho danh sách nghiệp vụ |
| Ô số liệu | `StatisticCard` | Card tự vẽ |
| Form tạo/sửa | `FormModal` + `Form.Item` có `rules` | State thủ công cho từng ô |
| Nút | `Button` của Ant Design, nghĩa qua props: `type="primary"`, `danger`, `color="green" variant="solid"`, `color="orange" variant="outlined"` | Class CSS tự tô màu nút |
| Nút icon trong hàng bảng | `IconButton` (tooltip là nhãn truy cập) | `span` có `onClick` |
| Nhãn trạng thái | `ToneTag` (tone ngữ nghĩa), `StatusBadge` cho mốc | `Tag color="#..."` |
| Đang tải / lỗi / không có dữ liệu | `PageState` | `Spin tip` (đã deprecated) |
| Khối nội dung tự quản padding | `Panel` | Bọc `Card` rồi đè `padding: 0` |
| Hộp xác nhận | `Modal` hoặc `modal.confirm` từ `App.useApp()` | Tự viết dialog |

Phần hiển thị đặc thù (trang PDF, ô ký kéo thả, khung điện thoại mô phỏng) giữ trong feature với CSS module và phần tử HTML gốc (`<button type="button">`, `<input type="file">`).

## 4. Màu, khoảng cách, dark mode

- Không viết mã màu hex trong TSX. Ant Design lấy màu từ `packages/ui/src/theme.ts`; CSS module dùng `var(--color-*)` trong `packages/ui/src/styles/tokens.css`.
- Thêm token mới thì thêm cả khối `:root` và `:root[data-theme="dark"]`. Token riêng một màn hình đặt trong class của trang và có bản dark qua `:global(:root[data-theme="dark"]) .page { … }`.
- Breakpoint: dưới `lg` (992 px) sidebar thành drawer; kiểm tra ở 390 px không có cuộn ngang toàn trang.

## 5. Dữ liệu và nghiệp vụ

- Đọc/ghi qua module trong `features/<miền>/api/` hoặc `shared/api`; TanStack Query với `queryKey` chứa `user.id` và tham số.
- Trình duyệt không quyết định nghiệp vụ: không tính quyết định thanh toán, không giữ store mẫu. ESLint chặn import mã server vào web.
- Tiền Data Pack là chuỗi thập phân từ engine; hiển thị bằng `formatDecimalString`, không đổi sang `number`. Tiền workflow (triệu VND) dùng `formatMillionVnd`.
- Ngày giờ dùng `formatDate`, `formatDateTime` (theo ngôn ngữ đang chọn).

## 6. i18n

- Namespace theo miền; `common` cho shell, vai trò, thông báo chung; `platform` cho quản trị và Data Pack.
- Thành phần trong `packages/ui` dùng namespace `base` với khóa có nghĩa (`table.search`, `export.scopeAll`), gọi qua `uiText()`.
- Mọi chuỗi hiển thị, gồm `aria-label`, `placeholder`, `title`, tooltip, đều qua i18n. Số đếm dùng `key_one`/`key_other`.

## 7. Kiểm tra trước khi mở PR

```bash
pnpm check              # typecheck, lint (0 warning), format:check, build, test
pnpm dev                # rồi, ở terminal khác:
pnpm test:browser       # chụp desktop/mobile vào artifacts/browser, kiểm tra tràn ngang
```

Xem ảnh trong `artifacts/browser/` (không commit thư mục này). Đổi giao diện đáng kể thì đính kèm ảnh trước/sau vào PR.

## 8. Những thứ đã gỡ bỏ, không tạo lại

| Đã gỡ | Thay bằng |
| --- | --- |
| `shared/ui/controls.tsx` (`UiButton`, `UiInput`, `UiTextarea` bọc antd bằng `as any`) | Ant Design trực tiếp hoặc phần tử HTML gốc |
| `features/milestones/components/{Button,Badge,Card,ConfirmDialog,PageMessage}` | `Button`, `ToneTag`, `Panel`, `Modal`, `PageState` |
| `AppShell` dựng lại ở mỗi trang | `AppLayout` (route layout) + `AppPage` |
| Khóa i18n dạng hash `s8c7bae12fd` trong `packages/ui` | Khóa có nghĩa trong `base` |
| Biến CSS kiểu UniFlow (`--bg-surface-card`, `--text-primary`…) và file `.less` không dùng | Token `--color-*` |
| Trạng thái "AI approved/AI recovered" của UniFlow trong `StatusTag` | Bốn tone chung: success/processing/warning/error |
