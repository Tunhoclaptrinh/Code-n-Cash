import { useState } from "react";
import {
  Alert,
  App as AntApp,
  Button,
  Input,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type {
  BusinessEventType,
  Digitization,
  DigitizedMilestone,
  MilestoneEdit,
} from "@codecash/contracts";
import { ApiError } from "@/shared/api/client";
import { editDigitizedMilestones } from "@/shared/api/domain";
import { sumDecimalStrings } from "@/shared/lib/format";

/** Every required-document type of the specification (spec 4.2). */
const EVENT_TYPES: BusinessEventType[] = [
  "CONTRACT_SIGNED",
  "KICKOFF_CONFIRMED",
  "REQUIREMENTS_APPROVED",
  "UAT_PASSED",
  "ACCEPTANCE",
  "DELIVERY",
  "INVOICE",
  "GO_LIVE",
  "SERVICE_ACTIVATED",
  "SERVICE_COMPLETED",
  "WARRANTY_COMPLETED",
];

const toEdit = (m: DigitizedMilestone): MilestoneEdit => ({
  sequence: m.sequence,
  paymentPercent: m.paymentPercent,
  dueDate: m.dueDate,
  eventTypes: m.eventTypes,
  latePenalty: !!m.penalty,
  approval: (m.approvalRoles ?? []).length ? "CONTRACT" : "NONE",
});

/**
 * Corrects the digitised milestones to what the signed document says. The form only helps; the
 * API checks the same rules (shares add up to 100%, dates in order inside the period, 1 to 6
 * distinct documents) and keeps who changed what.
 */
export function MilestoneEditor({
  data,
  onDone,
}: {
  data: Digitization;
  onDone: () => void;
}) {
  const { t } = useTranslation("signing");
  const { t: td } = useTranslation("domain");
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<MilestoneEdit[]>(() =>
    data.milestones.map(toEdit),
  );
  const approvalPossible = data.approvers.length > 0;
  const total = sumDecimalStrings(
    rows.map((row) => row.paymentPercent.replace(",", ".") || "0"),
  );
  const totalOk = total === "100.00";
  const save = useMutation({
    mutationFn: (input: { milestones?: MilestoneEdit[]; reset?: boolean }) =>
      editDigitizedMilestones(data.contractCode, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["signing"] });
      message.success(t("digitize.edit.saved"));
      onDone();
    },
    onError: (error) =>
      message.error(
        td(`errors.${error instanceof ApiError ? error.code : "UNKNOWN"}`, {
          defaultValue: td("errors.UNKNOWN"),
        }),
      ),
  });
  const patch = (sequence: number, change: Partial<MilestoneEdit>) =>
    setRows((all) =>
      all.map((row) =>
        row.sequence === sequence ? { ...row, ...change } : row,
      ),
    );
  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      <Alert type="info" showIcon title={t("digitize.edit.notice")} />
      <Table<MilestoneEdit>
        rowKey="sequence"
        size="small"
        pagination={false}
        dataSource={rows}
        scroll={{ x: 900 }}
        data-testid="milestone-editor"
        columns={[
          {
            key: "milestone",
            title: t("digitize.result.columns.milestone"),
            render: (_, row) => (
              <>
                <b>
                  {t("digitize.result.milestoneCode", { no: row.sequence })}
                </b>{" "}
                {td(
                  `milestoneType.${
                    data.milestones.find((m) => m.sequence === row.sequence)
                      ?.type
                  }`,
                )}
              </>
            ),
          },
          {
            key: "percent",
            title: t("digitize.edit.percent"),
            width: 110,
            render: (_, row) => (
              <Input
                size="small"
                inputMode="decimal"
                suffix="%"
                value={row.paymentPercent}
                onChange={(event) =>
                  patch(row.sequence, { paymentPercent: event.target.value })
                }
                data-testid={`edit-percent-${row.sequence}`}
              />
            ),
          },
          {
            key: "due",
            title: t("digitize.result.columns.dueDate"),
            width: 160,
            render: (_, row) => (
              <Input
                size="small"
                type="date"
                value={row.dueDate ?? ""}
                onChange={(event) =>
                  patch(row.sequence, {
                    dueDate: event.target.value || null,
                  })
                }
                data-testid={`edit-due-${row.sequence}`}
              />
            ),
          },
          {
            key: "documents",
            title: t("digitize.result.columns.documents"),
            render: (_, row) => (
              <Select<BusinessEventType[]>
                mode="multiple"
                size="small"
                style={{ minWidth: 240, width: "100%" }}
                value={row.eventTypes}
                maxCount={6}
                status={row.eventTypes.length ? undefined : "error"}
                options={EVENT_TYPES.map((value) => ({
                  value,
                  label: td(`eventType.${value}`),
                }))}
                onChange={(eventTypes) => patch(row.sequence, { eventTypes })}
                data-testid={`edit-events-${row.sequence}`}
              />
            ),
          },
          {
            key: "penalty",
            title: t("digitize.result.columns.penalty"),
            width: 90,
            render: (_, row) => (
              <Switch
                size="small"
                checked={row.latePenalty}
                onChange={(latePenalty) => patch(row.sequence, { latePenalty })}
              />
            ),
          },
          ...(approvalPossible
            ? [
                {
                  key: "approval",
                  title: t("digitize.result.columns.approval"),
                  width: 170,
                  render: (_: unknown, row: MilestoneEdit) => (
                    <Select<MilestoneEdit["approval"]>
                      size="small"
                      style={{ width: "100%" }}
                      value={row.approval}
                      options={[
                        {
                          value: "CONTRACT",
                          label: t("digitize.edit.approval.CONTRACT"),
                        },
                        {
                          value: "NONE",
                          label: t("digitize.edit.approval.NONE"),
                        },
                      ]}
                      onChange={(approval) => patch(row.sequence, { approval })}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
      <Space
        size={8}
        wrap
        style={{ justifyContent: "space-between", width: "100%" }}
      >
        <Tag
          color={totalOk ? "success" : "error"}
          style={{ margin: 0 }}
          data-testid="edit-total"
        >
          {t("digitize.edit.total", { total })}
        </Tag>
        <Space size={8} wrap>
          {data.edited ? (
            <Button
              loading={save.isPending}
              onClick={() => save.mutate({ reset: true })}
            >
              {t("digitize.edit.reset")}
            </Button>
          ) : null}
          <Button onClick={onDone}>{t("digitize.edit.cancel")}</Button>
          <Button
            type="primary"
            disabled={!totalOk || rows.some((row) => !row.eventTypes.length)}
            loading={save.isPending}
            onClick={() => save.mutate({ milestones: rows })}
            data-testid="edit-save"
          >
            {t("digitize.edit.save")}
          </Button>
        </Space>
      </Space>
    </Space>
  );
}
