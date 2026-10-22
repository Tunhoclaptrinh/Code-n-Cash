import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  App as AntApp,
  Button,
  Descriptions,
  Empty,
  Form,
  Input,
  Progress,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import {
  ArrowRightOutlined,
  EditOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { ConfirmModal, useAccess } from "@codecash/ui";
import { useCurrentUser } from "@/shared/auth/session";
import { formatDate, formatMillionVnd } from "@/shared/lib/format";
import { ExpandableModal } from "@/shared/ui/ExpandableModal";
import { PageState } from "@/shared/ui/PageState";
import { getContractOverview } from "@/features/milestones/api/contracts.api";
import { StatusBadge } from "@/features/milestones/components/StatusBadge";
import type { MilestoneRow } from "@/features/milestones/types";
import { cancelSigning } from "@/features/signing/api/signingFlow.api";
import {
  getContractDraft,
  getUploadFormOptions,
  saveContractDraft,
} from "../api/contractDraft.api";
import type { ContractRow } from "../types";

/**
 * Contract record in a modal that can fill the screen: overview, milestones, people and files,
 * plus the domain actions the user may take here. Contracts are workflow records, so there is
 * no generic delete; an unsigned draft can be edited and its signing sequence cancelled.
 */
export function ContractModal({
  contract,
  statusTag,
  onClose,
}: {
  contract?: ContractRow;
  statusTag: (contract: ContractRow) => React.ReactNode;
  onClose: () => void;
}) {
  const { t } = useTranslation("contracts");
  const { t: tm } = useTranslation("milestones");
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const user = useCurrentUser();
  const { hasPermission } = useAccess(user);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [form] = Form.useForm<{ title: string; supplierId: string }>();
  const code = contract?.code ?? "";
  const overview = useQuery({
    queryKey: ["milestones", "overview", code],
    queryFn: () => getContractOverview(code),
    enabled: !!contract,
  });
  const unsigned = contract?.status === "AWAITING_SIGNATURE";
  const canEdit =
    unsigned &&
    !!contract?.isNewlyDigitized &&
    hasPermission("contracts:draft-write");
  const canCancel = unsigned && hasPermission("signing:cancel");
  const options = useQuery({
    queryKey: ["contracts", "upload-options", user.organizationId],
    queryFn: () => getUploadFormOptions(user.organizationId),
    enabled: editing,
  });
  const refresh = () =>
    cache.invalidateQueries({
      predicate: (q) =>
        ["contract-summaries", "milestones"].includes(String(q.queryKey[0])),
    });
  const save = useMutation({
    mutationFn: async (values: { title: string; supplierId: string }) => {
      const draft = await getContractDraft();
      return saveContractDraft({ ...draft, ...values });
    },
    onSuccess: async () => {
      message.success(t("contractList.modal.saved"));
      setEditing(false);
      await refresh();
      onClose();
    },
    onError: (error) => message.error(String(error)),
  });
  const cancel = useMutation({
    mutationFn: () => cancelSigning(code),
    onSuccess: async () => {
      message.success(t("contractList.modal.cancelled"));
      setConfirmCancel(false);
      await refresh();
    },
    onError: (error) => message.error(String(error)),
  });
  const close = () => {
    setEditing(false);
    onClose();
  };
  const data = overview.data;
  const paidPercent = data
    ? Math.round((data.settledMillion / data.valueMillion) * 100)
    : 0;

  const milestoneColumns = [
    {
      key: "no",
      title: tm("detail.tabs.milestones"),
      render: (_: unknown, m: MilestoneRow) => (
        <Typography.Text strong>
          {tm("detail.milestone.name", {
            no: m.no,
            name: tm(`milestoneKind.${m.kind}`),
          })}
        </Typography.Text>
      ),
    },
    {
      key: "due",
      title: t("contractList.modal.due"),
      render: (_: unknown, m: MilestoneRow) => formatDate(m.dueDate),
    },
    {
      key: "planned",
      title: t("contractList.table.columns.value"),
      align: "right" as const,
      render: (_: unknown, m: MilestoneRow) =>
        formatMillionVnd(m.plannedMillion),
    },
    {
      key: "status",
      title: t("contractList.table.columns.status"),
      render: (_: unknown, m: MilestoneRow) => (
        <StatusBadge status={m.status} />
      ),
    },
    {
      key: "paid",
      title: t("contractList.modal.paid"),
      align: "right" as const,
      render: (_: unknown, m: MilestoneRow) =>
        m.payableMillion === undefined
          ? "—"
          : formatMillionVnd(m.payableMillion),
    },
  ];

  return (
    <>
      <ExpandableModal
        open={!!contract}
        onClose={close}
        title={
          contract ? (
            <Space wrap size={8}>
              <span>
                {contract.code} · {contract.title}
              </span>
              {statusTag(contract)}
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
              {canEdit && !editing ? (
                <Button
                  icon={<EditOutlined />}
                  onClick={() => {
                    form.setFieldsValue({
                      title: contract.title,
                      supplierId: contract.supplierId,
                    });
                    setEditing(true);
                  }}
                >
                  {t("contractList.modal.edit")}
                </Button>
              ) : null}
              {editing ? (
                <>
                  <Button onClick={() => setEditing(false)}>
                    {t("contractList.modal.discard")}
                  </Button>
                  <Button
                    type="primary"
                    loading={save.isPending}
                    onClick={() => form.submit()}
                  >
                    {t("contractList.modal.save")}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    icon={<SafetyCertificateOutlined />}
                    onClick={() => navigate(`/verify/${contract.code}`)}
                  >
                    {t("contractList.actions.verify")}
                  </Button>
                  <Button
                    type="primary"
                    icon={<ArrowRightOutlined />}
                    iconPlacement="end"
                    onClick={() => navigate(`/contracts/${contract.code}`)}
                  >
                    {t("contractList.modal.openPage")}
                  </Button>
                </>
              )}
            </Space>
          ) : null
        }
      >
        {editing && contract ? (
          <Form
            form={form}
            layout="vertical"
            onFinish={(values) => save.mutate(values)}
          >
            <Form.Item
              name="title"
              label={t("contractList.detail.title")}
              rules={[{ required: true, max: 250 }]}
            >
              <Input showCount maxLength={250} />
            </Form.Item>
            <Form.Item
              name="supplierId"
              label={t("contractList.table.columns.supplier")}
              rules={[{ required: true }]}
            >
              <Select
                loading={options.isPending}
                options={(options.data?.suppliers ?? []).map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
              />
            </Form.Item>
            <Typography.Paragraph type="secondary">
              {t("contractList.modal.editHint")}
            </Typography.Paragraph>
          </Form>
        ) : overview.isPending ? (
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
                          key: "supplier",
                          label: t("contractList.table.columns.supplier"),
                          children: contract.supplierName,
                        },
                        {
                          key: "kind",
                          label: t("contractList.modal.kind"),
                          children: tm(`contractKind.${data.kind}`),
                        },
                        {
                          key: "value",
                          label: t("contractList.table.columns.value"),
                          children: formatMillionVnd(data.valueMillion),
                        },
                        {
                          key: "milestones",
                          label: t("contractList.table.columns.progress"),
                          children: `${contract.milestonesDone}/${contract.milestonesTotal}`,
                        },
                      ]}
                    />
                    <div>
                      <Typography.Text strong>
                        {tm("detail.payment.title")}
                      </Typography.Text>
                      <Progress
                        percent={paidPercent}
                        success={{
                          percent: Math.round(
                            ((data.settledMillion - data.penaltyMillion) /
                              data.valueMillion) *
                              100,
                          ),
                        }}
                      />
                      <Space wrap size={6}>
                        <Tag color="success">
                          {tm("detail.payment.settled")}:{" "}
                          {formatMillionVnd(data.settledMillion)}
                        </Tag>
                        <Tag color="warning">
                          {tm("detail.payment.penalty")}:{" "}
                          {formatMillionVnd(data.penaltyMillion)}
                        </Tag>
                        <Tag>
                          {tm("detail.payment.notDue")}:{" "}
                          {formatMillionVnd(data.notDueMillion)}
                        </Tag>
                      </Space>
                    </div>
                  </Space>
                ),
              },
              {
                key: "milestones",
                label: tm("detail.tabs.milestones"),
                children: (
                  <Table<MilestoneRow>
                    size="small"
                    rowKey="no"
                    dataSource={data.milestones}
                    columns={milestoneColumns}
                    pagination={false}
                    scroll={{ x: "max-content" }}
                  />
                ),
              },
              {
                key: "participants",
                label: tm("detail.tabs.participants"),
                children: data.participants.map((person) => (
                  <div
                    key={person.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 0",
                      borderTop: "1px solid var(--border-divider)",
                    }}
                  >
                    <Typography.Text strong>{person.name}</Typography.Text>
                    <Tag style={{ margin: 0 }}>
                      {tm(`participantRole.${person.role}`)}
                    </Tag>
                  </div>
                )),
              },
              {
                key: "documents",
                label: tm("detail.tabs.documents"),
                children: data.documents.length ? (
                  data.documents.map(({ milestoneNo, file }) => (
                    <div
                      key={`${milestoneNo}-${file.id}`}
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
                          {file.fileName}
                        </Typography.Text>{" "}
                        <Typography.Text type="secondary">
                          MS{milestoneNo}
                        </Typography.Text>
                      </span>
                      <Tag
                        color={file.signature?.valid ? "success" : "default"}
                        style={{ margin: 0 }}
                      >
                        {file.signature?.valid
                          ? tm("common.signatureValid")
                          : tm("submit.file.unsigned")}
                      </Tag>
                    </div>
                  ))
                ) : (
                  <Empty description={tm("detail.documents.empty")} />
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
        content={t("contractList.modal.cancelBody", { code })}
        confirmText={t("contractList.modal.cancelSigning")}
        cancelText={t("contractList.modal.discard")}
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
        onCancel={() => setConfirmCancel(false)}
      />
    </>
  );
}
