import { useMemo, useState } from "react";
import {
  Alert,
  App,
  Button,
  Collapse,
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
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ConfirmModal,
  DataTable,
  FormModal,
  PageContainer,
  useAccess,
} from "@codecash/ui";
import {
  APP_PREFIX,
  STAGE_TYPES,
  WORKFLOW_CONTRACT_TYPES,
  appWorkflowProblems,
  copyScope,
  exactDecimal,
  isAppCode,
  isAppTemplate,
  nextRuleNumber,
  ruleFamily,
  scaffoldAppWorkflow,
  type ListSpec,
  type RuleVersion,
} from "@codecash/contracts";
import { trustApi } from "@/shared/api/trust";
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import { TableRowActions } from "@/shared/ui/TableRowActions";
import { DemoFormFill } from "@/shared/ui/DemoFillButton";
import { STAT_TONE } from "@/shared/ui/statTone";
import { RuleExpressionEditor } from "./components/RuleExpressionEditor";
import styles from "./components/RuleExpressionEditor.module.css";
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
const stateTone = {
  DRAFT: STAT_TONE.blue,
  REVIEW: STAT_TONE.amber,
  PUBLISHED: STAT_TONE.green,
  RETIRED: STAT_TONE.indigo,
} as const;
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
  const { t: tp } = useTranslation("platform");
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
    syncUrl: true,
    key: ["rule-version-list", user.id, query.dataUpdatedAt],
    fetch,
    sort: spec.defaultSort,
  });
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<RuleVersion>();
  const [rules, setRules] = useState<RuleVersion["rules"]>([]);
  const [templates, setTemplates] = useState<RuleVersion["templates"]>([]);
  const [editorTab, setEditorTab] = useState("rules");
  const [ruleScope, setRuleScope] = useState<string>();
  const [publishing, setPublishing] = useState<RuleVersion>();
  const [addingWorkflow, setAddingWorkflow] = useState<
    false | { contractType?: string; fromRules?: boolean }
  >(false);
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["rule-versions"] });
  const report = (error: unknown) =>
    message.error(
      td(`errors.${(error as { code?: string })?.code ?? "UNKNOWN"}`, {
        defaultValue: td("errors.UNKNOWN"),
      }),
    );
  const open = (version: RuleVersion) => {
    setEditorTab("rules");
    setRuleScope(undefined);
    setSelected(version);
    setRules(structuredClone(version.rules));
    setTemplates(structuredClone(version.templates));
  };
  const editable =
    selected?.status === "DRAFT" &&
    selected.createdBy === user.id &&
    hasPermission("rules:write");
  const syntax = useMutation({
    mutationFn: trustApi.validateRuleExpressions,
    onError: report,
  });
  const currentSyntax =
    syntax.variables === rules && !syntax.isPending ? syntax.data : undefined;
  const preview = useMutation({
    mutationFn: async (input: {
      selected: RuleVersion;
      rules: RuleVersion["rules"];
      templates: RuleVersion["templates"];
    }) => {
      const checked = await syntax.mutateAsync(input.rules);
      if (!checked.valid) return null;
      return trustApi.previewRuleVersion(
        input.selected,
        input.rules,
        input.templates,
      );
    },
    onError: report,
  });
  const currentPreview =
    preview.variables?.selected === selected &&
    preview.variables?.rules === rules &&
    preview.variables?.templates === templates &&
    !preview.isPending
      ? preview.data
      : undefined;
  const renderImpact = (value: Record<string, string>) => (
    <Space orientation="vertical" size={2}>
      <Space wrap>
        <Tag>{value.decision}</Tag>
        <Typography.Text>
          {td(`status.${value.status}`, { defaultValue: value.status })}
        </Typography.Text>
      </Space>
      <Typography.Text>
        {td(`reason.${value.reason}`, { defaultValue: value.reason })}
      </Typography.Text>
      <Typography.Text>
        {t("rules.previewPayable", { value: value.payable })}
      </Typography.Text>
      <Typography.Text type="secondary">
        {t("rules.previewPenalty", { value: value.penalty })}
      </Typography.Text>
    </Space>
  );
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

  // The version's own APP_ workflows (§6.3): live checks with the API's own rules.
  const problems = appWorkflowProblems(rules, templates);
  const appWorkflows = [
    ...new Map(
      templates
        .filter(isAppTemplate)
        .map((row) => [row.workflowTemplate, row] as const),
    ).values(),
  ];
  const workflowNames = Object.fromEntries(
    appWorkflows.map((row) => [row.workflowTemplate, String(row.workflowName)]),
  );
  const addWorkflow = (input: {
    code: string;
    name: string;
    contractType: string;
  }) => {
    const code = `${APP_PREFIX}${input.code.trim().toUpperCase()}`;
    if (
      !isAppCode(code) ||
      templates.some((row) => row.workflowTemplate === code)
    )
      throw new Error("APP_WORKFLOW_CODE");
    const added = scaffoldAppWorkflow({
      code,
      name: input.name.trim(),
      contractType: input.contractType,
      rules,
      templates,
    });
    setRules((all) => [...all, ...added.rules]);
    // Data Pack stage names are English; a new workflow starts with names in the user's language.
    setTemplates((all) => [
      ...all,
      ...(added.templates.map((row) => ({
        ...row,
        name: td(`milestoneType.${row.milestoneType}`),
      })) as typeof all),
    ]);
    return added.rules[0]?.release_rule_code;
  };
  const removeWorkflow = (code: string) => {
    setRules((all) => all.filter((rule) => rule.rule_set_id !== code));
    setTemplates((all) => all.filter((row) => row.workflowTemplate !== code));
  };
  const updateStages = (
    code: string,
    change: (row: RuleVersion["templates"][number]) => object,
  ) =>
    setTemplates((all) =>
      all.map((row) =>
        row.workflowTemplate === code ? { ...row, ...change(row) } : row,
      ),
    );
  const addStage = (code: string, milestoneType: string) => {
    const stages = templates.filter((row) => row.workflowTemplate === code);
    const first = stages[0];
    const contractType = String(first.contractType);
    const sequence = stages.length + 1;
    // A stage of the same type in an organiser workflow lends its evidence list.
    const model = templates.find(
      (row) => !isAppTemplate(row) && row.milestoneType === milestoneType,
    );
    let next = nextRuleNumber(rules, code);
    setTemplates((all) => [
      ...all,
      {
        ...first,
        id: `tpl-${code}-${Date.now().toString(36)}`,
        sequence,
        milestoneType,
        name: td(`milestoneType.${milestoneType}`),
        requiredEvents: model?.requiredEvents ?? "ACCEPTANCE",
        paymentPercent: "0.00",
        latePenalty: false,
        offsetDays: Math.max(0, ...stages.map((row) => row.offsetDays)),
        approval: "CONTRACT",
      },
    ]);
    setRules((all) => [
      ...all,
      ...copyScope(all, code, contractType, milestoneType, () => next++),
    ]);
  };
  const removeStage = (stage: RuleVersion["templates"][number]) => {
    const code = stage.workflowTemplate;
    setTemplates((all) => {
      const kept = all.filter((row) => row.id !== stage.id);
      let sequence = 0;
      return kept
        .sort((a, b) => a.sequence - b.sequence)
        .map((row) =>
          row.workflowTemplate === code
            ? { ...row, sequence: ++sequence }
            : row,
        );
    });
    setRules((all) =>
      all.filter(
        (rule) =>
          !(
            rule.rule_set_id === code &&
            rule.applies_to_milestone_type === stage.milestoneType
          ),
      ),
    );
  };
  /** Swaps a stage with its neighbour; the checks flag due days that then go backwards. */
  const moveStage = (stage: RuleVersion["templates"][number], step: -1 | 1) =>
    setTemplates((all) => {
      const target = all.find(
        (row) =>
          row.workflowTemplate === stage.workflowTemplate &&
          row.sequence === stage.sequence + step,
      );
      if (!target) return all;
      return all.map((row) =>
        row.id === stage.id
          ? { ...row, sequence: target.sequence }
          : row.id === target.id
            ? { ...row, sequence: stage.sequence }
            : row,
      );
    });
  const addRule = (scope: string) => {
    const scoped = rules.filter((rule) => rule.release_rule_code === scope);
    const fallback = scoped.find(
      (rule) => rule.condition_expression.trim() === "ELSE",
    );
    const used = new Set(scoped.map((rule) => Number(rule.priority)));
    const below = Number(fallback?.priority ?? 1000) - 1;
    let priority = below;
    while (priority > 0 && used.has(priority)) priority--;
    const model = fallback ?? scoped[0];
    const ruleId = `${model.rule_set_id}-${nextRuleNumber(rules, model.rule_set_id)}`;
    setRules((all) => [
      ...all,
      {
        ...model,
        rule_id: ruleId,
        priority: String(Math.max(1, priority)),
        rule_name: t("rules.app.newRuleName"),
        rule_group: "APP",
        condition_expression: "FALSE",
        decision: "HOLD",
        reason_code: "UNRESOLVED_CONDITION",
        payable_amount_formula: "0",
        penalty_amount_formula: "0",
        rule_description_vi: t("rules.app.newRuleDescription"),
      },
    ]);
    return ruleId;
  };
  const applyFamily = (id: string) => {
    const source = rules.find((rule) => rule.rule_id === id);
    if (!source) return;
    const family = new Set(ruleFamily(rules, id).map((rule) => rule.rule_id));
    setRules((all) =>
      all.map((rule) =>
        family.has(rule.rule_id)
          ? {
              ...rule,
              condition_expression: source.condition_expression,
              payable_amount_formula: source.payable_amount_formula,
              penalty_amount_formula: source.penalty_amount_formula,
            }
          : rule,
      ),
    );
    message.success(t("rules.app.familyApplied", { count: family.size }));
  };
  const blocked =
    !rulesValid || !templateValid || !totalValid || problems.length > 0;
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
        <DataTable
          mobileCards
          columnSettings={{ storageKey: "rule-versions" }}
          hideCard
          rowKey="id"
          columns={columns}
          {...list.table}
          loading={query.isFetching || list.table.loading}
          onRefresh={() => void refresh()}
          searchPlaceholder={t("rules.search")}
          statisticsData={states.map((state) => ({
            colSpan: { xs: 12, sm: 12, md: 6 },
            title: t(`rules.states.${state}`),
            value:
              query.data?.filter((row) => row.status === state).length ?? 0,
            backgroundColor: stateTone[state].bg,
            valueColor: stateTone[state].value,
            selected: list.filters.status?.[0] === state,
            // A tile is the same choice as its tab: a second click shows every state again.
            onClick: () =>
              list.setFilter(
                "status",
                list.filters.status?.[0] === state ? undefined : [state],
              ),
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
          actionsWidth={96}
          customActions={(row) => (
            <TableRowActions
              primary={{
                label: t("rules.review"),
                icon: <EyeOutlined />,
                tone: "neutral",
                onClick: () => open(row),
              }}
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
        <div style={{ marginBottom: 12 }}>
          <DemoFormFill
            values={{
              name: t("rules.demoName"),
              reason: t("rules.demoReason"),
            }}
          />
        </div>
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
        className={styles.modal}
        title={selected?.name}
        onCancel={() => setSelected(undefined)}
        footer={
          <Space wrap>
            {editable && !currentPreview?.canSubmit ? (
              <Typography.Text type="secondary" className={styles.hint}>
                {tp("lite.previewFirst")}
              </Typography.Text>
            ) : null}
            {selected ? (
              <Button
                loading={preview.isPending}
                disabled={blocked || save.isPending}
                onClick={() => preview.mutate({ selected, rules, templates })}
                data-testid="rule-version-preview"
              >
                {t("rules.preview")}
              </Button>
            ) : null}
            {editable ? (
              <>
                <Button
                  loading={save.isPending}
                  disabled={blocked}
                  onClick={() => save.mutate(false)}
                >
                  {t("rules.save")}
                </Button>
                <Button
                  type="primary"
                  loading={save.isPending}
                  disabled={blocked || !currentPreview?.canSubmit}
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
          <div className={styles.modalContent}>
            {selected.intact === false ? (
              <Alert type="error" showIcon title={t("rules.tampered")} />
            ) : null}
            <Space wrap key="version-metadata">
              <Typography.Text type="secondary">
                {selected.reason}
              </Typography.Text>
              <Typography.Text code copyable={{ text: selected.hash }}>
                {selected.hash.slice(0, 16)}…
              </Typography.Text>
            </Space>
            {currentPreview ? (
              <Alert
                type={currentPreview.canSubmit ? "success" : "warning"}
                showIcon
                data-testid="rule-preview-result"
                title={t("rules.previewSummary", {
                  evaluated: currentPreview.evaluated,
                  matched: currentPreview.matched,
                  samples: currentPreview.samples,
                  changed: currentPreview.changed,
                  violations: currentPreview.invariantViolations,
                })}
                description={
                  <Space orientation="vertical" size={2}>
                    <Typography.Text data-testid="rule-safety-result">
                      {t(
                        currentPreview.safety.safe
                          ? "rules.safety.passed"
                          : "rules.safety.failed",
                        {
                          scenarios: currentPreview.safety.scenarios,
                          scopes: currentPreview.safety.scopes,
                          count: currentPreview.safety.violationCount,
                        },
                      )}
                    </Typography.Text>
                    {currentPreview.safety.violations
                      .slice(0, 3)
                      .map((violation, index) => (
                        <Typography.Text
                          key={`${violation.scope}-${index}`}
                          type="danger"
                        >
                          {t(`rules.safety.code.${violation.code}`, {
                            rule: violation.ruleId || violation.scope,
                          })}
                        </Typography.Text>
                      ))}
                  </Space>
                }
              />
            ) : null}
            {currentPreview?.changes.length ? (
              <Collapse
                items={[
                  {
                    key: "changes",
                    label: t("rules.previewChanges"),
                    children: (
                      <Table
                        size="small"
                        rowKey="milestoneId"
                        dataSource={currentPreview.changes}
                        data-testid="rule-impact-table"
                        scroll={{ x: 650 }}
                        pagination={{ pageSize: 5 }}
                        columns={[
                          {
                            title: t("rules.previewMilestone"),
                            dataIndex: "milestoneId",
                          },
                          {
                            title: t("rules.previewBefore"),
                            render: (_, row) => renderImpact(row.before),
                          },
                          {
                            title: t("rules.previewAfter"),
                            render: (_, row) => renderImpact(row.after),
                          },
                        ]}
                      />
                    ),
                  },
                ]}
              />
            ) : null}
            {!totalValid ? (
              <Alert type="error" title={t("rules.percentTotal")} />
            ) : null}
            {problems.length ? (
              <Alert
                type="error"
                showIcon
                data-testid="app-workflow-problems"
                title={t("rules.app.problemsTitle", { count: problems.length })}
                description={
                  <ul className={styles.problemList}>
                    {problems.slice(0, 6).map((problem, index) => (
                      <li key={index}>
                        {t(`rules.app.problems.${problem.code}`, {
                          where:
                            (problem.workflow &&
                              workflowNames[problem.workflow]) ??
                            problem.scope ??
                            problem.ruleId ??
                            "",
                        })}
                      </li>
                    ))}
                  </ul>
                }
              />
            ) : null}
            <Tabs
              key="version-configuration"
              activeKey={editorTab}
              onChange={setEditorTab}
              items={[
                {
                  key: "templates",
                  label: t("rules.templates"),
                  children: (
                    <>
                      <div
                        className={styles.workflows}
                        data-testid="app-workflows"
                      >
                        <Space wrap>
                          <Typography.Text type="secondary">
                            {t("rules.app.intro")}
                          </Typography.Text>
                          {editable ? (
                            <Button
                              icon={<PlusOutlined />}
                              onClick={() => setAddingWorkflow({})}
                              data-testid="app-workflow-add"
                            >
                              {t("rules.app.addWorkflow")}
                            </Button>
                          ) : null}
                        </Space>
                        {appWorkflows.map((row) => {
                          const code = row.workflowTemplate;
                          const used = new Set(
                            templates
                              .filter((item) => item.workflowTemplate === code)
                              .map((item) => item.milestoneType),
                          );
                          return (
                            <div
                              key={code}
                              className={styles.workflowRow}
                              data-testid={`app-workflow-${code}`}
                            >
                              <Input
                                value={String(row.workflowName ?? "")}
                                disabled={!editable}
                                maxLength={120}
                                aria-label={t("rules.app.workflowName")}
                                onChange={(event) =>
                                  updateStages(code, () => ({
                                    workflowName: event.target.value,
                                  }))
                                }
                              />
                              <Tag>
                                {td(`contractType.${String(row.contractType)}`)}
                              </Tag>
                              <Typography.Text code>{code}</Typography.Text>
                              {editable ? (
                                <>
                                  <Select<string>
                                    placeholder={t("rules.app.addStage")}
                                    value={null}
                                    style={{ minWidth: 200 }}
                                    options={STAGE_TYPES.filter(
                                      (type) => !used.has(type),
                                    ).map((type) => ({
                                      value: type,
                                      label: td(`milestoneType.${type}`),
                                    }))}
                                    onChange={(type) => addStage(code, type)}
                                    data-testid={`app-stage-add-${code}`}
                                  />
                                  <Button
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={() => removeWorkflow(code)}
                                  >
                                    {t("rules.app.removeWorkflow")}
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                      <Table
                        size="small"
                        rowKey="id"
                        dataSource={[
                          ...templates
                            .filter(isAppTemplate)
                            .sort(
                              (a, b) =>
                                a.workflowTemplate.localeCompare(
                                  b.workflowTemplate,
                                ) || a.sequence - b.sequence,
                            ),
                          ...templates.filter((row) => !isAppTemplate(row)),
                        ]}
                        scroll={{ x: 1100 }}
                        pagination={{ pageSize: 8 }}
                        columns={[
                          {
                            title: t("rules.workflow"),
                            render: (_, row) =>
                              isAppTemplate(row) ? (
                                <Space orientation="vertical" size={4}>
                                  <Typography.Text type="secondary">
                                    {String(row.workflowName)} · {row.sequence}{" "}
                                    · {td(`milestoneType.${row.milestoneType}`)}
                                  </Typography.Text>
                                  <Input
                                    value={row.name}
                                    disabled={!editable}
                                    maxLength={120}
                                    aria-label={t("rules.app.stageName")}
                                    onChange={(event) =>
                                      setTemplates((all) =>
                                        all.map((item) =>
                                          item.id === row.id
                                            ? {
                                                ...item,
                                                name: event.target.value,
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                </Space>
                              ) : (
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
                          {
                            title: t("rules.app.approval"),
                            render: (_, row) =>
                              isAppTemplate(row) ? (
                                <Select<string>
                                  disabled={!editable}
                                  value={String(row.approval)}
                                  style={{ minWidth: 150 }}
                                  options={["CONTRACT", "NONE"].map(
                                    (value) => ({
                                      value,
                                      label: t(
                                        `rules.app.approvalOptions.${value}`,
                                      ),
                                    }),
                                  )}
                                  onChange={(value) =>
                                    setTemplates((all) =>
                                      all.map((item) =>
                                        item.id === row.id
                                          ? { ...item, approval: value }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              ) : (
                                t("rules.app.approvalOptions.CONTRACT")
                              ),
                          },
                          {
                            key: "remove",
                            width: 120,
                            render: (_, row) =>
                              isAppTemplate(row) && editable ? (
                                <Space size={0}>
                                  <Button
                                    type="text"
                                    icon={<ArrowUpOutlined />}
                                    aria-label={t("rules.app.moveUp")}
                                    disabled={row.sequence === 1}
                                    onClick={() => moveStage(row, -1)}
                                  />
                                  <Button
                                    type="text"
                                    icon={<ArrowDownOutlined />}
                                    aria-label={t("rules.app.moveDown")}
                                    disabled={
                                      !templates.some(
                                        (item) =>
                                          item.workflowTemplate ===
                                            row.workflowTemplate &&
                                          item.sequence === row.sequence + 1,
                                      )
                                    }
                                    onClick={() => moveStage(row, 1)}
                                  />
                                  <Button
                                    danger
                                    type="text"
                                    icon={<DeleteOutlined />}
                                    aria-label={t("rules.app.removeStage")}
                                    onClick={() => removeStage(row)}
                                  />
                                </Space>
                              ) : null,
                          },
                        ]}
                      />
                    </>
                  ),
                },
                {
                  key: "rules",
                  label: t("rules.expressions"),
                  children: (
                    <RuleExpressionEditor
                      key={selected.id}
                      rules={rules}
                      original={selected.rules}
                      editable={editable && !save.isPending}
                      validation={currentSyntax}
                      checking={syntax.isPending}
                      onCheck={() => syntax.mutate(rules)}
                      onChange={(id, field, value) =>
                        setRules((all) =>
                          all.map((row) =>
                            row.rule_id === id
                              ? { ...row, [field]: value }
                              : row,
                          ),
                        )
                      }
                      workflowNames={workflowNames}
                      onApplyFamily={applyFamily}
                      onAddRule={addRule}
                      onCreateWorkflow={(contractType) =>
                        setAddingWorkflow({ contractType, fromRules: true })
                      }
                      scope={ruleScope}
                      onScopeChange={setRuleScope}
                      onRemoveRule={(id) =>
                        setRules((all) =>
                          all.filter((row) => row.rule_id !== id),
                        )
                      }
                    />
                  ),
                },
              ]}
            />
          </div>
        ) : null}
      </Modal>
      <FormModal
        open={Boolean(addingWorkflow)}
        initialValues={addingWorkflow || undefined}
        title={t("rules.app.addWorkflow")}
        onClose={() => setAddingWorkflow(false)}
        onSubmit={async (values: {
          code: string;
          name: string;
          contractType: string;
        }) => {
          try {
            const scope = addWorkflow(values);
            // From the rule editor, open the new workflow's first scope to add rules there.
            if (addingWorkflow && addingWorkflow.fromRules) setRuleScope(scope);
            else setEditorTab("templates");
            message.success(t("rules.app.created"));
          } catch {
            void message.error(
              t("rules.app.problems.APP_WORKFLOW_CODE", { where: values.code }),
            );
            throw new Error("APP_WORKFLOW_CODE");
          }
        }}
      >
        <Form.Item
          name="contractType"
          label={t("rules.app.contractType")}
          rules={[
            {
              required: true,
              message: tc("forms.required", {
                field: t("rules.app.contractType"),
              }),
            },
          ]}
        >
          <Select
            options={WORKFLOW_CONTRACT_TYPES.map((value) => ({
              value,
              label: td(`contractType.${value}`),
            }))}
          />
        </Form.Item>
        <Form.Item
          name="name"
          label={t("rules.app.workflowName")}
          rules={[
            {
              required: true,
              whitespace: true,
              message: tc("forms.required", {
                field: t("rules.app.workflowName"),
              }),
            },
            { max: 120 },
          ]}
        >
          <Input
            maxLength={120}
            placeholder={t("rules.app.workflowNamePlaceholder")}
          />
        </Form.Item>
        <Form.Item
          name="code"
          label={t("rules.app.workflowCode")}
          extra={t("rules.app.workflowCodeHint")}
          rules={[
            {
              required: true,
              pattern: /^[A-Za-z0-9_]{2,30}$/,
              message: t("rules.app.workflowCodeHint"),
            },
          ]}
        >
          <Input addonBefore={APP_PREFIX} maxLength={30} />
        </Form.Item>
      </FormModal>
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
