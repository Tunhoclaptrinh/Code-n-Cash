import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Row,
  Col,
  Card,
  Statistic,
  Select,
  Progress,
  Tag,
  Typography,
  Space,
  Alert,
} from "antd";
import { DataTable } from "@codecash/ui";
import type { ContractStatus } from "@/shared/api/types";
import { useCurrentUser } from "@/shared/auth/session";
import { AppShell } from "@/shared/layout/AppShell";
import { formatMillionVnd } from "@/shared/lib/format";
import { getContractList } from "../api/contractList.api";
import type { ContractRow } from "../types";
const STATUSES: ContractStatus[] = [
  "AWAITING_SIGNATURE",
  "DISPUTED",
  "AWAITING_EVIDENCE",
  "COMPLETED",
];
export default function ContractListPage() {
  const { t } = useTranslation("contracts");
  const user = useCurrentUser(),
    navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ContractStatus | "">("");
  const list = useQuery({
    queryKey: ["contract-summaries", user.id],
    queryFn: () =>
      getContractList({
        id: user.id,
        role: user.role,
        organizationId: user.organizationId,
      }),
  });
  const contracts = list.data?.contracts ?? [];
  const visible = useMemo(
    () =>
      contracts.filter(
        (c) =>
          (!status || c.status === status) &&
          [c.code, c.title, c.supplierName].some((x) =>
            x.toLowerCase().includes(search.toLowerCase()),
          ),
      ),
    [contracts, status, search],
  );
  const perspective = user.role === "SUPPLIER" ? "supplier" : "buyer";
  const tiles = [
    {
      key: "signature",
      count: contracts.filter((c) => c.waitingFor.kind === "OWNER_SIGNS_FIRST")
        .length,
    },
    {
      key: "dispute",
      count: contracts.filter((c) => c.status === "DISPUTED").length,
    },
    {
      key: "evidence",
      count: contracts.filter((c) => c.status === "AWAITING_EVIDENCE").length,
    },
    {
      key: "completed",
      count: contracts.filter((c) => c.status === "COMPLETED").length,
    },
  ];
  const columns = [
    {
      key: "contract",
      title: t("contractList.table.columns.contract"),
      render: (_: unknown, c: ContractRow) => (
        <>
          <Typography.Text strong>{c.code}</Typography.Text>
          {c.isNewlyDigitized ? (
            <Tag color="blue">{t("contractList.newlyDigitized")}</Tag>
          ) : null}
          <div>{c.title}</div>
        </>
      ),
    },
    {
      key: "supplierName",
      dataIndex: "supplierName",
      title: t("contractList.table.columns.supplier"),
    },
    {
      key: "valueMillion",
      dataIndex: "valueMillion",
      title: t("contractList.table.columns.value"),
      render: (v: number) => formatMillionVnd(v),
    },
    {
      key: "progress",
      title: t("contractList.table.columns.progress"),
      render: (_: unknown, c: ContractRow) => (
        <div style={{ minWidth: 150 }}>
          <Progress
            percent={Math.round((c.milestonesDone / c.milestonesTotal) * 100)}
            size="small"
          />
          {t(
            `contractList.progress.${c.deductedMilestones ? "milestonesDeducted" : "milestones"}`,
            {
              done: c.milestonesDone,
              total: c.milestonesTotal,
              deducted: c.deductedMilestones,
            },
          )}
        </div>
      ),
    },
    {
      key: "status",
      dataIndex: "status",
      title: t("contractList.table.columns.status"),
      render: (s: ContractStatus) => (
        <Tag
          color={
            s === "COMPLETED"
              ? "success"
              : s === "DISPUTED"
                ? "error"
                : "processing"
          }
        >
          {t(`contractList.status.${s}`)}
        </Tag>
      ),
    },
    {
      key: "waiting",
      title: t("contractList.table.columns.waiting"),
      render: (_: unknown, c: ContractRow) => <WaitingFor contract={c} />,
    },
    {
      key: "actions",
      title: t("contractList.table.columns.actions"),
      render: (_: unknown, c: ContractRow) => {
        const sign =
          user.role === "CONTRACT_OWNER" &&
          c.waitingFor.kind === "OWNER_SIGNS_FIRST";
        return (
          <Button
            type={sign ? "primary" : "default"}
            onClick={() =>
              navigate(`/contracts/${c.code}${sign ? "/signing" : ""}`)
            }
          >
            {t(`contractList.actions.${sign ? "signNow" : "open"}`)}
          </Button>
        );
      },
    },
  ];
  return (
    <AppShell
      active="contracts"
      showNotifications
      breadcrumb={[
        { label: t("breadcrumb.home") },
        { label: t("breadcrumb.contracts") },
      ]}
    >
      <Space
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div>
          <Typography.Title level={2}>
            {t("contractList.title")}
          </Typography.Title>
          <Typography.Text type="secondary">
            {t("contractList.subtitle", {
              count: contracts.length,
              organization: list.data?.organizationName,
            })}
          </Typography.Text>
        </div>
        {user.role === "CONTRACT_OWNER" ? (
          <Button type="primary" onClick={() => navigate("/contracts/new")}>
            {t("contractList.upload")}
          </Button>
        ) : null}
      </Space>
      <Row gutter={[16, 16]}>
        {tiles.map((tile) => (
          <Col xs={12} xl={6} key={tile.key}>
            <Card>
              <Statistic
                title={t(`contractList.tiles.${perspective}.${tile.key}`)}
                value={tile.count}
              />
            </Card>
          </Col>
        ))}
      </Row>
      <Space style={{ marginBottom: 16 }}>
        <Select
          value={status}
          onChange={setStatus}
          style={{ minWidth: 220 }}
          options={[
            { value: "", label: t("contractList.filters.allStatuses") },
            ...STATUSES.map((value) => ({
              value,
              label: t(`contractList.status.${value}`),
            })),
          ]}
        />
      </Space>
      {list.isError ? <Alert type="error" title={String(list.error)} /> : null}
      <DataTable<ContractRow>
        dataSource={visible}
        columns={columns}
        rowKey="code"
        loading={list.isPending}
        searchValue={search}
        onSearch={setSearch}
      />
    </AppShell>
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
