import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Dropdown,
  Progress,
  Space,
  Tag,
  Typography,
} from "antd";
import type { MenuProps } from "antd";
import {
  ArrowRightOutlined,
  AuditOutlined,
  EditOutlined,
  EyeOutlined,
  FileSearchOutlined,
  MenuOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import {
  DataTable,
  IconButton,
  PageContainer,
  exportToCSV,
  exportToJSON,
  useAccess,
  useFilters,
  usePagination,
  type FilterConfig,
  type StatisticsItem,
} from "@codecash/ui";
import type { ContractStatus } from "@/shared/api/types";
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import { formatMillionVnd } from "@/shared/lib/format";
import { columnSearch } from "@/shared/ui/columnSearch";
import { getContractList } from "../api/contractList.api";
import { ContractModal } from "../components/ContractModal";
import type { ContractRow } from "../types";

const STATUSES: ContractStatus[] = [
  "AWAITING_SIGNATURE",
  "DISPUTED",
  "AWAITING_EVIDENCE",
  "COMPLETED",
];
const statusColor: Record<ContractStatus, string> = {
  AWAITING_SIGNATURE: "processing",
  DISPUTED: "error",
  AWAITING_EVIDENCE: "warning",
  COMPLETED: "success",
};
const tileStatus = {
  signature: "AWAITING_SIGNATURE",
  dispute: "DISPUTED",
  evidence: "AWAITING_EVIDENCE",
  completed: "COMPLETED",
} as const;
const tileColor = {
  signature: { bg: "rgba(49, 91, 234, 0.08)", value: "#315bea" },
  dispute: { bg: "rgba(239, 68, 68, 0.08)", value: "#EF4444" },
  evidence: { bg: "rgba(245, 158, 11, 0.08)", value: "#F59E0B" },
  completed: { bg: "rgba(16, 185, 129, 0.08)", value: "#10B981" },
};

type Filters = { supplierName?: string; status?: ContractStatus };

export default function ContractListPage() {
  const { t } = useTranslation("contracts");
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [tab, setTab] = useState<ContractStatus | "ALL">("ALL");
  const [detail, setDetail] = useState<ContractRow>();
  const { filters, updateFilter, clearFilters } = useFilters<Filters>({});
  const { page, pageSize, goToPage, handleTableChange } = usePagination(1, 10);
  const list = useQuery({
    queryKey: ["contract-summaries", user.id],
    queryFn: () =>
      getContractList({
        id: user.id,
        role: user.role,
        organizationId: user.organizationId,
      }),
  });
  const contracts = useMemo(() => list.data?.contracts ?? [], [list.data]);
  const visible = useMemo(
    () =>
      contracts.filter(
        (c) =>
          (tab === "ALL" || c.status === tab) &&
          (!filters.status || c.status === filters.status) &&
          (!filters.supplierName || c.supplierName === filters.supplierName),
      ),
    [contracts, tab, filters],
  );
  const perspective = user.role === "SUPPLIER" ? "supplier" : "buyer";
  const { hasPermission } = useAccess(user);
  const canUpload = hasPermission("contracts:draft-write");
  const canSign = (c: ContractRow) =>
    user.role === "CONTRACT_OWNER" && c.waitingFor.kind === "OWNER_SIGNS_FIRST";

  const changeTab = (key: string) => {
    setTab(key as ContractStatus | "ALL");
    goToPage(1);
  };
  const statistics: StatisticsItem[] = (
    Object.keys(tileStatus) as (keyof typeof tileStatus)[]
  ).map((key) => ({
    title: t(`contractList.tiles.${perspective}.${key}`),
    value:
      key === "signature"
        ? contracts.filter((c) => c.waitingFor.kind === "OWNER_SIGNS_FIRST")
            .length
        : contracts.filter((c) => c.status === tileStatus[key]).length,
    backgroundColor: tileColor[key].bg,
    valueColor: tileColor[key].value,
    selected: tab === tileStatus[key],
    onClick: () => changeTab(tab === tileStatus[key] ? "ALL" : tileStatus[key]),
  }));
  const supplierOptions = [...new Set(contracts.map((c) => c.supplierName))]
    .sort()
    .map((value) => ({ value, label: value }));
  const filterConfig: FilterConfig[] = [
    {
      key: "supplierName",
      label: t("contractList.table.columns.supplier"),
      type: "select",
      options: supplierOptions,
    },
    {
      key: "status",
      label: t("contractList.filters.statusLabel"),
      type: "select",
      options: STATUSES.map((value) => ({
        value,
        label: t(`contractList.status.${value}`),
      })),
    },
  ];

  const waitingText = (c: ContractRow) => {
    const { waitingFor } = c;
    if (waitingFor.kind === "NOTHING") return t("contractList.waiting.NOTHING");
    const self =
      waitingFor.kind === "SUPPLIER_SUBMITS_EVIDENCE"
        ? user.role === "SUPPLIER"
        : user.role === "CONTRACT_OWNER";
    return t(
      `contractList.waiting.${waitingFor.kind}.${self ? "self" : "other"}`,
      {
        milestoneNo: "milestoneNo" in waitingFor ? waitingFor.milestoneNo : "",
      },
    ).replace(/<\/?b>/g, "");
  };
  const progressText = (c: ContractRow) =>
    t(
      `contractList.progress.${c.deductedMilestones ? "milestonesDeducted" : "milestones"}`,
      {
        done: c.milestonesDone,
        total: c.milestonesTotal,
        deducted: c.deductedMilestones,
      },
    );
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
      onClick: () => navigate(`/contracts/${c.code}`),
    },
    {
      key: "verify",
      icon: <SafetyCertificateOutlined />,
      label: t("contractList.actions.verify"),
      onClick: () => navigate(`/verify/${c.code}`),
    },
    ...(user.role === "SUPPLIER"
      ? []
      : [
          {
            key: "activity",
            icon: <AuditOutlined />,
            label: t("contractList.actions.activity"),
            onClick: () => navigate("/activity-log"),
          },
        ]),
  ];

  const columns = [
    {
      key: "code",
      dataIndex: "code",
      title: t("contractList.table.columns.contract"),
      sorter: (a: ContractRow, b: ContractRow) => a.code.localeCompare(b.code),
      ...columnSearch<ContractRow>((c) => `${c.code} ${c.title}`),
      render: (_: unknown, c: ContractRow) => (
        <div style={{ cursor: "pointer" }} onClick={() => setDetail(c)}>
          <Space size={6} wrap>
            <Typography.Text strong style={{ whiteSpace: "nowrap" }}>
              {c.code}
            </Typography.Text>
            {c.isNewlyDigitized ? (
              <Tag color="blue" style={{ margin: 0 }}>
                {t("contractList.newlyDigitized")}
              </Tag>
            ) : null}
          </Space>
          <div>{c.title}</div>
        </div>
      ),
    },
    {
      key: "supplierName",
      dataIndex: "supplierName",
      title: t("contractList.table.columns.supplier"),
      sorter: (a: ContractRow, b: ContractRow) =>
        a.supplierName.localeCompare(b.supplierName),
      filters: supplierOptions.map((o) => ({ text: o.label, value: o.value })),
      filterSearch: true,
      onFilter: (value: unknown, c: ContractRow) => c.supplierName === value,
    },
    {
      key: "valueMillion",
      dataIndex: "valueMillion",
      title: t("contractList.table.columns.value"),
      align: "right" as const,
      sorter: (a: ContractRow, b: ContractRow) =>
        a.valueMillion - b.valueMillion,
      render: (v: number) => formatMillionVnd(v),
    },
    {
      key: "progress",
      title: t("contractList.table.columns.progress"),
      width: 200,
      render: (_: unknown, c: ContractRow) => (
        <>
          <Progress
            percent={Math.round((c.milestonesDone / c.milestonesTotal) * 100)}
            size="small"
          />
          <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
            {progressText(c)}
          </Typography.Text>
        </>
      ),
    },
    {
      key: "status",
      dataIndex: "status",
      title: t("contractList.table.columns.status"),
      filters: STATUSES.map((value) => ({
        text: t(`contractList.status.${value}`),
        value,
      })),
      onFilter: (value: unknown, c: ContractRow) => c.status === value,
      render: (s: ContractStatus) => (
        <Tag color={statusColor[s]}>{t(`contractList.status.${s}`)}</Tag>
      ),
    },
    {
      key: "waiting",
      title: t("contractList.table.columns.waiting"),
      render: (_: unknown, c: ContractRow) => <WaitingFor contract={c} />,
    },
  ];

  const exportRows = (rows: ContractRow[]) =>
    rows.map((c) => ({
      [t("contractList.table.columns.contract")]: c.code,
      [t("contractList.detail.title")]: c.title,
      [t("contractList.table.columns.supplier")]: c.supplierName,
      [t("contractList.table.columns.value")]: c.valueMillion,
      [t("contractList.table.columns.progress")]: progressText(c),
      [t("contractList.table.columns.status")]: t(
        `contractList.status.${c.status}`,
      ),
      [t("contractList.table.columns.waiting")]: waitingText(c),
    }));

  return (
    <AppPage
      active="contracts"
      breadcrumb={[{ label: t("breadcrumb.contracts") }]}
    >
      <PageContainer
        title={t("contractList.title")}
        subtitle={t("contractList.subtitle", {
          count: contracts.length,
          organization: list.data?.organizationName ?? "",
        })}
      >
        {list.isError ? (
          <Alert type="error" showIcon title={String(list.error)} />
        ) : null}
        <DataTable<ContractRow>
          rowKey="code"
          dataSource={visible}
          columns={columns}
          loading={list.isPending}
          statisticsData={statistics}
          tabs={[
            { key: "ALL", label: t("contractList.tabs.ALL") },
            ...STATUSES.map((key) => ({
              key,
              label: t(`contractList.status.${key}`),
            })),
          ]}
          activeTab={tab}
          onTabChange={changeTab}
          searchPlaceholder={t("contractList.filters.searchPlaceholder")}
          searchFields={["code", "title", "supplierName"]}
          filters={filterConfig}
          filterValues={filters}
          onFilterChange={(key, value) => {
            updateFilter(key as keyof Filters, value || undefined);
            goToPage(1);
          }}
          onClearFilters={clearFilters}
          onRefresh={() => void list.refetch()}
          pagination={{ current: page, pageSize }}
          onPaginationChange={handleTableChange}
          exportable
          onExport={(options) => {
            const rows = exportRows(
              options.scope === "page"
                ? visible.slice((page - 1) * pageSize, page * pageSize)
                : options.scope === "custom"
                  ? visible.slice(0, options.limit)
                  : visible,
            );
            if (options.format === "json") exportToJSON(rows, "contracts");
            else exportToCSV(rows, "contracts");
          }}
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
          customActions={(c) => (
            <Space size={4}>
              {canSign(c) ? (
                <IconButton
                  icon={<EditOutlined />}
                  tooltip={t("contractList.actions.signNow")}
                  success
                  onClick={() => navigate(`/contracts/${c.code}/signing`)}
                />
              ) : (
                <IconButton
                  icon={<FileSearchOutlined />}
                  tooltip={t("contractList.actions.open")}
                  onClick={() => navigate(`/contracts/${c.code}`)}
                />
              )}
              <Dropdown
                menu={{ items: menuFor(c) }}
                trigger={["click"]}
                placement="bottomRight"
              >
                <IconButton
                  icon={<MenuOutlined />}
                  tooltip={t("contractList.actions.more")}
                />
              </Dropdown>
            </Space>
          )}
        />
      </PageContainer>
      <ContractModal
        contract={detail}
        statusTag={(c) => (
          <Tag color={statusColor[c.status]} style={{ margin: 0 }}>
            {t(`contractList.status.${c.status}`)}
          </Tag>
        )}
        onClose={() => setDetail(undefined)}
      />
    </AppPage>
  );
}

function WaitingFor({ contract }: { contract: ContractRow }) {
  const { t } = useTranslation("contracts");
  const { role } = useCurrentUser();
  const { waitingFor } = contract;

  if (waitingFor.kind === "NOTHING")
    return <>{t("contractList.waiting.NOTHING")}</>;

  const isSelf =
    waitingFor.kind === "SUPPLIER_SUBMITS_EVIDENCE"
      ? role === "SUPPLIER"
      : role === "CONTRACT_OWNER";
  const milestoneNo =
    "milestoneNo" in waitingFor ? waitingFor.milestoneNo : undefined;

  return (
    <Trans
      t={t}
      i18nKey={`contractList.waiting.${waitingFor.kind}.${isSelf ? "self" : "other"}`}
      values={{ milestoneNo }}
      components={{ b: <b /> }}
    />
  );
}
