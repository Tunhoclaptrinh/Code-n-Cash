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
                        ImportPreviewModal, columnSearch, DomainTags
    api/ auth/ lib/     Client có xác thực, lệnh nghiệp vụ (domain.ts), phiên đăng nhập, định dạng
  features/<miền>/      api/ components/ pages/ lib/ types.ts
  locales/{vi,en}/      Một namespace cho mỗi miền + common
```

`AppLayout` theo `MainLayout` của UniFlow: header cao 56 px (logo bên trái; hướng dẫn, ngôn ngữ, sáng/tối, thông báo, tài khoản bên phải), sidebar 240/70 px bên dưới header với nút thu gọn tròn, khối "Môi trường" ở chân sidebar. Dưới 992 px sidebar thành drawer. Layout được mount một lần cho mọi route; mỗi trang bọc nội dung bằng `AppPage` để khai báo mục menu và breadcrumb.

**Hàng tiêu đề.** `AppPage` vẽ breadcrumb làm tiêu đề trang: mục cuối là `<h1>` (22 px, 18 px trên điện thoại), các mục trước là đường dẫn; `tags` (nhãn trạng thái) đứng sau tiêu đề, `extra` (nút thao tác của trang) ở bên phải; tên tab trình duyệt theo mục cuối. Trang **không** đặt thêm `title`, `subtitle` hay `tooltip` cho `PageContainer` (trùng với breadcrumb). Chú thích quan trọng hiện bằng `<Alert type="info" showIcon />` ở đầu nội dung; chú thích không quan trọng thì bỏ. Tab chuyển giữa các danh sách đặt trong bảng (`DataTable` `tabs`), không tách thành thẻ riêng; tab của trang chi tiết (nội dung không phải bảng) vẫn dùng `PageContainer` `tabs`.

## 3. Mẫu trang danh sách (theo `SkuMappingTable` của UniFlow)

Mọi trang danh sách dùng đủ các phần sau của base. Trạng thái bảng (trang, cỡ trang, tìm kiếm, bộ lọc, lọc theo cột, sắp xếp) nằm ở **một chỗ** và đi kèm mỗi lần đọc dữ liệu, nên dòng hiển thị, ô "Tổng", menu lọc và tệp xuất luôn khớp nhau.

- **Danh sách nghiệp vụ** (hợp đồng, việc cần làm, ngoại lệ, nhật ký): đọc từng trang từ API (`contracts.listContracts`, `tasks.listTasks`, `exceptions.listExceptions`, `activity.listActivity`). Trang mẫu: [ContractListPage](../apps/web/src/features/contracts/pages/ContractListPage.tsx).
- **Một tài liệu đã có trong trình duyệt** (kết quả engine, ma trận quyền): cùng bộ máy, chạy tại chỗ qua `localList(rows, spec)`. Trang mẫu: [DataPage](../apps/web/src/features/platform/DataPage.tsx).
- **Tài nguyên CRUD**: `useResource` của base, đọc từng trang qua `/resources/:r`. Trang mẫu: [ResourcePage](../apps/web/src/features/platform/ResourcePage.tsx).

Bộ máy danh sách: [`apps/api/src/domain/listing.ts`](../apps/api/src/domain/listing.ts), bản sao đúng từng chữ ở `packages/contracts/src/listing.ts` (có test so khớp). Mỗi danh sách khai báo các trường (`ListSpec`): trường nào lọc được (`eq` một trong các giá trị, `contains` chứa chuỗi, `gte`/`lte` so từ đầu chuỗi như ngày ISO), trường nào sắp xếp được, trường nào có `facet` (giá trị riêng kèm số đếm trên toàn phạm vi, dùng cho thẻ thống kê và menu lọc). Tham số sai (trường lạ, cỡ trang > 100, thứ tự sắp xếp lạ) bị từ chối `INVALID_FILTER` / `INVALID_PAGINATION` / `INVALID_SORT`.

| Phần | Cách dùng |
| --- | --- |
| Khung | `AppPage` (breadcrumb là tiêu đề, `extra` là nút của trang) → `PageContainer` không tiêu đề → `DataTable` |
| Trạng thái bảng | `const list = useListQuery({ key, fetch, sort })` ([`shared/lib/useListQuery.ts`](../apps/web/src/shared/lib/useListQuery.ts)) rồi `<DataTable {...list.table} />`: tự có `dataSource`, `pagination` (tổng từ server), `onPaginationChange`, `searchValue`/`onSearch`, `filterValues`/`onFilterChange`/`onClearFilters`, `onRefresh`, `loading`, `exportLoading` |
| Thống kê | `statisticsData` tính từ `list.data.facets` (số trên toàn phạm vi); bấm thẻ gọi `list.setFilter(key, values)` |
| Tab nhanh | `activeTab` suy từ `list.filters`, `onTabChange` gọi `list.setFilter` (tab chính là một bộ lọc) |
| Tìm kiếm | Gửi lên cùng truy vấn sau 300 ms ngừng gõ; không phân biệt hoa thường và dấu ("thiet bi" tìm ra "thiết bị"); mọi từ đều phải có. Ghi `searchPlaceholder` nói rõ tìm trong cột nào |
| Bộ lọc | `filters` (`FilterConfig`) với **`operators: ["eq"]`** (bộ lọc ngày dùng `["gte"]`/`["lte"]`): trang chỉ nhận giá trị, nên không bày toán tử mà trang không áp dụng. Lựa chọn lấy từ `facets` |
| Lọc theo cột | `...list.column(key)` (điều khiển `filteredValue` và `sortOrder`), thêm `filters` + `filterMultiple: false`, cột chữ thêm `...columnSearch()`. **Không** dùng `onFilter` hay hàm `sorter`: lọc và sắp xếp ở nơi đọc dữ liệu. Khoá cột trùng tên trường của spec; bộ lọc và lọc theo cột cùng một trạng thái |
| Sắp xếp | `sorter: true` trên cột có trường `sort`; bấm lần ba trở về thứ tự mặc định |
| Chọn bản ghi liên kết | Trường có `ref` trong `resources.json`: `DebounceSelect` tìm từ xa, lưu id, hiển thị tên; bảng và tệp xuất có cột `<field>_name`; tìm kiếm khớp cả tên bản ghi được tham chiếu |
| Tải lại | `onRefresh` (có sẵn trong `list.table`) |
| Phân trang | Có sẵn: đổi bộ lọc, tìm kiếm, sắp xếp hay cỡ trang thì về trang 1; trang không còn tồn tại thì server trả trang cuối |
| Xuất | `onExport={(o) => void list.exporter(columns, values, tên)(o)}`: phạm vi trang hiện tại, tất cả (đọc lần lượt từng trang 100 dòng) hoặc N dòng đầu, đúng thứ tự đang xem; chỉ các cột đã chọn, mỗi cột ghi đúng điều cột đó hiển thị (một cột có thể ghi nhiều ô, ví dụ mã + tiêu đề). Tài nguyên CRUD xuất phía server `GET /resources/:r/export?format&columns&filters…` |
| Nhập | Chỉ tài nguyên CRUD: `GET …/template` → `POST …/import/validate` → `ImportPreviewModal` (báo lỗi từng dòng) → chỉ nhập dòng hợp lệ; `importColumns` là các trường của resource |
| Quyền | `useAccess(user).hasPermission("module:action")`; ẩn nút khi không có quyền, API vẫn kiểm lại |
| Thao tác hàng | `customActions` **thay thế** nút mặc định: dùng `TableRowActions` ở `apps/web/src/shared/ui` để giữ icon nhỏ trên **một dòng**, có tooltip và `aria-label` dịch đầy đủ; menu hamburger chứa đầy đủ tên thao tác. Cột rộng 104 px cho hai nút, 72 px cho một nút. Nút trên thanh công cụ/form như **Thêm mới**, Lưu, Tải lên vẫn phải có chữ; không đưa chữ dài vào từng hàng làm tăng chiều cao bảng |
| Xem chi tiết | `DetailModal` với `items`, có `onEdit`/`onDelete` nếu được sửa. Bản ghi dài (tab, bảng con): `ExpandableModal` có nút phóng toàn màn hình, ví dụ [ContractModal](../apps/web/src/features/contracts/components/ContractModal.tsx) |
| Thêm/sửa | `onAdd` (nút "Thêm mới") + `FormModal` với `Form.Item` có `rules` |
| Xóa | `ConfirmModal` (`danger`); xóa nhiều: `batchOperations` + `onBatchDelete` |

Hai giới hạn của base UniFlow (không sửa theo quy tắc mục 1): ô tích bật/tắt từng điều kiện trong hộp Bộ lọc chỉ đổi giao diện, muốn bỏ điều kiện thì bấm nút xoá của điều kiện đó; nhãn "Trang hiện tại (10 bản ghi)" trong hộp Xuất luôn ghi 10, còn tệp xuất ra đúng cỡ trang đang chọn.

Nhật ký kiểm toán chỉ có xem, lọc, xuất: không có sửa/xóa (CLAUDE.md).

## 4. Thêm một màn hình

1. Tạo `features/<miền>/pages/TenPage.tsx`, `export default`, bọc bằng `AppPage`:

   ```tsx
   <AppPage
     active="contracts"
     breadcrumb={[{ label: t("list.title") }]}
     extra={<Button>…</Button>}
   >
     <PageContainer>…</PageContainer>
   </AppPage>
   ```

2. Đăng ký trong `router.tsx` bằng `lazy: () => import(...).then(asRoute)`.
3. Mục menu mới: thêm vào `navConfig.ts`. Menu chia theo khu vực nghiệp vụ (`workflow()`, `monitoring()`, `dataAndAdmin()`, mỗi khu có `labelKey` làm tiêu đề nhóm); mục con (như Quản trị hệ thống) khai báo `children`, khóa của mục con là đường dẫn. Khi sidebar thu gọn, tiêu đề nhóm thành đường kẻ.
4. Thêm chuỗi vào **cả** `locales/vi/<ns>.json` và `locales/en/<ns>.json`.

Trang nghiệp vụ không phải danh sách (ký, phê duyệt, tranh chấp) lấy tiêu đề từ breadcrumb của `AppPage`, dùng `Panel` cho khối nội dung tự quản padding, `ToneTag` cho trạng thái, `PageState` cho đang tải/lỗi.

## 5. Màn chào lần đầu và đăng nhập demo

- Trang đăng nhập không hiện màn chào. Sau lần đăng nhập đầu tiên, ngay trên màn chính, hiện modal bắt chọn ngôn ngữ và giao diện; nút "Bắt đầu" chỉ bật khi đã chọn cả hai, lựa chọn áp dụng ngay.
- Chọn xong, ba nút Hướng dẫn, Ngôn ngữ, Sáng/tối trên header cùng nhấp nháy và một thẻ gợi ý giải thích; bấm "Đã hiểu" hoặc ra ngoài để đóng.
- Trạng thái lưu ở `localStorage["codecash.onboarding"] = "done"`; xóa khóa này để xem lại từ đầu. Nút Hướng dẫn trên header mở lại thẻ gợi ý bất cứ lúc nào.
- Mã: [`shared/onboarding`](../apps/web/src/shared/onboarding/), [`PreferenceControls`](../apps/web/src/shared/layout/PreferenceControls.tsx).
- Khi API bật `DEMO_LOGIN` (mặc định ngoài production), góc phải trang đăng nhập có menu "Tài khoản demo" lấy từ `GET /auth/demo-accounts`; chọn một tài khoản là điền email và đăng nhập ngay (`POST /auth/demo-login`). Menu có nhóm gợi ý (chín tài khoản: Nova An, Phú Minh và bốn người nội bộ) và nhóm "Tất cả tổ chức trong Data Pack". API chỉ nhận tài khoản mẫu (nguồn `SEED`) còn hoạt động và ghi `LOGIN_DEMO` vào nhật ký.

## 6. Phân quyền

- Nguồn duy nhất: [`packages/contracts/permissions.json`](../packages/contracts/permissions.json), khóa dạng `module:action` (Base), mỗi vai trò có phạm vi `own`/`org`/`all`.
- API: `@RequirePermission("engine:evaluate")` trên route; `BaseService` kiểm `<resource>:<read|create|update|delete|import|export>`; mỗi hành động workflow ánh xạ tới một quyền trong `workflow.controller.ts` (thiếu ánh xạ là bị từ chối).
- Web: `user.permissions` (API tính từ vai trò) → `useAccess(user)`. Trang **Ma trận phân quyền** (`/platform/permissions`) chỉ đọc: đổi quyền cần người thứ hai duyệt (SoD-3, SoD-4) nên đi qua review mã.
- Tám vai trò, 61 quyền; ba vai trò nội bộ tách nhau (kiểm soát viên, quản trị hệ thống, kiểm toán, SoD-1); vai trò nào làm gì xem [09 — Tính năng và vai trò](09_HUONG_DAN_TINH_NANG_VA_VAI_TRO.md). Thẩm quyền nghiệp vụ (bên nào ghi loại sự kiện nào, ai được duyệt) do API và engine kiểm thêm, không suy từ quyền giao diện.
- Resource có `managedOrigins` trong `resources.json`: bản ghi có nguồn tương ứng chỉ xem và xuất ở `ResourcePage` (ẩn sửa/xóa, API trả `MANAGED_RECORD`); bảng có cột **Nguồn** khi bản ghi mang `origin`.

## 7. Trang Data Pack và bộ dữ liệu tải lên

- Nguồn dữ liệu: Data Pack chính thức hoặc bộ dữ liệu người dùng tải lên ([DatasetPanel](../apps/web/src/features/platform/components/DatasetPanel.tsx)). Tải lên nhận CSV rời hoặc ZIP của cả thư mục; engine tìm tệp theo tên và báo tệp nào đủ, thiếu, thiếu cột trước khi chạy.
- Không có `submission_output_template.csv` thì engine dựng 22 cột theo thứ tự `milestones.csv`. Mặc định xuất đủ template; `*test_ids*.csv` không tự thu hẹp đầu ra. Chỉ CLI chẩn đoán có `--apply-scope` mới lọc mốc; không dùng tùy chọn này cho bài nộp BTC.
- "Tải kết quả": `submission_output.csv`, `audit.json`, `metrics.json` do engine ghi (`GET /engine/datasets/:id/files/:file`). Quyền `engine:datasets`.
- Khối **Chỉ số KPI** hiện `summary.kpi` của engine (đặc tả mục 15): độ chính xác, Macro-F1, UPR, giữ thừa, khớp tiền trên mẫu có nhãn; độ phủ, truy vết, thời gian trên mọi mốc. Không có nhãn thì các ô theo nhãn ghi "Không kèm nhãn mẫu".

## 8. Dữ liệu, nghiệp vụ, i18n

- Đọc/ghi qua module trong `features/<miền>/api/` hoặc `shared/api`; TanStack Query với `queryKey` chứa `user.id`. Trình duyệt không quyết định nghiệp vụ; ESLint chặn import mã server.
- Nghiệp vụ hợp đồng gọi qua [`shared/api/domain.ts`](../apps/web/src/shared/api/domain.ts) (`POST /workflow/:module/:action`). Mọi lệnh ghi phát sự kiện `codecash:workflow-changed`, phiên đăng nhập làm mới các khóa trong `WORKFLOW_KEYS`. Kiểu dữ liệu ở `packages/contracts/src/workflow.ts`, bản sao đúng từng chữ của `apps/api/src/domain/types.ts` (có test so khớp).
- Nhãn nguồn, trạng thái, quyết định: `OriginTag`, `MilestoneStatusTag`, `ContractStatusTag`, `DecisionTag` trong [`shared/ui/DomainTags.tsx`](../apps/web/src/shared/ui/DomainTags.tsx); tông màu và câu "ai làm tiếp" ở `shared/lib/domain.ts`; chuỗi ở namespace `domain`.
- Mọi số tiền là chuỗi thập phân (triệu VND): hiển thị bằng `formatDecimalString`, cộng bằng `sumDecimalStrings`; không đổi sang số thực. Ngày giờ: `formatDate`, `formatDateTime`.
- Mọi chuỗi hiển thị, gồm `aria-label`, `placeholder`, tooltip, qua i18n; số đếm dùng `key_one`/`key_other`.

## 9. Kiểm tra trước khi mở PR

```bash
pnpm check              # typecheck, lint (0 warning), format:check, build, test
pnpm dev                # rồi, ở terminal khác:
pnpm test:browser       # đăng nhập demo theo vai trò, màn chào, 32 màn desktop/mobile, hàng đợi ngoại lệ, kiểm tra toàn vẹn, phát lại,
                        # phê duyệt → PENALTY, modal toàn màn, tải và chạy bộ dữ liệu, tạo/xóa qua base;
                        # ảnh ở artifacts/browser
pnpm test:e2e           # smoke HTTP: quyền, phạm vi, CRUD, workflow, engine
```

Hai lệnh smoke cần API chạy trên dữ liệu vừa khởi tạo (kịch bản phê duyệt chỉ chạy được một lần). Đổi địa chỉ bằng `WEB_URL` và `API_BASE_URL`, ví dụ API thử ở cổng khác với `DATA_DIR` riêng.

## 10. Không tạo lại

| Đã gỡ | Thay bằng |
| --- | --- |
| `shared/ui/controls.tsx` (`UiButton`, `UiInput` bọc antd bằng `as any`) | Ant Design trực tiếp hoặc phần tử HTML gốc |
| Shim `features/milestones/components/{Button,Badge,Card,ConfirmDialog,PageMessage}` | `Button`, `ToneTag`, `Panel`, `Modal`, `PageState` |
| `AppShell` dựng lại ở mỗi trang | `AppLayout` + `AppPage` |
| Thanh lọc tự dựng bằng `Select`/`DatePicker` trên trang danh sách | `filters` + FilterBuilder của `DataTable` |
| Khóa i18n dạng hash trong `packages/ui` | Khóa có nghĩa trong namespace `base` |

## 11. Form trống và điền mẫu

Mỗi form chỉ có **một nút Điền mẫu toàn bộ** ở đầu form; không đặt nút cạnh từng nhãn. Form tạo mới bắt đầu trống; dữ liệu hồ sơ đã lưu và trường chỉ đọc do hệ thống cấp vẫn giữ nguyên. `DemoFillButton`/`DemoFormFill` ở `apps/web/src/shared/ui` dùng chung hàm `fillEmptyInputs`: chỉ điền ô trống, giữ 0/false và các lựa chọn đã nhập, không gọi API ghi. Nạp đề xuất trích xuất/ngày gợi ý/anchor là thao tác riêng dùng dữ liệu thực; không tạo quyết định phê duyệt. `/contracts/new` tạo hồ sơ mới chưa lưu, `?draft=CODE` mở đúng bản nháp theo quyền. Không sửa base `packages/ui`.

Form tải hợp đồng chia nhóm thông tin, thanh toán, ký và tài liệu. Danh sách người ký dùng grid theo chiều rộng thực của form: một dòng trên desktop, hai dòng trên màn hẹp; các thao tác chuyển lên/xuống/bỏ nằm trong menu **Thao tác** có chữ. Không lặp lại chuỗi tên người ký bên dưới danh sách. Chú thích dài đặt trong tooltip truy cập được bằng bàn phím; lỗi và cảnh báo nghiệp vụ vẫn hiện trực tiếp. Nội dung hợp đồng co giãn 3–8 dòng; bộ đếm và chú thích ở hàng riêng để không đè nhau. Giữ nút sinh DOCX/tải tệp tách khỏi nút điền mẫu, vì đây là thao tác tạo tài liệu thật.

Cấu hình Vite `resolve.dedupe` giữ một runtime React, i18next/react-i18next và React Query giữa web và `@codecash/ui`. Monorepo có thể sinh nhiều đường dẫn peer theo phiên bản TypeScript; nếu không dedupe, form và nút base có thể dùng ngôn ngữ/context khác nhau dù cùng phiên bản package. Kiểm browser phải chuyển sang tiếng Việt và xác nhận nút base **Xuất** cùng ngôn ngữ với form, trên bản build thật. Khi chạy smoke/ảnh hướng dẫn, luôn ghi rõ `STORAGE_DRIVER=file` cùng `DATA_DIR` riêng; chỉ đặt `DATA_DIR` không ngăn được `.env` chọn Mongo.
