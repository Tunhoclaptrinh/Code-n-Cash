import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  App as AntApp,
  Button,
  Descriptions,
  Progress,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import {
  ArrowRightOutlined,
  FormOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { ConfirmModal, useAccess } from "@codecash/ui";
import type { EventRow, MilestoneRow } from "@codecash/contracts";
import { ApiError } from "@/shared/api/client";
import { cancelSigning, getContractOverview } from "@/shared/api/domain";
import { useCurrentUser } from "@/shared/auth/session";
import { useDemoMode } from "@/shared/auth/useDemoMode";
import {
  actorName,
  contractHeading,
  describeNext,
  peopleOf,
} from "@/shared/lib/domain";
import {
  formatDate,
  formatDateTime,
  formatDecimalString,
} from "@/shared/lib/format";
import { MilestoneStatusTag, OriginTag } from "@/shared/ui/DomainTags";
import { ExpandableModal } from "@/shared/ui/ExpandableModal";
import { PageState } from "@/shared/ui/PageState";
import { TrackingCode } from "@/shared/ui/TechnicalInfo";
import type { ContractRow } from "../types";

const percentOf = (part: string, whole: string) =>
  Number(whole) > 0
    ? Math.round((Number(part) / Number(whole)) * 1000) / 10
    : 0;

/**
 * Quick view of a contract in a modal that can fill the screen: terms, milestones with the engine's
 * decision, people and events. Contracts are workflow records, so there is no generic edit or
 * delete; a draft continues in the upload wizard and an unsigned sequence can be cancelled.
 */
export function ContractModal({
  contract,
  statusTag,
  onClose,
}: {
  contract?: ContractRow;
  statusTag: (contract: ContractRow) => ReactNode;
  onClose: () => void;
}) {
  const { t } = useTranslation("contracts");
  const { t: td } = useTranslation("domain");
  const { t: tm } = useTranslation("milestones");
  const { message } = AntApp.useApp();
  const demo = useDemoMode();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const user = useCurrentUser();
  const { hasPermission } = useAccess(user);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const id = contract?.id ?? "";
  const overview = useQuery({
    queryKey: ["milestones", "overview", id],
    queryFn: () => getContractOverview(id),
    enabled: !!contract,
  });
  const data = overview.data;
  const canCancel =
    contract?.status === "AWAITING_SIGNATURE" &&
    contract.signing?.signed === 0 &&
    hasPermission("signing:cancel");
  const canCompleteDraft =
    contract?.status === "DRAFT" && hasPermission("contracts:draft-write");
  const cancel = useMutation({
    mutationFn: () => cancelSigning(id),
    onSuccess: async () => {
      message.success(t("contractList.modal.cancelled"));
      setConfirmCancel(false);
      await cache.invalidateQueries({ queryKey: ["contract-summaries"] });
      onClose();
    },
    onError: (error) =>
      message.error(
        td(`errors.${error instanceof ApiError ? error.code : "UNKNOWN"}`, {
          defaultValue: td("errors.UNKNOWN"),
        }),
      ),
  });

  const milestoneColumns = [
    {
      key: "sequence",
      title: t("contractList.modal.milestone"),
      render: (_: unknown, m: MilestoneRow) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>
            {td("milestoneNo", { no: m.sequence })} ·{" "}
            {td(`milestoneType.${m.type}`)}
          </Typography.Text>
          <TrackingCode code={m.id} />
        </Space>
      ),
    },
    {
      key: "due",
      title: t("contractList.modal.due"),
      render: (_: unknown, m: MilestoneRow) =>
        m.dueDate ? formatDate(m.dueDate) : "—",
    },
    {
      key: "planned",
      title: t("contractList.table.columns.value"),
      align: "right" as const,
      render: (_: unknown, m: MilestoneRow) =>
        formatDecimalString(m.plannedMillion),
    },
    {
      key: "status",
      title: t("contractList.table.columns.status"),
      render: (_: unknown, m: MilestoneRow) => (
        <MilestoneStatusTag status={m.status} />
      ),
    },
    {
      key: "payable",
      title: t("contractList.modal.paid"),
      align: "right" as const,
      render: (_: unknown, m: MilestoneRow) =>
        formatDecimalString(m.payableMillion),
    },
    {
      key: "next",
      title: t("contractList.table.columns.waiting"),
      render: (_: unknown, m: MilestoneRow) => describeNext(td, m.next),
    },
  ];
  const eventColumns = [
    {
      key: "at",
      title: t("contractList.modal.at"),
      render: (_: unknown, e: EventRow) => formatDateTime(e.at),
    },
    {
      key: "type",
      title: t("contractList.modal.event"),
      render: (_: unknown, e: EventRow) => (
        <Typography.Text strong>{td(`eventType.${e.type}`)}</Typography.Text>
      ),
    },
    {
      key: "actor",
      title: t("contractList.modal.actor"),
      render: (_: unknown, e: EventRow) =>
        e.recordedBy ??
        actorName(td, e.actor, peopleOf(data?.participants ?? [])),
    },
  ];

  return (
    <>
      <ExpandableModal
        open={!!contract}
        onClose={onClose}
        title={
          contract ? (
            <Space wrap size={8}>
              <span>{contractHeading(contract)}</span>
              {statusTag(contract)}
              <OriginTag origin={contract.origin} />
            </Space>
          ) : null
        }
        footer={
          contract ? (
            <Space wrap style={{ justifyContent: "flex-end", width: "100%" }}>
              {canCancel ? (
                <Button
                  danger
                  icon={<StopOutlined />}
                  onClick={() => setConfirmCancel(true)}
                >
                  {t("contractList.modal.cancelSigning")}
                </Button>
              ) : null}
              {canCompleteDraft ? (
                <Button
                  type="primary"
                  icon={<FormOutlined />}
                  onClick={() =>
                    navigate(
                      `/contracts/new?draft=${encodeURIComponent(contract.id)}`,
                    )
                  }
                >
                  {t("contractList.actions.completeDraft")}
                </Button>
              ) : null}
              {contract.signing ? (
                <Button
                  icon={<SafetyCertificateOutlined />}
                  onClick={() => navigate(`/verify/${contract.id}`)}
                >
                  {t("contractList.actions.verify")}
                </Button>
              ) : null}
              <Button
                type={canCompleteDraft ? "default" : "primary"}
                icon={<ArrowRightOutlined />}
                iconPlacement="end"
                onClick={() => navigate(`/contracts/${contract.id}`)}
              >
                {t("contractList.modal.openPage")}
              </Button>
            </Space>
          ) : null
        }
      >
        {overview.isPending ? (
          <PageState kind="loading" />
        ) : overview.isError || !data || !contract ? (
          <PageState kind="error" onRetry={() => void overview.refetch()} />
        ) : (
          <Tabs
            items={[
              {
                key: "overview",
                label: t("contractList.modal.overview"),
                children: (
                  <Space
                    direction="vertical"
                    size={16}
                    style={{ width: "100%" }}
                  >
                    <Descriptions
                      bordered
                      size="small"
                      column={{ xs: 1, md: 2 }}
                      items={[
                        {
                          key: "buyer",
                          label: t("contractList.table.columns.buyer"),
                          children: contract.buyer.name,
                        },
                        {
                          key: "supplier",
                          label: t("contractList.table.columns.supplier"),
                          children: contract.supplier.name,
                        },
                        {
                          key: "kind",
                          label: t("contractList.filters.typeLabel"),
                          children: td(`contractType.${contract.type}`),
                        },
                        {
                          key: "policy",
                          label: t("contractList.filters.policyLabel"),
                          children: td(`policy.${contract.approvalPolicy}`),
                        },
                        {
                          key: "value",
                          label: t("contractList.table.columns.value"),
                          children: formatDecimalString(contract.valueMillion),
                        },
                        {
                          key: "term",
                          label: t("contractList.modal.term"),
                          children: `${formatDate(contract.startDate)} – ${formatDate(contract.endDate)}`,
                        },
                        {
                          key: "penalty",
                          label: t("contractList.modal.penaltyTerms"),
                          children: t("contractList.modal.penaltyValue", {
                            grace: data.graceDays,
                            rate: data.penaltyRatePct,
                            cap: data.maxPenaltyPct,
                          }),
                        },
                      ]}
                    />
                    <div>
                      <Progress
                        percent={percentOf(
                          data.totals.eligibleMillion,
                          data.totals.valueMillion,
                        )}
                        success={{
                          percent: percentOf(
                            data.totals.paidMillion,
                            data.totals.valueMillion,
                          ),
                        }}
                      />
                      <Space wrap size={6}>
                        <Tag color="success">
                          {t("contractList.modal.eligible")}:{" "}
                          {formatDecimalString(data.totals.eligibleMillion)}
                        </Tag>
                        {Number(data.totals.penaltyMillion) !== 0 ? (
                          <Tag color="warning">
                            {t("contractList.modal.penalty")}:{" "}
                            {formatDecimalString(data.totals.penaltyMillion)}
                          </Tag>
                        ) : null}
                        <Tag color="processing">
                          {t("contractList.modal.held")}:{" "}
                          {formatDecimalString(data.totals.heldMillion)}
                        </Tag>
                        {Number(data.totals.rejectedMillion) !== 0 ? (
                          <Tag color="error">
                            {t("contractList.modal.rejected")}:{" "}
                            {formatDecimalString(data.totals.rejectedMillion)}
                          </Tag>
                        ) : null}
                        <Tag>
                          {t("contractList.modal.transferred")}:{" "}
                          {formatDecimalString(data.totals.paidMillion)}
                        </Tag>
                      </Space>
                    </div>
                  </Space>
                ),
              },
              {
                key: "milestones",
                label: t("contractList.modal.milestones", {
                  count: data.milestones.length,
                }),
                children: (
                  <Table<MilestoneRow>
                    size="small"
                    rowKey="id"
                    dataSource={data.milestones}
                    columns={milestoneColumns}
                    pagination={false}
                    scroll={{ x: "max-content" }}
                    onRow={(m) => ({
                      style: { cursor: "pointer" },
                      onClick: () =>
                        navigate(
                          `/contracts/${contract.id}/milestones/${m.sequence}/decision`,
                        ),
                    })}
                  />
                ),
              },
              {
                key: "participants",
                label: t("contractList.modal.participants"),
                children: data.participants.map((person) => (
                  <div
                    key={`${person.kind}-${person.partyId}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "8px 0",
                      borderTop: "1px solid var(--border-divider)",
                    }}
                  >
                    <span>
                      <Typography.Text strong>
                        {person.personName ?? person.name}
                      </Typography.Text>{" "}
                      <Typography.Text type="secondary">
                        {person.personName
                          ? [
                              person.side === "BUYER"
                                ? contract.buyer.name
                                : contract.supplier.name,
                              demo ? person.email : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : null}
                      </Typography.Text>
                    </span>
                    <Space size={4} wrap>
                      <Tag style={{ margin: 0 }}>
                        {person.approvalRole
                          ? td(`approvalRole.${person.approvalRole}`)
                          : td(`side.${person.side}`)}
                      </Tag>
                      {(data.signing?.steps ?? [])
                        .filter(
                          (step) =>
                            !!person.email && step.signerEmail === person.email,
                        )
                        .map((step) => (
                          <Tag
                            key={step.stepNo}
                            color="purple"
                            style={{ margin: 0 }}
                          >
                            {tm("detail.signing.step", { step: step.stepNo })}
                          </Tag>
                        ))}
                    </Space>
                  </div>
                )),
              },
              {
                key: "events",
                label: t("contractList.modal.events", {
                  count: data.events.length,
                }),
                children: (
                  <Table<EventRow>
                    size="small"
                    rowKey="id"
                    dataSource={[...data.events].reverse()}
                    columns={eventColumns}
                    pagination={{ pageSize: 8, hideOnSinglePage: true }}
                    scroll={{ x: "max-content" }}
                  />
                ),
              },
            ]}
          />
        )}
      </ExpandableModal>
      <ConfirmModal
        open={confirmCancel}
        danger
        title={t("contractList.modal.cancelSigning")}
        content={t("contractList.modal.cancelBody", { code: id })}
        confirmText={t("contractList.modal.cancelSigning")}
        cancelText={t("contractList.modal.discard")}
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
        onCancel={() => setConfirmCancel(false)}
      />
    </>
  );
}
