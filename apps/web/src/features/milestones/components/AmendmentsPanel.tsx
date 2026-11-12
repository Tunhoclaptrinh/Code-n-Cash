import { useEffect, useState } from "react";
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tag,
} from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type {
  Amendment,
  ContractNotice,
  ContractOverview,
  MilestoneRow,
} from "@codecash/contracts";
import { ApiError } from "@/shared/api/client";
import {
  decideAmendment,
  proposeAmendment,
  withdrawAmendment,
} from "@/shared/api/domain";
import { formatDate, formatDateTime } from "@/shared/lib/format";
import { TechnicalDetails } from "@/shared/ui/TechnicalInfo";

const STATE_COLOR: Record<Amendment["state"], string> = {
  PROPOSED: "processing",
  ACCEPTED: "success",
  REJECTED: "error",
  WITHDRAWN: "default",
};
/** A milestone whose payment is decided keeps its due date (the API refuses a change). */
const DECIDED = new Set([
  "REJECTED",
  "COMPLETED",
  "ELIGIBLE_FOR_PAYMENT",
  "PAID_WITH_PENALTY",
]);
const isDecided = (m: MilestoneRow) => m.paid || DECIDED.has(m.status);
export const amendmentCode = (number: number) =>
  `PL-${String(number).padStart(2, "0")}`;

function useFailure() {
  const { t: td } = useTranslation("domain");
  const { message } = AntApp.useApp();
  return (error: unknown) =>
    message.error(
      td(`errors.${error instanceof ApiError ? error.code : "UNKNOWN"}`, {
        defaultValue: td("errors.UNKNOWN"),
      }),
    );
}

/** What needs attention on the whole contract, said once above its tabs. */
export function ContractNotices({
  notices,
  onAmend,
}: {
  notices: ContractNotice[];
  onAmend?: () => void;
}) {
  const { t } = useTranslation("milestones");
  if (!notices.length) return null;
  const amend = onAmend ? (
    <Button size="small" onClick={onAmend}>
      {t("amendments.propose")}
    </Button>
  ) : undefined;
  return (
    <Space orientation="vertical" size={8} style={{ width: "100%" }}>
      {notices.map((notice) => (
        <Alert
          key={notice.code}
          data-testid={`contract-notice-${notice.code}`}
          showIcon
          type={
            notice.code === "SETTLED"
              ? "success"
              : notice.code === "SIGNED_AFTER_START"
                ? "info"
                : "warning"
          }
          title={t(`notices.${notice.code}`, {
            milestones:
              notice.code === "MISSING_DUE_DATE"
                ? notice.milestones.map((n) => `MS${n}`).join(", ")
                : "",
            days: notice.code === "SIGNED_AFTER_START" ? notice.days : 0,
            date: notice.code === "PAST_END" ? formatDate(notice.date) : "",
            count: notice.code === "PAST_END" ? notice.open : 0,
          })}
          action={notice.code === "SETTLED" ? undefined : amend}
        />
      ))}
    </Space>
  );
}

/** Proposes new due dates for open milestones and/or a later end date, with the reason. */
export function AmendmentFormModal({
  open,
  data,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  data: ContractOverview;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const queryClient = useQueryClient();
  const failed = useFailure();
  const [form] = Form.useForm<{
    reason: string;
    endDate: string;
    dueDates: Record<string, string>;
  }>();
  // Filled once when the form opens; a live refetch of the contract must not wipe what is typed.
  useEffect(() => {
    if (open)
      form.setFieldsValue({
        reason: "",
        endDate: data.contract.endDate,
        dueDates: Object.fromEntries(
          data.milestones.map((m) => [String(m.sequence), m.dueDate]),
        ),
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the form opens
  }, [open, form]);
  const submit = useMutation({
    mutationFn: proposeAmendment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["milestones"] });
      onClose();
      onSubmitted?.();
    },
    onError: failed,
  });
  return (
    <Modal
      open={open}
      title={t("amendments.form.title", {
        code: amendmentCode(data.amendments.length + 1),
      })}
      okText={t("amendments.form.submit")}
      confirmLoading={submit.isPending}
      onCancel={onClose}
      width={720}
      destroyOnHidden
      onOk={() =>
        void form.validateFields().then((values) =>
          submit.mutate({
            contractId: data.contract.id,
            reason: values.reason,
            endDate:
              values.endDate && values.endDate !== data.contract.endDate
                ? values.endDate
                : null,
            // Only the dates that actually change are sent.
            dueDates: data.milestones
              .filter(
                (m) =>
                  !isDecided(m) &&
                  values.dueDates?.[String(m.sequence)] &&
                  values.dueDates[String(m.sequence)] !== m.dueDate,
              )
              .map((m) => ({
                sequence: m.sequence,
                dueDate: values.dueDates[String(m.sequence)],
              })),
          }),
        )
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title={t("amendments.form.notice")}
      />
      <Form form={form} layout="vertical" requiredMark>
        <Form.Item
          name="reason"
          label={t("amendments.fields.reason")}
          rules={[
            { required: true, message: t("amendments.form.reasonRequired") },
          ]}
        >
          <Input.TextArea
            rows={2}
            maxLength={2000}
            showCount
            data-testid="amendment-reason"
          />
        </Form.Item>
        <Form.Item
          name="endDate"
          label={t("amendments.fields.endDate")}
          extra={t("amendments.form.endDateHint", {
            date: formatDate(data.contract.endDate),
          })}
        >
          <Input
            type="date"
            min={data.contract.endDate}
            data-testid="amendment-end-date"
          />
        </Form.Item>
        <Table<MilestoneRow>
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={data.milestones}
          columns={[
            {
              key: "milestone",
              title: t("amendments.fields.milestone"),
              render: (_, m) => (
                <>
                  <b>MS{m.sequence}</b> {td(`milestoneType.${m.type}`)}
                </>
              ),
            },
            {
              key: "current",
              title: t("amendments.fields.currentDue"),
              render: (_, m) =>
                m.dueDate ? formatDate(m.dueDate) : t("amendments.noDate"),
            },
            {
              key: "new",
              title: t("amendments.fields.newDue"),
              render: (_, m) =>
                isDecided(m) ? (
                  <Tag style={{ margin: 0 }}>{t("amendments.locked")}</Tag>
                ) : (
                  <Form.Item name={["dueDates", String(m.sequence)]} noStyle>
                    <Input
                      type="date"
                      size="small"
                      data-testid={`amendment-due-${m.sequence}`}
                    />
                  </Form.Item>
                ),
            },
          ]}
        />
      </Form>
    </Modal>
  );
}

/** The contract's amendments, with the answer the signed-in user may give to the open one. */
export function AmendmentsPanel({
  data,
  onPropose,
}: {
  data: ContractOverview;
  onPropose: () => void;
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const queryClient = useQueryClient();
  const failed = useFailure();
  const { modal } = AntApp.useApp();
  const [rejecting, setRejecting] = useState<Amendment | null>(null);
  const [note, setNote] = useState("");
  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: ["milestones"] });
    setRejecting(null);
    setNote("");
  };
  const decide = useMutation({
    mutationFn: decideAmendment,
    onSuccess: done,
    onError: failed,
  });
  const withdraw = useMutation({
    mutationFn: withdrawAmendment,
    onSuccess: done,
    onError: failed,
  });
  const contractId = data.contract.id;
  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      <Alert type="info" showIcon title={t("amendments.intro")} />
      {data.canProposeAmendment ? (
        <div>
          <Button
            type="primary"
            onClick={onPropose}
            data-testid="amendment-propose"
          >
            {t("amendments.propose")}
          </Button>
        </div>
      ) : null}
      {data.amendments.length ? null : (
        <Empty description={t("amendments.empty")} />
      )}
      {data.amendments.map((amendment) => (
        <Card
          key={amendment.id}
          size="small"
          data-testid="amendment-card"
          title={
            <Space size={8} wrap>
              <b>{amendmentCode(amendment.number)}</b>
              <Tag color={STATE_COLOR[amendment.state]} style={{ margin: 0 }}>
                {t(`amendments.state.${amendment.state}`)}
              </Tag>
            </Space>
          }
          extra={
            amendment.state === "PROPOSED" ? (
              <Space size={8} wrap>
                {data.canDecideAmendment ? (
                  <>
                    <Button
                      danger
                      onClick={() => setRejecting(amendment)}
                      data-testid="amendment-reject"
                    >
                      {t("amendments.reject")}
                    </Button>
                    <Button
                      type="primary"
                      loading={decide.isPending}
                      data-testid="amendment-accept"
                      onClick={() =>
                        modal.confirm({
                          title: t("amendments.acceptConfirm.title", {
                            code: amendmentCode(amendment.number),
                          }),
                          content: t("amendments.acceptConfirm.body"),
                          okText: t("amendments.accept"),
                          onOk: () =>
                            decide.mutateAsync({
                              contractId,
                              amendmentId: amendment.id,
                              choice: "ACCEPT",
                            }),
                        })
                      }
                    >
                      {t("amendments.accept")}
                    </Button>
                  </>
                ) : null}
                {data.canWithdrawAmendment ? (
                  <Button
                    loading={withdraw.isPending}
                    onClick={() =>
                      withdraw.mutate({
                        contractId,
                        amendmentId: amendment.id,
                      })
                    }
                    data-testid="amendment-withdraw"
                  >
                    {t("amendments.withdraw")}
                  </Button>
                ) : null}
              </Space>
            ) : null
          }
        >
          <Space orientation="vertical" size={6} style={{ width: "100%" }}>
            <span>
              <b>{t("amendments.fields.reason")}:</b> {amendment.reason}
            </span>
            <ul style={{ margin: 0, paddingInlineStart: 20 }}>
              {amendment.endDate ? (
                <li>
                  {t("amendments.change.endDate", {
                    from: formatDate(amendment.endDate.from),
                    to: formatDate(amendment.endDate.to),
                  })}
                </li>
              ) : null}
              {amendment.dueDates.map((change) => (
                <li key={change.sequence}>
                  {t("amendments.change.dueDate", {
                    milestone: `MS${change.sequence}`,
                    name: td(
                      `milestoneType.${
                        data.milestones.find(
                          (m) => m.sequence === change.sequence,
                        )?.type ?? "SIGNING"
                      }`,
                    ),
                    from: change.from
                      ? formatDate(change.from)
                      : t("amendments.noDate"),
                    to: formatDate(change.to),
                  })}
                </li>
              ))}
            </ul>
            <span style={{ color: "var(--color-text-secondary)" }}>
              {t("amendments.proposed", {
                name: amendment.proposedBy.name,
                at: formatDateTime(amendment.proposedAt),
              })}
              {amendment.decidedBy
                ? ` · ${t(`amendments.decided.${amendment.state}`, {
                    name: amendment.decidedBy.name,
                    at: formatDateTime(amendment.decidedAt ?? ""),
                  })}`
                : ""}
              {amendment.decisionNote ? ` · “${amendment.decisionNote}”` : ""}
            </span>
            <TechnicalDetails
              items={[
                {
                  key: "digest",
                  label: t("amendments.digest"),
                  value: amendment.digest,
                },
              ]}
            />
          </Space>
        </Card>
      ))}
      <Modal
        open={!!rejecting}
        title={t("amendments.rejectTitle", {
          code: rejecting ? amendmentCode(rejecting.number) : "",
        })}
        okText={t("amendments.reject")}
        okButtonProps={{ danger: true, disabled: !note.trim() }}
        confirmLoading={decide.isPending}
        onCancel={() => setRejecting(null)}
        onOk={() =>
          rejecting &&
          decide.mutate({
            contractId,
            amendmentId: rejecting.id,
            choice: "REJECT",
            note,
          })
        }
      >
        <Input.TextArea
          rows={3}
          maxLength={2000}
          value={note}
          placeholder={t("amendments.rejectPlaceholder")}
          onChange={(event) => setNote(event.target.value)}
          data-testid="amendment-reject-note"
        />
      </Modal>
    </Space>
  );
}
