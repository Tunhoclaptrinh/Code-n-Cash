import { useMemo, useState } from "react";
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { EyeOutlined, PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ConfirmModal,
  DataTable,
  FormModal,
  IconButton,
  PageContainer,
  useAccess,
} from "@codecash/ui";
import {
  exactDecimal,
  type ListSpec,
  type RuleVersion,
} from "@codecash/contracts";
import { trustApi } from "@/shared/api/trust";
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import { localList, useListQuery } from "@/shared/lib/useListQuery";

const events = [
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
const states = ["DRAFT", "REVIEW", "PUBLISHED", "RETIRED"] as const;
const spec: ListSpec<RuleVersion> = {
  fields: {
    name: { value: (row) => row.name, sort: true },
    status: { value: (row) => row.status, filter: "eq", facet: true },
    id: { value: (row) => row.id },
  },
  search: (row) => [row.name, row.reason, row.hash],
  defaultSort: { by: "name", order: "asc" },
};

export default function RuleVersionsPage() {
  const { t } = useTranslation("trust");
  const { t: td } = useTranslation("domain");
  const { t: tc } = useTranslation("common");
  const { message } = App.useApp();
  const user = useCurrentUser();
  const { hasPermission } = useAccess(user);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["rule-versions", user.id],
    queryFn: trustApi.rules,
  });
  const fetch = useMemo(() => localList(query.data ?? [], spec), [query.data]);
  const list = useListQuery<RuleVersion>({
    key: ["rule-version-list", user.id, query.dataUpdatedAt],
    fetch,
    sort: spec.defaultSort,
  });
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<RuleVersion>();
  const [rules, setRules] = useState<RuleVersion["rules"]>([]);
  const [templates, setTemplates] = useState<RuleVersion["templates"]>([]);
  const [publishing, setPublishing] = useState<RuleVersion>();
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["rule-versions"] });
  const report = (error: unknown) =>
    message.error(
      td(`errors.${(error as { code?: string })?.code ?? "UNKNOWN"}`, {
        defaultValue: td("errors.UNKNOWN"),
      }),
    );
  const open = (version: RuleVersion) => {
    setSelected(version);
    setRules(structuredClone(version.rules));
    setTemplates(structuredClone(version.templates));
  };
  const editable =
    selected?.status === "DRAFT" &&
    selected.createdBy === user.id &&
    hasPermission("rules:write");
  const save = useMutation({
    mutationFn: async (submit: boolean) => {
      if (!selected) return;
      const saved = await trustApi.saveRuleVersion(selected, rules, templates);
      return submit ? trustApi.submitRuleVersion(saved) : saved;
    },
    onSuccess: async (version) => {
      if (version) open(version);
      await refresh();
      message.success(t("saved"));
    },
    onError: report,
  });
  const publish = useMutation({
    mutationFn: trustApi.publishRuleVersion,
    onSuccess: async () => {
      setPublishing(undefined);
      setSelected(undefined);
      await refresh();
      message.success(t("saved"));
    },
    onError: report,
  });
  const rulesValid = rules.every((rule) =>
    [
      "condition_expression",
      "payable_amount_formula",
      "penalty_amount_formula",
    ].every((key) => !!rule[key]?.trim() && rule[key].length <= 2000),
  );
  const templateValid = templates.every(
    (row) =>
      exactDecimal(row.paymentPercent, "100") &&
      Number.isInteger(row.offsetDays) &&
      row.offsetDays >= 0 &&
      row.offsetDays <= 36500 &&
      !!row.requiredEvents,
  );
  const sums = templates.reduce<Record<string, bigint>>((all, row) => {
    if (!exactDecimal(row.paymentPercent, "100")) return all;
    const [whole, fraction = ""] = row.paymentPercent
      .replace(",", ".")
      .split(".");
    all[row.workflowTemplate] =
      (all[row.workflowTemplate] ?? 0n) +
      BigInt(whole) * 100n +
      BigInt(fraction.padEnd(2, "0"));
    return all;
  }, {});
  const totalValid = Object.values(sums).every((sum) => sum === 10000n);
  const columns = [
    {
      ...list.column("name"),
      title: t("rules.name"),
      dataIndex: "name",
      sorter: true,
    },
    {
      ...list.column("status"),
      title: t("rules.status"),
      render: (_: unknown, row: RuleVersion) => (
        <Tag
          color={
            row.status === "PUBLISHED"
              ? "success"
              : row.status === "REVIEW"
                ? "processing"
                : "default"
          }
        >
          {t(`rules.states.${row.status}`)}
        </Tag>
      ),
    },
    { key: "author", title: t("rules.author"), dataIndex: "createdBy" },
    {
      key: "validation",
      title: t("rules.validation"),
      render: (_: unknown, row: RuleVersion) =>
        row.validation
          ? `${row.validation.matched}/${row.validation.samples}`
          : "—",
    },
    {
      key: "hash",
      title: t("rules.hash"),
      render: (_: unknown, row: RuleVersion) => (
        <Typography.Text code copyable>
          {row.hash.slice(0, 16)}…
        </Typography.Text>
      ),
    },
  ];
  return (
    <AppPage
      active="platform"
      guide="admin"
      breadcrumb={[{ label: t("rules.title") }]}
      extra={
        hasPermission("rules:write") ? (
          <Button
            icon={<PlusOutlined />}
            type="primary"
            onClick={() => setCreating(true)}
            data-testid="rule-version-create"
          >
            {t("rules.create")}
          </Button>
        ) : undefined
      }
    >
      <PageContainer>
        <Alert type="info" showIcon title={t("rules.notice")} />
        <DataTable
          rowKey="id"
          columns={columns}
          {...list.table}
          loading={query.isFetching || list.table.loading}
          onRefresh={() => void refresh()}
          searchPlaceholder={t("rules.search")}
          statisticsData={states.map((state) => ({
            title: t(`rules.states.${state}`),
            value:
              query.data?.filter((row) => row.status === state).length ?? 0,
            onClick: () => list.setFilter("status", [state]),
          }))}
          tabs={[
            { key: "ALL", label: t("rules.all") },
            ...states.map((state) => ({
              key: state,
              label: t(`rules.states.${state}`),
            })),
          ]}
          activeTab={String(list.filters.status?.[0] ?? "ALL")}
          onTabChange={(key) =>
            list.setFilter("status", key === "ALL" ? undefined : [key])
          }
          customActions={(row) => (
            <IconButton
              icon={<EyeOutlined />}
              tooltip={t("rules.review")}
              onClick={() => open(row)}
            />
          )}
        />
      </PageContainer>
      <FormModal
        open={creating}
        title={t("rules.create")}
        onClose={() => setCreating(false)}
        onSubmit={async (values: { name: string; reason: string }) => {
          try {
            const version = await trustApi.createRuleVersion(values);
            await refresh();
            open(version);
          } catch (error) {
            void report(error);
            throw error;
          }
        }}
      >
        <Form.Item
          name="name"
          label={t("rules.name")}
          rules={[
            {
              required: true,
              whitespace: true,
              message: tc("forms.required", { field: t("rules.name") }),
            },
            { max: 120 },
          ]}
        >
          <Input placeholder={t("rules.namePlaceholder")} maxLength={120} />
        </Form.Item>
        <Form.Item
          name="reason"
          label={t("rules.reason")}
          rules={[
            {
              required: true,
              whitespace: true,
              message: tc("forms.required", { field: t("rules.reason") }),
            },
            { max: 2000 },
          ]}
        >
          <Input.TextArea
            rows={3}
            placeholder={t("rules.reasonPlaceholder")}
            maxLength={2000}
            showCount
          />
        </Form.Item>
      </FormModal>
      <Modal
        open={!!selected}
        width={1280}
        title={selected?.name}
        onCancel={() => setSelected(undefined)}
        footer={
          <Space wrap>
            {editable ? (
              <>
                <Button
                  loading={save.isPending}
                  disabled={!rulesValid || !templateValid || !totalValid}
                  onClick={() => save.mutate(false)}
                >
                  {t("rules.save")}
                </Button>
                <Button
                  type="primary"
                  loading={save.isPending}
                  disabled={!rulesValid || !templateValid || !totalValid}
                  onClick={() => save.mutate(true)}
                  data-testid="rule-version-submit"
                >
                  {t("rules.submit")}
                </Button>
              </>
            ) : null}
            {selected?.status === "REVIEW" &&
            selected.createdBy !== user.id &&
            hasPermission("rules:publish") ? (
              <Button
                type="primary"
                onClick={() => setPublishing(selected)}
                data-testid="rule-version-publish"
              >
                {t("rules.publish")}
              </Button>
            ) : null}
          </Space>
        }
        destroyOnHidden
      >
        {selected ? (
          <Space orientation="vertical" style={{ width: "100%" }}>
            <Alert
              type={selected.intact === false ? "error" : "info"}
              showIcon
              title={
                selected.intact === false
                  ? t("rules.tampered")
                  : t("rules.editorNotice")
              }
            />
            <Typography.Paragraph>{selected.reason}</Typography.Paragraph>
            <Typography.Text code copyable>
              {selected.hash}
            </Typography.Text>
            {!totalValid ? (
              <Alert type="error" title={t("rules.percentTotal")} />
            ) : null}
            <Tabs
              items={[
                {
                  key: "templates",
                  label: t("rules.templates"),
                  children: (
                    <Table
                      size="small"
                      rowKey="id"
                      dataSource={templates}
                      scroll={{ x: 1100 }}
                      pagination={{ pageSize: 5 }}
                      columns={[
                        {
                          title: t("rules.workflow"),
                          render: (_, row) => (
                            <>
                              {td(`workflow.${row.workflowTemplate}`)} ·{" "}
                              {row.sequence} · {row.name}
                            </>
                          ),
                        },
                        {
                          title: t("rules.percent"),
                          render: (_, row) => (
                            <Form.Item
                              validateStatus={
                                !exactDecimal(row.paymentPercent, "100")
                                  ? "error"
                                  : undefined
                              }
                              help={
                                !exactDecimal(row.paymentPercent, "100")
                                  ? t("rules.percentHint")
                                  : undefined
                              }
                              style={{ margin: 0 }}
                            >
                              <Input
                                disabled={!editable}
                                value={row.paymentPercent}
                                maxLength={6}
                                placeholder="0.00–100.00"
                                onChange={(event) =>
                                  setTemplates((all) =>
                                    all.map((item) =>
                                      item.id === row.id
                                        ? {
                                            ...item,
                                            paymentPercent:
                                              event.target.value.replace(
                                                ",",
                                                ".",
                                              ),
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              />
                            </Form.Item>
                          ),
                        },
                        {
                          title: t("rules.offset"),
                          render: (_, row) => (
                            <InputNumber
                              disabled={!editable}
                              value={row.offsetDays}
                              min={0}
                              max={36500}
                              precision={0}
                              placeholder="0–36500"
                              onChange={(value) =>
                                setTemplates((all) =>
                                  all.map((item) =>
                                    item.id === row.id
                                      ? { ...item, offsetDays: value ?? -1 }
                                      : item,
                                  ),
                                )
                              }
                            />
                          ),
                        },
                        {
                          title: t("rules.events"),
                          render: (_, row) => (
                            <Select
                              mode="multiple"
                              disabled={!editable}
                              value={row.requiredEvents
                                .split(";")
                                .filter(Boolean)}
                              placeholder={t("rules.eventPlaceholder")}
                              style={{ minWidth: 260 }}
                              options={events.map((value) => ({
                                value,
                                label: td(`eventType.${value}`),
                              }))}
                              onChange={(values) =>
                                setTemplates((all) =>
                                  all.map((item) =>
                                    item.id === row.id
                                      ? {
                                          ...item,
                                          requiredEvents: values.join(";"),
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                          ),
                        },
                        {
                          title: t("rules.penalty"),
                          render: (_, row) => (
                            <Switch
                              disabled={!editable}
                              checked={row.latePenalty}
                              onChange={(checked) =>
                                setTemplates((all) =>
                                  all.map((item) =>
                                    item.id === row.id
                                      ? { ...item, latePenalty: checked }
                                      : item,
                                  ),
                                )
                              }
                            />
                          ),
                        },
                      ]}
                    />
                  ),
                },
                {
                  key: "rules",
                  label: t("rules.expressions"),
                  children: (
                    <Table
                      size="small"
                      rowKey="rule_id"
                      dataSource={rules}
                      scroll={{ x: 1300 }}
                      pagination={{ pageSize: 8 }}
                      columns={[
                        {
                          title: t("rules.scope"),
                          render: (_, row) => (
                            <>
                              {row.release_rule_code}
                              <br />
                              {row.priority} · {row.decision}
                            </>
                          ),
                        },
                        ...[
                          "condition_expression",
                          "payable_amount_formula",
                          "penalty_amount_formula",
                        ].map((key) => ({
                          key,
                          title: t(`rules.${key}`),
                          render: (_: unknown, row: Record<string, string>) => (
                            <Form.Item
                              style={{ margin: 0 }}
                              validateStatus={
                                !row[key]?.trim() ? "error" : undefined
                              }
                              help={
                                !row[key]?.trim()
                                  ? t("rules.expressionRequired")
                                  : undefined
                              }
                            >
                              <Input.TextArea
                                disabled={!editable}
                                rows={2}
                                value={row[key]}
                                maxLength={2000}
                                placeholder={t(`rules.${key}`)}
                                onChange={(event) =>
                                  setRules((all) =>
                                    all.map((item) =>
                                      item.rule_id === row.rule_id
                                        ? { ...item, [key]: event.target.value }
                                        : item,
                                    ),
                                  )
                                }
                              />
                            </Form.Item>
                          ),
                        })),
                      ]}
                    />
                  ),
                },
              ]}
            />
          </Space>
        ) : null}
      </Modal>
      <ConfirmModal
        open={!!publishing}
        title={t("rules.publish")}
        content={t("rules.publishConfirm")}
        onCancel={() => setPublishing(undefined)}
        onConfirm={() => publishing && publish.mutate(publishing)}
        loading={publish.isPending}
      />
    </AppPage>
  );
}
