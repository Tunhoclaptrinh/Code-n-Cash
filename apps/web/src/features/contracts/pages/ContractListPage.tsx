import { TableRowActions } from "@/shared/ui/TableRowActions";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Progress, Space, Tag, Typography } from "antd";
import type { MenuProps } from "antd";
import {
  ArrowRightOutlined,
  AuditOutlined,
  EditOutlined,
  EyeOutlined,
  FileSearchOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import {
  DataTable,
  PageContainer,
  useAccess,
  type FilterConfig,
  type StatisticsItem,
} from "@codecash/ui";
import type { ContractStatus } from "@codecash/contracts";
import { listContracts } from "@/shared/api/domain";
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import { describeNext } from "@/shared/lib/domain";
import { formatDecimalString } from "@/shared/lib/format";
import { useListQuery } from "@/shared/lib/useListQuery";
import { columnSearch } from "@/shared/ui/columnSearch";
import { ContractStatusTag, OriginTag } from "@/shared/ui/DomainTags";
import { ContractModal } from "../components/ContractModal";
import type { ContractRow } from "../types";

const STATUSES: ContractStatus[] = [
  "PENDING_CONDITIONS",
  "NEEDS_REVIEW",
  "AWAITING_SIGNATURE",
  "DRAFT",
  "ALL_MILESTONES_ELIGIBLE",
  "CLOSED",
];
type Tile = "YOUR_TURN" | ContractStatus;
const tiles: Array<{
  key: Tile;
  statuses: ContractStatus[] | null;
  bg: string;
  value: string;
}> = [
  {
    key: "YOUR_TURN",
    statuses: null,
    bg: "rgba(49, 91, 234, 0.08)",
    value: "#315bea",
  },
  {
    key: "PENDING_CONDITIONS",
    statuses: ["PENDING_CONDITIONS"],
    bg: "rgba(245, 158, 11, 0.08)",
    value: "#F59E0B",
  },
  {
    key: "NEEDS_REVIEW",
    statuses: ["NEEDS_REVIEW"],
    bg: "rgba(239, 68, 68, 0.08)",
    value: "#EF4444",
  },
  {
    key: "AWAITING_SIGNATURE",
    statuses: ["AWAITING_SIGNATURE", "DRAFT"],
    bg: "rgba(99, 102, 241, 0.08)",
    value: "#6366F1",
  },
  {
    key: "ALL_MILESTONES_ELIGIBLE",
    statuses: ["ALL_MILESTONES_ELIGIBLE", "CLOSED"],
    bg: "rgba(16, 185, 129, 0.08)",
    value: "#10B981",
  },
];

const sameSet = (a: readonly unknown[] = [], b: readonly unknown[] = []) =>
  a.length === b.length && a.every((x) => b.includes(x));

/**
 * Contracts in the user's scope, read page by page from the API (spec 17). Search, the filter
 * builder, the column filters, the tiles, the tabs and the sort are one query, so the rows, the
 * total and the export always match what is on screen.
 */
export default function ContractListPage() {
  const { t } = useTranslation("contracts");
  const { t: td } = useTranslation("domain");
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ContractRow>();
  const list = useListQuery<
    ContractRow,
    Awaited<ReturnType<typeof listContracts>>
  >({
    auditExport: "contracts",
    key: ["contract-summaries", user.id],
    fetch: listContracts,
    sort: { by: "contract", order: "asc" },
  });
  const { filters, setFilter } = list;
  const facets = list.data?.facets ?? {};
  const supplierView = user.role === "SUPPLIER";
  // Controllers and auditors see every buyer, so the list gets a buyer column.
  const admin = user.role === "ADMIN_AUDITOR" || user.role === "AUDITOR";
  // The other party of the contract: the buyer for a supplier, the supplier for everyone else.
  const partnerKey = supplierView ? "buyer" : "supplier";
  const partnerOf = (c: ContractRow) =>
    supplierView ? c.buyer.name : c.supplier.name;
  const { hasPermission } = useAccess(user);
  const canUpload = hasPermission("contracts:draft-write");

  const count = (key: string, value: string) =>
    facets[key]?.find((f) => f.value === value)?.count ?? 0;
  const tileSelected = (tile: (typeof tiles)[number]) =>
    tile.statuses
      ? sameSet(filters.status, tile.statuses)
      : filters.yourTurn?.[0] === true;
  const statistics: StatisticsItem[] = tiles.map((tile, index) => ({
    colSpan: { xs: index === tiles.length - 1 ? 24 : 12, sm: 12, md: 6 },
    title: t(`contractList.tiles.${tile.key}`),
    value: tile.statuses
      ? tile.statuses.reduce((sum, s) => sum + count("status", s), 0)
      : count("yourTurn", "true"),
    backgroundColor: tile.bg,
    valueColor: tile.value,
    selected: tileSelected(tile),
    onClick: () =>
      tile.statuses
        ? setFilter("status", tileSelected(tile) ? undefined : tile.statuses)
        : setFilter("yourTurn", tileSelected(tile) ? undefined : [true]),
  }));
  const options = (key: string, label: (value: string) => string) =>
    (facets[key] ?? []).map((f) => ({ value: f.value, label: label(f.value) }));
  const filterConfig: FilterConfig[] = [
    {
      key: partnerKey,
      label: t(`contractList.table.columns.${partnerKey}`),
      type: "select",
      operators: ["eq"],
      options: options(partnerKey, (v) => v),
    },
    {
      key: "type",
      label: t("contractList.filters.typeLabel"),
      type: "select",
      operators: ["eq"],
      options: options("type", (v) => td(`contractType.${v}`)),
    },
    {
      key: "policy",
      label: t("contractList.filters.policyLabel"),
      type: "select",
      operators: ["eq"],
      options: options("policy", (v) => td(`policy.${v}`)),
    },
    {
      key: "origin",
      label: t("contractList.filters.originLabel"),
      type: "select",
      operators: ["eq"],
      options: options("origin", (v) => td(`origin.${v}`)),
    },
  ];

  const waitingText = (c: ContractRow) => {
    if (c.status === "DRAFT") return t("contractList.waiting.draft");
    if (c.signing && c.status === "AWAITING_SIGNATURE")
      return t("contractList.waiting.signing", {
        name: c.signing.currentSigner ?? "",
        signed: c.signing.signed,
        total: c.signing.total,
      });
    if (!c.next)
      return td(
        c.status === "NEEDS_REVIEW"
          ? "next.OUTSIDE_SYSTEM"
          : c.milestones.completed < c.milestones.eligible
            ? "next.TRANSFER"
            : "next.NONE",
      );
    return `${td("milestoneNo", { no: c.next.sequence })}: ${describeNext(td, c.next.step)}`;
  };
  const progressText = (c: ContractRow) =>
    t("contractList.progress.eligible", {
      eligible: c.milestones.eligible,
      total: c.milestones.total,
    });
  const menuFor = (c: ContractRow): MenuProps["items"] => [
    {
      key: "detail",
      icon: <EyeOutlined />,
      label: t("contractList.actions.detail"),
      onClick: () => setDetail(c),
    },
    {
      key: "open",
      icon: <FileSearchOutlined />,
      label: t("contractList.actions.open"),
      onClick: () => navigate(`/contracts/${c.id}`),
    },
    ...(c.signing
      ? [
          {
            key: "verify",
            icon: <SafetyCertificateOutlined />,
            label: t("contractList.actions.verify"),
            onClick: () => navigate(`/verify/${c.id}`),
          },
        ]
      : []),
    ...(supplierView
      ? []
      : [
          {
            key: "activity",
            icon: <AuditOutlined />,
            label: t("contractList.actions.activity"),
            onClick: () => navigate(`/activity-log?contract=${c.id}`),
          },
        ]),
  ];
  const primaryAction = (c: ContractRow) => {
    if (c.status === "DRAFT" && c.yourTurn)
      return {
        label: t("contractList.actions.completeDraft"),
        to: `/contracts/new?draft=${encodeURIComponent(c.id)}`,
      };
    if (c.status === "AWAITING_SIGNATURE" && c.yourTurn)
      return {
        label: t("contractList.actions.signNow"),
        to: `/contracts/${c.id}/signing`,
      };
    if (c.yourTurn && c.next)
      return {
        label: t("contractList.actions.act"),
        to: `/contracts/${c.id}/milestones/${c.next.sequence}/decision`,
      };
    return null;
  };

  const columns = [
    {
      ...list.column("contract"),
      title: t("contractList.table.columns.contract"),
      sorter: true,
      ...columnSearch(),
      render: (_: unknown, c: ContractRow) => (
        <div style={{ cursor: "pointer" }} onClick={() => setDetail(c)}>
          <Space size={6} wrap>
            <Typography.Text strong style={{ whiteSpace: "nowrap" }}>
              {c.id}
            </Typography.Text>
            <OriginTag origin={c.origin} />
            {c.openDispute ? (
              <Tag color="error" variant="filled" style={{ margin: 0 }}>
                {t("contractList.disputeFlag")}
              </Tag>
            ) : null}
          </Space>
          <div>{c.title}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
            {td(`contractType.${c.type}`)} · {td(`policy.${c.approvalPolicy}`)}
          </Typography.Text>
        </div>
      ),
    },
    ...(admin
      ? [
          {
            ...list.column("buyer"),
            title: t("contractList.table.columns.buyer"),
            sorter: true,
            filters: options("buyer", (v) => v).map((o) => ({
              text: o.label,
              value: o.value,
            })),
            filterMultiple: false,
            filterSearch: true,
            render: (_: unknown, c: ContractRow) => c.buyer.name,
          },
        ]
      : []),
    {
      ...list.column(partnerKey),
      title: t(`contractList.table.columns.${partnerKey}`),
      sorter: true,
      filters: options(partnerKey, (v) => v).map((o) => ({
        text: o.label,
        value: o.value,
      })),
      filterMultiple: false,
      filterSearch: true,
      render: (_: unknown, c: ContractRow) => partnerOf(c),
    },
    {
      ...list.column("valueMillion"),
      dataIndex: "valueMillion",
      title: t("contractList.table.columns.value"),
      align: "right" as const,
      sorter: true,
      render: (v: string) => formatDecimalString(v),
    },
    {
      key: "progress",
      title: t("contractList.table.columns.progress"),
      width: 200,
      render: (_: unknown, c: ContractRow) =>
        c.milestones.total ? (
          <>
            <Progress
              percent={Math.round(
                (c.milestones.eligible / c.milestones.total) * 100,
              )}
              success={{
                percent: Math.round(
                  (c.milestones.completed / c.milestones.total) * 100,
                ),
              }}
              status={c.milestones.rejected ? "exception" : undefined}
              size="small"
            />
            <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
              {progressText(c)}
              {c.milestones.hold
                ? ` · ${t("contractList.progress.hold", { count: c.milestones.hold })}`
                : ""}
              {c.milestones.penalty
                ? ` · ${t("contractList.progress.penalty", { count: c.milestones.penalty })}`
                : ""}
            </Typography.Text>
          </>
        ) : (
          <Typography.Text type="secondary">
            {t("contractList.progress.none")}
          </Typography.Text>
        ),
    },
    {
      ...list.column("status"),
      dataIndex: "status",
      title: t("contractList.table.columns.status"),
      filters: STATUSES.map((value) => ({
        text: td(`contractStatus.${value}`),
        value,
      })),
      render: (s: ContractStatus) => <ContractStatusTag status={s} />,
    },
    {
      ...list.column("nextDue"),
      title: t("contractList.table.columns.waiting"),
      sorter: true,
      render: (_: unknown, c: ContractRow) => (
        <span>
          {c.yourTurn ? (
            <Typography.Text strong style={{ color: "var(--color-primary)" }}>
              {t("contractList.waiting.you")}{" "}
            </Typography.Text>
          ) : null}
          {waitingText(c)}
        </span>
      ),
    },
  ];

  // Each table column exports what it shows; a column that bundles several facts exports each.
  const onExport = list.exporter(
    columns,
    {
      contract: (c) => ({
        [t("contractList.table.columns.contract")]: c.id,
        [t("contractList.detail.title")]: c.title,
        [t("contractList.filters.typeLabel")]: td(`contractType.${c.type}`),
        [t("contractList.filters.policyLabel")]: td(
          `policy.${c.approvalPolicy}`,
        ),
        [t("contractList.filters.originLabel")]: td(`origin.${c.origin}`),
      }),
      buyer: (c) => c.buyer.name,
      supplier: (c) => c.supplier.name,
      valueMillion: (c) => ({
        [t("contractList.table.columns.value")]: c.valueMillion,
        [t("contractList.table.columns.payable")]: c.payableMillion,
        [t("contractList.table.columns.penalty")]: c.penaltyMillion,
      }),
      progress: (c) => progressText(c),
      status: (c) => td(`contractStatus.${c.status}`),
      nextDue: (c) => waitingText(c),
    },
    "contracts",
  );
  const activeTab =
    filters.status?.length === 1 ? String(filters.status[0]) : "ALL";
  const presentTabs = STATUSES.filter((status) => count("status", status));

  return (
    <AppPage
      guide="contracts"
      active="contracts"
      breadcrumb={[{ label: t("breadcrumb.contracts") }]}
    >
      <PageContainer>
        {list.result.isError ? (
          <Alert type="error" showIcon title={String(list.result.error)} />
        ) : null}
        <DataTable<ContractRow>
          rowKey="id"
          scroll={{ x: 1800 }}
          columns={columns.map((column) => ({
            ...column,
            width:
              (
                {
                  contract: 280,
                  buyer: 190,
                  supplier: 190,
                  valueMillion: 150,
                  progress: 200,
                  status: 230,
                  nextDue: 250,
                } as Record<string, number>
              )[String(column.key)] ?? 200,
          }))}
          {...list.table}
          statisticsData={statistics}
          tabs={[
            { key: "ALL", label: t("contractList.tabs.ALL") },
            ...presentTabs.map((key) => ({
              key,
              label: td(`contractStatus.${key}`),
            })),
          ]}
          activeTab={activeTab}
          onTabChange={(key) =>
            setFilter("status", key === "ALL" ? undefined : [key])
          }
          searchPlaceholder={t("contractList.filters.searchPlaceholder")}
          filters={filterConfig}
          exportable
          exportFilename="contracts"
          onExport={(options) => void onExport(options)}
          extra={
            canUpload ? (
              <Button
                type="link"
                icon={<ArrowRightOutlined />}
                iconPlacement="end"
                onClick={() => navigate("/contracts/new")}
                data-testid="upload-contract-link"
              >
                {t("contractList.upload")}
              </Button>
            ) : null
          }
          actionsWidth={104}
          customActions={(c) => {
            const action = primaryAction(c);
            return (
              <TableRowActions
                primary={{
                  label: action?.label ?? t("contractList.actions.open"),
                  icon: action ? <EditOutlined /> : <FileSearchOutlined />,
                  onClick: () => navigate(action?.to ?? `/contracts/${c.id}`),
                }}
                menu={menuFor(c)}
                moreLabel={t("contractList.actions.more")}
              />
            );
          }}
        />
      </PageContainer>
      <ContractModal
        contract={detail}
        statusTag={(c) => <ContractStatusTag status={c.status} />}
        onClose={() => setDetail(undefined)}
      />
    </AppPage>
  );
}
