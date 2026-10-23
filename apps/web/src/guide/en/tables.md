# Search, filters, paging and export

Contract, task, exception, activity, Data Pack and administration lists share table tools. The user's access scope is applied before search and filters.

![Tools: 1 statistics; 2 tabs; 3 upload; 4 search; 5 filters; 6 refresh; 7 export; 8 column filter; 9 row actions; 10 guide](../../../public/guide/images/contracts.webp)

## Search and narrow results

Enter a code or words described by the search placeholder. Search ignores case and Vietnamese accents: `thiet bi` matches “thiết bị”. All words must match. Results update about 300 ms after typing stops.

![Accent-insensitive search and matching total](../../../public/guide/images/table-search.webp)

Statistics, tabs, filter conditions and column filters combine. If nothing appears, clear the search and existing filters and check the active tab. **Total** counts all matching rows, while paging limits the rows currently visible.

1. Open **Filters**, add a field, select an available operator and value, then apply.
2. Use the funnel or search icon in a column header for a column-specific filter.
3. Click sortable column headings to set order.
4. Changing search, filters, sort or page size returns to page 1. Refresh retains the current query.

![Filter condition editor](../../../public/guide/images/table-filter-builder.webp)

![Column filter](../../../public/guide/images/table-column-filter.webp)

> Current base-component limitation: disabling a condition with its individual toggle does not remove it from the query. Delete the condition to stop applying it.

## Export

![Format, scope and column selection](../../../public/guide/images/table-export.webp)

Choose CSV or JSON, then current page, all matching rows or the first N rows. Select the columns and confirm. Export uses the current search, filters and order. “All” stays within your access scope.

The base dialog may label the current page as “10 records” even when the selected page size differs; the actual file uses the current page and its real row count.

## Import and details

Import appears only for permitted administrative resources. Download that resource's template, preview validation results and import valid rows. See [Administration](/guide/admin). Click a record name for a quick view; expand its detail dialog for more space. Open the dedicated workflow page to submit evidence, approve or sign.
