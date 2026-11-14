import { useState } from "react";
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Descriptions,
  Input,
  Modal,
  Space,
  Tag,
} from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ContractOverview, Liquidation } from "@codecash/contracts";
import { ApiError } from "@/shared/api/client";
import {
  decideLiquidation,
  proposeLiquidation,
  withdrawLiquidation,
} from "@/shared/api/domain";
import {
  formatDateTime,
  formatDecimalString,
  sumDecimalStrings,
} from "@/shared/lib/format";
import { TechnicalDetails } from "@/shared/ui/TechnicalInfo";

const STATE_COLOR: Record<Liquidation["state"], string> = {
  PROPOSED: "processing",
  ACCEPTED: "success",
  REJECTED: "error",
  WITHDRAWN: "default",
};

/**
 * The liquidation record (biên bản thanh lý): the settled figures as the API computed them, and the
 * step the signed-in user may take. The browser only displays; every check is the API's.
 */
export function LiquidationPanel({ data }: { data: ContractOverview }) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const { message, modal } = AntApp.useApp();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"PROPOSE" | "REJECT" | null>(null);
  const [note, setNote] = useState("");
  const contractId = data.contract.id;
  const failed = (error: unknown) =>
    message.error(
      td(`errors.${error instanceof ApiError ? error.code : "UNKNOWN"}`, {
        defaultValue: td("errors.UNKNOWN"),
      }),
    );
  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: ["milestones"] });
    setDialog(null);
    setNote("");
  };
  const propose = useMutation({
    mutationFn: proposeLiquidation,
    onSuccess: done,
    onError: failed,
  });
  const decide = useMutation({
    mutationFn: decideLiquidation,
    onSuccess: done,
    onError: failed,
  });
  const withdraw = useMutation({
    mutationFn: withdrawLiquidation,
    onSuccess: done,
    onError: failed,
  });
  const record = data.liquidation;
  // Shown for checking only: paid + penalties + rejected should account for the whole value.
  const accounted = record
    ? sumDecimalStrings([
        record.totals.paidMillion,
        record.totals.penaltyMillion,
        record.totals.rejectedMillion,
      ]) === sumDecimalStrings([record.totals.valueMillion])
    : false;
  const million = (value: string) =>
    t("liquidation.million", { value: formatDecimalString(value) });
  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      <Alert type="info" showIcon title={t("liquidation.intro")} />
      {data.canProposeLiquidation ? (
        <div>
          <Button
            type="primary"
            onClick={() => setDialog("PROPOSE")}
            data-testid="liquidation-propose"
          >
            {t("liquidation.propose")}
          </Button>
        </div>
      ) : null}
      {!record && !data.canProposeLiquidation ? (
        <Alert
          type="warning"
          showIcon
          title={t(
            data.contract.status === "CLOSED"
              ? "liquidation.waitingOfficer"
              : "liquidation.notYet",
          )}
        />
      ) : null}
      {record ? (
        <Card
          size="small"
          data-testid="liquidation-card"
          title={
            <Space size={8} wrap>
              <b>{t("liquidation.title")}</b>
              <Tag color={STATE_COLOR[record.state]} style={{ margin: 0 }}>
                {t(`liquidation.state.${record.state}`)}
              </Tag>
            </Space>
          }
          extra={
            record.state === "PROPOSED" ? (
              <Space size={8} wrap>
                {data.canDecideLiquidation ? (
                  <>
                    <Button
                      danger
                      onClick={() => setDialog("REJECT")}
                      data-testid="liquidation-reject"
                    >
                      {t("liquidation.reject")}
                    </Button>
                    <Button
                      type="primary"
                      loading={decide.isPending}
                      data-testid="liquidation-accept"
                      onClick={() =>
                        modal.confirm({
                          title: t("liquidation.acceptConfirm.title"),
                          content: t("liquidation.acceptConfirm.body"),
                          okText: t("liquidation.accept"),
                          onOk: () =>
                            decide.mutateAsync({
                              contractId,
                              choice: "ACCEPT",
                            }),
                        })
                      }
                    >
                      {t("liquidation.accept")}
                    </Button>
                  </>
                ) : null}
                {data.canWithdrawLiquidation ? (
                  <Button
                    loading={withdraw.isPending}
                    onClick={() => withdraw.mutate({ contractId })}
                    data-testid="liquidation-withdraw"
                  >
                    {t("liquidation.withdraw")}
                  </Button>
                ) : null}
              </Space>
            ) : null
          }
        >
          <Space orientation="vertical" size={8} style={{ width: "100%" }}>
            <Descriptions
              size="small"
              column={1}
              bordered
              items={[
                {
                  key: "value",
                  label: t("liquidation.totals.value"),
                  children: million(record.totals.valueMillion),
                },
                {
                  key: "paid",
                  label: t("liquidation.totals.paid"),
                  children: million(record.totals.paidMillion),
                },
                {
                  key: "penalty",
                  label: t("liquidation.totals.penalty"),
                  children: million(record.totals.penaltyMillion),
                },
                {
                  key: "rejected",
                  label: t("liquidation.totals.rejected"),
                  children: million(record.totals.rejectedMillion),
                },
              ]}
            />
            <Tag
              color={accounted ? "success" : "warning"}
              style={{ margin: 0 }}
            >
              {t(
                accounted ? "liquidation.accounted" : "liquidation.unaccounted",
              )}
            </Tag>
            {record.note ? (
              <span>
                <b>{t("liquidation.note")}:</b> {record.note}
              </span>
            ) : null}
            <span style={{ color: "var(--color-text-secondary)" }}>
              {t("liquidation.proposed", {
                name: record.proposedBy.name,
                at: formatDateTime(record.proposedAt),
              })}
              {record.decidedBy
                ? ` · ${t(`liquidation.decided.${record.state}`, {
                    name: record.decidedBy.name,
                    at: formatDateTime(record.decidedAt ?? ""),
                  })}`
                : ""}
              {record.decisionNote ? ` · “${record.decisionNote}”` : ""}
            </span>
            <TechnicalDetails
              items={[
                {
                  key: "digest",
                  label: t("liquidation.digest"),
                  value: record.digest,
                },
              ]}
            />
          </Space>
        </Card>
      ) : null}
      <Modal
        open={!!dialog}
        title={t(
          dialog === "REJECT" ? "liquidation.reject" : "liquidation.propose",
        )}
        okText={t(
          dialog === "REJECT" ? "liquidation.reject" : "liquidation.send",
        )}
        okButtonProps={{
          danger: dialog === "REJECT",
          disabled: dialog === "REJECT" && !note.trim(),
        }}
        confirmLoading={propose.isPending || decide.isPending}
        onCancel={() => setDialog(null)}
        onOk={() =>
          dialog === "REJECT"
            ? decide.mutate({ contractId, choice: "REJECT", note })
            : propose.mutate({ contractId, note })
        }
        destroyOnHidden
      >
        {dialog === "PROPOSE" ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            title={t("liquidation.proposeNotice")}
          />
        ) : null}
        <Input.TextArea
          rows={3}
          maxLength={2000}
          value={note}
          placeholder={t(
            dialog === "REJECT"
              ? "liquidation.rejectPlaceholder"
              : "liquidation.notePlaceholder",
          )}
          onChange={(event) => setNote(event.target.value)}
          data-testid="liquidation-note"
        />
      </Modal>
    </Space>
  );
}
