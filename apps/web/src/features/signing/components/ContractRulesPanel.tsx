import { useState } from "react";
import {
  Alert,
  App as AntApp,
  Button,
  Empty,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  RULE_TEMPLATES,
  type ContractRule,
  type Digitization,
  type RuleTemplateKind,
} from "@codecash/contracts";
import { ApiError } from "@/shared/api/client";
import { formatDateTime } from "@/shared/lib/format";
import { setContractRules } from "../api/digitization.api";

type Row = Omit<ContractRule, "id"> & { key: number };

const templateOf = (key: string) => RULE_TEMPLATES.find((t) => t.key === key);
const KINDS: RuleTemplateKind[] = ["TIGHTEN", "LOOSEN"];

/**
 * The contract's own rules: sentence templates that tighten or loosen the shared rules for this
 * contract only. The API places them in their priority windows and refuses any set the engine's
 * safety proof rejects; both parties sign them with the contract.
 */
export function ContractRulesPanel({
  contractId,
  data,
}: {
  contractId: string;
  data: Digitization;
}) {
  const { t } = useTranslation("signing");
  const { t: td } = useTranslation("domain");
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const saved = data.contractRules ?? [];
  const [rows, setRows] = useState<Row[] | null>(null);
  const editing = rows !== null;
  const types = [...new Set(data.milestones.map((m) => m.type))];
  const save = useMutation({
    mutationFn: (next: Row[]) =>
      setContractRules(contractId, {
        rules: next.map((row) => ({
          template: row.template,
          milestoneType: row.milestoneType,
          value: row.value,
        })),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["signing"] });
      message.success(t("contractRules.saved"));
      setRows(null);
    },
    onError: (error) =>
      message.error(
        td(`errors.${error instanceof ApiError ? error.code : "UNKNOWN"}`, {
          defaultValue: td("errors.UNKNOWN"),
        }),
      ),
  });
  const sentence = (rule: Omit<ContractRule, "id">) =>
    t(`contractRules.sentence.${rule.template}`, {
      n: rule.value ?? "",
      milestone: td(`milestoneType.${rule.milestoneType}`),
    });
  const patch = (key: number, change: Partial<Row>) =>
    setRows((all) =>
      (all ?? []).map((row) => (row.key === key ? { ...row, ...change } : row)),
    );
  const startEditing = () =>
    setRows(saved.map((rule, key) => ({ ...rule, key })));
  const add = () =>
    setRows((all) => {
      const template = RULE_TEMPLATES[0];
      return [
        ...(all ?? []),
        {
          key: Math.max(-1, ...(all ?? []).map((row) => row.key)) + 1,
          template: template.key,
          milestoneType: types[0],
          value: template.parameter?.default ?? null,
        },
      ];
    });
  const incomplete = (rows ?? []).some(
    (row) => !!templateOf(row.template)?.parameter && row.value === null,
  );

  return (
    <section data-testid="contract-rules">
      <Space
        style={{ justifyContent: "space-between", width: "100%" }}
        wrap
        size={8}
      >
        <h2 style={{ margin: 0 }}>{t("contractRules.title")}</h2>
        {!data.locked && !editing ? (
          <Button
            size="small"
            onClick={startEditing}
            data-testid="contract-rules-edit"
          >
            {t("contractRules.edit")}
          </Button>
        ) : null}
      </Space>
      <Alert
        type="info"
        showIcon
        style={{ margin: "12px 0" }}
        title={t("contractRules.notice")}
        description={
          data.contractRulesEdited
            ? t("contractRules.editedBy", {
                name: data.contractRulesEdited.by,
                at: formatDateTime(data.contractRulesEdited.at),
              })
            : undefined
        }
      />
      {!editing ? (
        saved.length ? (
          <ul data-testid="contract-rules-list" style={{ paddingLeft: 20 }}>
            {saved.map((rule) => {
              const kind = templateOf(rule.template)?.kind;
              return (
                <li key={rule.id} style={{ marginBottom: 4 }}>
                  <Tag color={kind === "TIGHTEN" ? "orange" : "green"}>
                    {t(`contractRules.kind.${kind}`)}
                  </Tag>
                  {sentence(rule)}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t("contractRules.empty")}
          />
        )
      ) : (
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <Table<Row>
            rowKey="key"
            size="small"
            pagination={false}
            dataSource={rows}
            scroll={{ x: 760 }}
            locale={{ emptyText: t("contractRules.empty") }}
            columns={[
              {
                key: "template",
                title: t("contractRules.template"),
                render: (_, row) => (
                  <Select
                    size="small"
                    style={{ minWidth: 260, width: "100%" }}
                    value={row.template}
                    options={KINDS.map((kind) => ({
                      label: t(`contractRules.kind.${kind}`),
                      options: RULE_TEMPLATES.filter(
                        (template) => template.kind === kind,
                      ).map((template) => ({
                        value: template.key,
                        label: t(`contractRules.name.${template.key}`),
                      })),
                    }))}
                    onChange={(template) =>
                      patch(row.key, {
                        template,
                        value: templateOf(template)?.parameter?.default ?? null,
                      })
                    }
                    data-testid={`contract-rule-template-${row.key}`}
                  />
                ),
              },
              {
                key: "milestone",
                title: t("contractRules.milestone"),
                width: 200,
                render: (_, row) => (
                  <Select
                    size="small"
                    style={{ width: "100%" }}
                    value={row.milestoneType}
                    options={types.map((type) => ({
                      value: type,
                      label: td(`milestoneType.${type}`),
                    }))}
                    onChange={(milestoneType) =>
                      patch(row.key, { milestoneType })
                    }
                  />
                ),
              },
              {
                key: "value",
                title: t("contractRules.value"),
                width: 190,
                render: (_, row) => {
                  const parameter = templateOf(row.template)?.parameter;
                  return parameter ? (
                    <InputNumber
                      size="small"
                      style={{ width: "100%" }}
                      min={parameter.min}
                      max={parameter.max}
                      precision={0}
                      value={row.value}
                      suffix={t(`contractRules.unit.${parameter.unit}`)}
                      onChange={(value) =>
                        patch(row.key, {
                          value: typeof value === "number" ? value : null,
                        })
                      }
                      data-testid={`contract-rule-value-${row.key}`}
                    />
                  ) : (
                    "—"
                  );
                },
              },
              {
                key: "remove",
                width: 48,
                render: (_, row) => (
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={t("contractRules.remove")}
                    title={t("contractRules.remove")}
                    onClick={() =>
                      setRows((all) =>
                        (all ?? []).filter((other) => other.key !== row.key),
                      )
                    }
                  />
                ),
              },
            ]}
          />
          <Space
            size={8}
            wrap
            style={{ justifyContent: "space-between", width: "100%" }}
          >
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={add}
              data-testid="contract-rules-add"
            >
              {t("contractRules.add")}
            </Button>
            <Space size={8} wrap>
              <Button size="small" onClick={() => setRows(null)}>
                {t("contractRules.cancel")}
              </Button>
              <Button
                size="small"
                type="primary"
                loading={save.isPending}
                disabled={incomplete}
                onClick={() => save.mutate(rows ?? [])}
                data-testid="contract-rules-save"
              >
                {t("contractRules.save")}
              </Button>
            </Space>
          </Space>
        </Space>
      )}
    </section>
  );
}
