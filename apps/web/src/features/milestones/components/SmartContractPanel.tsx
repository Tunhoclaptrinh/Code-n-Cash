import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Card,
  Descriptions,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useTranslation } from "react-i18next";
import type { SmartContractView } from "@codecash/contracts";
import { getSmartContract } from "@/shared/api/domain";
import { useCurrentUser } from "@/shared/auth/session";
import {
  formatDate,
  formatDateTime,
  formatDecimalString,
} from "@/shared/lib/format";
import { DecisionTag, MilestoneStatusTag } from "@/shared/ui/DomainTags";
import { PageState } from "@/shared/ui/PageState";
import { TrackingCode } from "@/shared/ui/TechnicalInfo";
import { outcomeColor } from "./RulesPanel";
import styles from "./SmartContractPanel.module.css";

type Clause = SmartContractView["clauses"][number];

/**
 * The contract read as a smart contract: what both parties signed, the engine that executes it, and for
 * every payment milestone the conditions and rules it runs with and what they decided so far.
 */
export function SmartContractPanel({ contractId }: { contractId: string }) {
  const { t } = useTranslation("milestones");
  const user = useCurrentUser();
  const view = useQuery({
    queryKey: ["contract-view", user.id, contractId, "smart"],
    queryFn: () => getSmartContract(contractId),
  });
  if (!view.data)
    return (
      <PageState
        kind={view.isError ? "error" : "loading"}
        onRetry={() => void view.refetch()}
      />
    );
  const { binding, engine, clauses } = view.data;
  return (
    <div className={styles.layout} data-testid="smart-contract">
      <Alert type="info" showIcon title={t("smart.intro")} />
      <div className={styles.cards}>
        <Binding binding={binding} />
        <Card size="small" title={t("smart.engine.title")}>
          <Descriptions
            size="small"
            column={1}
            items={[
              {
                key: "policy",
                label: t("smart.engine.policy"),
                children: `${engine.policyId} · ${engine.policyVersion}`,
              },
              {
                key: "policyHash",
                label: t("smart.engine.policyHash"),
                children: <TrackingCode code={engine.policySha256} />,
              },
              {
                key: "rulesHash",
                label: t("smart.engine.rulesHash"),
                children: <TrackingCode code={engine.rulesSha256} />,
              },
            ]}
          />
          <Typography.Paragraph type="secondary" className={styles.note}>
            {t("smart.engine.note")}
          </Typography.Paragraph>
        </Card>
      </div>
      <Typography.Title level={5} className={styles.clausesTitle}>
        {t("smart.clauses.title", { count: clauses.length })}
      </Typography.Title>
      {clauses.length ? (
        clauses.map((clause) => (
          <ClauseCard key={clause.milestone.id} clause={clause} />
        ))
      ) : (
        <Alert type="warning" title={t("smart.clauses.none")} />
      )}
    </div>
  );
}

function Binding({ binding }: { binding: SmartContractView["binding"] }) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const allSigned = binding.total > 0 && binding.signed === binding.total;
  return (
    <Card size="small" title={t("smart.binding.title")}>
      <Space wrap className={styles.tags}>
        <Tag
          color={
            allSigned ? "success" : binding.total ? "processing" : "default"
          }
        >
          {binding.total
            ? t(
                allSigned
                  ? "smart.binding.allSigned"
                  : "smart.binding.partlySigned",
                {
                  signed: binding.signed,
                  total: binding.total,
                },
              )
            : t("smart.binding.notSigned")}
        </Tag>
        {binding.basis ? (
          <Tag color={binding.intact ? "success" : "error"}>
            {t(
              binding.intact ? "smart.binding.intact" : "smart.binding.changed",
            )}
          </Tag>
        ) : null}
      </Space>
      <Descriptions
        size="small"
        column={1}
        items={[
          {
            key: "basis",
            label: t("smart.binding.basis"),
            children: binding.basis
              ? t(`smart.binding.basisKind.${binding.basis}`)
              : "—",
          },
          {
            key: "digest",
            label: t("smart.binding.digest"),
            children: binding.signedDigest ? (
              <TrackingCode code={binding.signedDigest} />
            ) : (
              "—"
            ),
          },
          {
            key: "rules",
            label: t("smart.binding.rules"),
            children: binding.ruleVersion ? (
              <Space orientation="vertical" size={0}>
                <span>
                  {t("smart.binding.ruleVersion", {
                    ruleSet: td(`ruleSet.${binding.ruleSetId}`, {
                      defaultValue: binding.ruleSetId,
                    }),
                  })}
                </span>
                <TrackingCode code={binding.ruleVersion.hash} />
              </Space>
            ) : (
              t("smart.binding.ruleSet", {
                ruleSet: td(`ruleSet.${binding.ruleSetId}`, {
                  defaultValue: binding.ruleSetId,
                }),
              })
            ),
          },
          ...(binding.lastSignedAt
            ? [
                {
                  key: "signedAt",
                  label: t("smart.binding.lastSignedAt"),
                  children: formatDateTime(binding.lastSignedAt),
                },
              ]
            : []),
        ]}
      />
    </Card>
  );
}

function ClauseCard({ clause }: { clause: Clause }) {
  const { t, i18n } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const { milestone: m, rules } = clause;
  const sentence = (rule: Clause["rules"][number]) =>
    td(`ruleCondition.${rule.reasonCode}`, {
      defaultValue: i18n.language.startsWith("vi")
        ? rule.description
        : rule.name,
    });
  return (
    <Card
      size="small"
      data-testid="smart-clause"
      title={
        <Space wrap size={8}>
          <span>
            {t("smart.clauses.heading", {
              no: m.sequence,
              type: td(`milestoneType.${m.type}`, { defaultValue: m.name }),
            })}
          </span>
          <MilestoneStatusTag status={m.status} />
        </Space>
      }
      extra={
        <Typography.Text type="secondary">
          {t("smart.clauses.value", {
            value: formatDecimalString(m.plannedMillion),
            due: formatDate(m.dueDate),
          })}
        </Typography.Text>
      }
    >
      <ul className={styles.conditions}>
        <li>
          <b>{t("smart.clauses.evidence")}</b>{" "}
          {m.requiredEventTypes.length
            ? m.requiredEventTypes
                .map((type) => td(`eventType.${type}`))
                .join(", ")
            : "—"}
        </li>
        <li>
          <b>{t("smart.clauses.approval")}</b>{" "}
          {m.approvalRequired
            ? t("smart.clauses.approvalNeeded", {
                quorum: m.quorum,
                roles: m.approvalRoles
                  .map((role) => td(`approvalRole.${role}`))
                  .join(", "),
              })
            : t("smart.clauses.approvalNone")}
        </li>
        <li>
          <b>{t("smart.clauses.penalty")}</b>{" "}
          {m.latePenalty
            ? t("smart.clauses.penaltyRate", {
                grace: m.graceDays,
                rate: m.penaltyRatePct,
                cap: m.maxPenaltyPct,
              })
            : t("smart.clauses.penaltyNone")}
        </li>
      </ul>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        tableLayout="auto"
        scroll={{ x: 640 }}
        dataSource={rules}
        rowClassName={(rule) =>
          rule.outcome === "MATCHED" ? "codecash-row-selected" : ""
        }
        columns={[
          {
            key: "priority",
            title: t("decision.rules.priority"),
            width: 64,
            render: (_, r) => <b>{r.priority}</b>,
          },
          {
            key: "when",
            title: t("smart.clauses.when"),
            render: (_, r) => (
              <Tooltip
                title={
                  <Typography.Text code style={{ color: "inherit" }}>
                    {r.condition}
                  </Typography.Text>
                }
              >
                <span>{sentence(r)}</span>
              </Tooltip>
            ),
          },
          {
            key: "then",
            title: t("smart.clauses.then"),
            render: (_, r) => <DecisionTag decision={r.decision} />,
          },
          {
            key: "outcome",
            title: t("smart.clauses.outcome"),
            render: (_, r) => (
              <Tag color={outcomeColor[r.outcome]} style={{ margin: 0 }}>
                {td(`ruleOutcome.${r.outcome}`)}
              </Tag>
            ),
          },
        ]}
      />
      <Typography.Paragraph className={styles.result}>
        {t("smart.clauses.result")} <DecisionTag decision={m.decision} />{" "}
        {td(`reason.${m.reasonCode}`)}
        {m.decision === "RELEASE" || m.decision === "PENALTY"
          ? ` · ${t("smart.clauses.payable", {
              value: formatDecimalString(m.payableMillion),
            })}`
          : ""}
      </Typography.Paragraph>
    </Card>
  );
}
