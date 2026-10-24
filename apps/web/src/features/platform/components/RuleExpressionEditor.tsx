import { useRef, useState } from "react";
import {
  Alert,
  Button,
  Collapse,
  Drawer,
  Dropdown,
  Form,
  Input,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import {
  BookOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type {
  RuleExpressionField,
  RuleExpressionValidation,
  RuleLanguage,
  RuleVersion,
} from "@codecash/contracts";
import { trustApi } from "@/shared/api/trust";
import { useCurrentUser } from "@/shared/auth/session";
import styles from "./RuleExpressionEditor.module.css";
type Rule = RuleVersion["rules"][number];
const fields: RuleExpressionField[] = [
  "condition_expression",
  "penalty_amount_formula",
  "payable_amount_formula",
];
const tone = (decision: string) =>
  ({ HOLD: "warning", RELEASE: "success", REJECT: "error", PENALTY: "orange" })[
    decision
  ];

export function RuleExpressionEditor({
  rules,
  original,
  editable,
  validation,
  checking,
  onCheck,
  onChange,
}: {
  rules: Rule[];
  original: Rule[];
  editable: boolean;
  validation?: RuleExpressionValidation;
  checking: boolean;
  onCheck: () => void;
  onChange: (id: string, field: RuleExpressionField, value: string) => void;
}) {
  const { t, i18n } = useTranslation("trust");
  const { t: td } = useTranslation("domain");
  const user = useCurrentUser();
  const language = i18n.language.startsWith("vi") ? "vi" : "en";
  const catalog = useQuery({
    queryKey: ["rule-language", user.id],
    queryFn: trustApi.ruleLanguage,
    staleTime: Infinity,
  });
  const [scope, setScope] = useState<string>();
  const [ruleId, setRuleId] = useState<string>();
  const [help, setHelp] = useState(false);
  const [search, setSearch] = useState("");
  const scopes = [...new Set(rules.map((row) => row.release_rule_code))];
  const activeScope = scope && scopes.includes(scope) ? scope : scopes[0];
  const scoped = rules
    .filter((row) => row.release_rule_code === activeScope)
    .sort((a, b) => Number(a.priority) - Number(b.priority));
  const selected = scoped.find((row) => row.rule_id === ruleId) ?? scoped[0];
  const variables = catalog.data?.variables ?? [];
  const openVariable = (name = "") => {
    setSearch(name);
    setHelp(true);
  };
  const chooseRule = (id: string) => {
    const row = rules.find((item) => item.rule_id === id);
    if (row) {
      setScope(row.release_rule_code);
      setRuleId(id);
    }
  };
  const issues = validation?.issues ?? [];
  const filtered = variables.filter((variable) =>
    [variable.name, variable.label[language], variable.description[language]]
      .join(" ")
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  return (
    <div data-testid="rule-expression-editor">
      <div className={styles.toolbar}>
        <div className={styles.scope}>
          <Typography.Text strong>{t("rules.language.scope")}</Typography.Text>
          <Select
            aria-label={t("rules.language.scope")}
            showSearch
            optionFilterProp="label"
            value={activeScope}
            onChange={(value) => {
              setScope(value);
              setRuleId(undefined);
            }}
            options={scopes.map((value) => {
              const row = rules.find(
                (item) => item.release_rule_code === value,
              )!;
              return {
                value,
                label: `${td(`workflow.${row.workflow_template}`)} · ${td(`milestoneType.${row.applies_to_milestone_type}`)}`,
              };
            })}
            data-testid="rule-scope-select"
          />
          <Typography.Text code>{activeScope}</Typography.Text>
        </div>
        <Space wrap>
          <Button
            icon={<BookOutlined />}
            onClick={() => openVariable()}
            data-testid="rule-language-help"
          >
            {t("rules.language.reference")}
          </Button>
          <Button
            icon={<CheckCircleOutlined />}
            loading={checking}
            onClick={onCheck}
            data-testid="rule-syntax-check"
          >
            {t("rules.language.check")}
          </Button>
        </Space>
      </div>
      <Alert
        type="info"
        showIcon
        title={t("rules.language.order")}
        className={styles.notice}
      />
      {catalog.isError ? (
        <Alert
          type="warning"
          showIcon
          title={t("rules.language.catalogError")}
          action={
            <Button onClick={() => void catalog.refetch()}>
              {t("rules.language.retry")}
            </Button>
          }
        />
      ) : null}
      <div aria-live="polite" className={styles.validation}>
        {validation ? (
          <Alert
            type={validation.valid ? "success" : "error"}
            showIcon
            title={
              validation.valid
                ? t("rules.language.valid", { count: validation.checked })
                : t("rules.language.invalid", { count: issues.length })
            }
            description={
              !validation.valid ? (
                <Space wrap>
                  {issues.slice(0, 6).map((issue, index) => (
                    <Button
                      key={index}
                      size="small"
                      danger
                      onClick={() => chooseRule(issue.ruleId)}
                    >
                      {issue.ruleId} · {t(`rules.${issue.field}`)}
                    </Button>
                  ))}
                </Space>
              ) : undefined
            }
            data-testid="rule-syntax-result"
          />
        ) : (
          <Typography.Text type="secondary">
            {t("rules.language.unchecked")}
          </Typography.Text>
        )}
      </div>
      <Typography.Paragraph type="secondary" className={styles.hint}>
        {t("rules.language.syntaxOnly")}
      </Typography.Paragraph>
      <div className={styles.layout}>
        <nav
          aria-label={t("rules.language.orderList")}
          className={styles.ruleList}
        >
          {scoped.map((row) => (
            <button
              type="button"
              key={row.rule_id}
              className={[
                styles.ruleChoice,
                selected?.rule_id === row.rule_id ? styles.selected : "",
              ].join(" ")}
              aria-pressed={selected?.rule_id === row.rule_id}
              onClick={() => setRuleId(row.rule_id)}
              data-testid={`rule-option-${row.rule_id}`}
            >
              <span className={styles.ruleTop}>
                <Tag>{row.priority}</Tag>
                <Tag color={tone(row.decision)}>{row.decision}</Tag>
                <small>{row.rule_id}</small>
              </span>
              <span>
                {language === "vi"
                  ? t(`rules.language.priorities.${row.priority}`)
                  : row.rule_name}
              </span>
            </button>
          ))}
        </nav>
        {selected ? (
          <section
            className={styles.detail}
            data-testid="rule-expression-detail"
          >
            <div className={styles.heading}>
              <Typography.Text strong>
                {language === "vi"
                  ? t(`rules.language.priorities.${selected.priority}`)
                  : selected.rule_name}
              </Typography.Text>
              <Tag color={tone(selected.decision)}>{selected.decision}</Tag>
            </div>
            <Typography.Paragraph className={styles.description}>
              {selected.rule_description_vi}
            </Typography.Paragraph>
            <Typography.Paragraph type="secondary" className={styles.hint}>
              {t("rules.language.lockedMetadata")}
            </Typography.Paragraph>
            <Space wrap size={[6, 6]} className={styles.metadata}>
              <Tag>
                {t("rules.language.priority", { value: selected.priority })}
              </Tag>
              <Typography.Text code>{selected.rule_id}</Typography.Text>
              <Typography.Text type="secondary">
                {td(`reason.${selected.reason_code}`, {
                  defaultValue: selected.reason_code,
                })}
              </Typography.Text>
            </Space>
            {fields.some(
              (field) =>
                selected[field] !==
                original.find((row) => row.rule_id === selected.rule_id)?.[
                  field
                ],
            ) ? (
              <Alert
                type="warning"
                showIcon
                title={t("rules.language.modified")}
                className={styles.notice}
              />
            ) : null}
            <div className={styles.fields}>
              {fields.map((field) => (
                <ExpressionInput
                  key={`${selected.rule_id}-${field}`}
                  field={field}
                  value={selected[field]}
                  original={
                    original.find((row) => row.rule_id === selected.rule_id)?.[
                      field
                    ]
                  }
                  editable={editable}
                  variables={variables}
                  issues={issues.filter(
                    (issue) =>
                      issue.ruleId === selected.rule_id &&
                      issue.field === field,
                  )}
                  onChange={(value) => onChange(selected.rule_id, field, value)}
                  onVariable={openVariable}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
      <Drawer
        title={t("rules.language.reference")}
        open={help}
        onClose={() => setHelp(false)}
        width={Math.min(
          720,
          typeof window === "undefined" ? 720 : window.innerWidth,
        )}
        zIndex={1200}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          title={t("rules.language.vocabulary", { count: variables.length })}
          description={t("rules.language.vocabularyHint")}
          className={styles.notice}
        />
        <Collapse
          defaultActiveKey={["syntax"]}
          items={[
            {
              key: "syntax",
              label: t("rules.language.syntax"),
              children: (
                <Space orientation="vertical">
                  <Typography.Text code>
                    {catalog.data?.operators.join(" ")}
                  </Typography.Text>
                  <Typography.Paragraph>
                    {t("rules.language.orderDetail")}
                  </Typography.Paragraph>
                  <Typography.Paragraph>
                    {t("rules.language.syntaxHint")}
                  </Typography.Paragraph>
                  <Typography.Text code>
                    MIN(a, b) · MAX(a, b) · TRUE · FALSE · ELSE
                  </Typography.Text>
                  <Typography.Paragraph>
                    {t("rules.language.dateHint")}
                  </Typography.Paragraph>
                  <Typography.Paragraph>
                    {t("rules.language.unitHint")}
                  </Typography.Paragraph>
                </Space>
              ),
            },
            {
              key: "example",
              label: t("rules.language.example"),
              children: (
                <Space orientation="vertical">
                  <Typography.Paragraph>
                    {t("rules.language.exampleInputs")}
                  </Typography.Paragraph>
                  <Typography.Text code>
                    MIN(3 * 0.10 / 100 * 1000, 8 / 100 * 1000) = 3.00
                  </Typography.Text>
                  <Typography.Text code>
                    MAX(0, 1000 - 3) = 997.00
                  </Typography.Text>
                  <Typography.Paragraph>
                    {t("rules.language.exampleResult")}
                  </Typography.Paragraph>
                </Space>
              ),
            },
          ]}
        />
        <Input.Search
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("rules.language.search")}
          aria-label={t("rules.language.search")}
          className={styles.search}
          allowClear
          data-testid="rule-variable-search"
        />
        <div data-testid="rule-variable-catalog">
          {filtered.map((variable) => (
            <div key={variable.name} className={styles.variableCard}>
              <Typography.Text strong>
                {variable.label[language]}
              </Typography.Text>
              <Typography.Text code copyable>
                {variable.name}
              </Typography.Text>
              <Space wrap>
                <Tag>{t(`rules.language.types.${variable.type}`)}</Tag>
                <Tag>{t(`rules.language.units.${variable.unit}`)}</Tag>
                <Typography.Text type="secondary">
                  {t("rules.language.exampleValue")}: {variable.example}
                </Typography.Text>
              </Space>
              <Typography.Paragraph>
                {variable.description[language]}
              </Typography.Paragraph>
              <Typography.Text type="secondary" className={styles.hint}>
                {t("rules.language.source")}: {variable.source}
              </Typography.Text>
            </div>
          ))}
        </div>
        {!filtered.length ? (
          <Typography.Text type="secondary">
            {t("rules.language.noVariables")}
          </Typography.Text>
        ) : null}
      </Drawer>
    </div>
  );
}
function ExpressionInput({
  field,
  value,
  original,
  editable,
  variables,
  issues,
  onChange,
  onVariable,
}: {
  field: RuleExpressionField;
  value: string;
  original?: string;
  editable: boolean;
  variables: RuleLanguage["variables"];
  issues: RuleExpressionValidation["issues"];
  onChange: (value: string) => void;
  onVariable: (name: string) => void;
}) {
  const { t, i18n } = useTranslation("trust");
  const language = i18n.language.startsWith("vi") ? "vi" : "en";
  const input = useRef<TextAreaRef>(null);
  const selection = useRef({ start: 0, end: 0 });
  const saveSelection = () => {
    const el = input.current?.resizableTextArea?.textArea;
    if (el)
      selection.current = { start: el.selectionStart, end: el.selectionEnd };
  };
  const insert = (name: string) => {
    const { start, end } = selection.current;
    const next = value.slice(0, start) + name + value.slice(end);
    if (next.length > 2000) return;
    onChange(next);
    requestAnimationFrame(() => {
      const el = input.current?.resizableTextArea?.textArea;
      el?.focus();
      el?.setSelectionRange(start + name.length, start + name.length);
    });
  };
  const names = new Set(value.match(/[A-Za-z_][A-Za-z_0-9]*/g) ?? []);
  const used = variables.filter((variable) => names.has(variable.name));
  return (
    <Form.Item
      layout="vertical"
      label={t(`rules.language.labels.${field}`)}
      htmlFor={`rule-expression-${field}`}
      validateStatus={issues.length || !value.trim() ? "error" : undefined}
      help={
        issues.length
          ? issues.map((issue, index) => (
              <div key={index}>
                {t(`rules.language.errors.${issue.code}`, {
                  token: issue.token ?? "",
                })}{" "}
                ·{" "}
                {t("rules.language.position", {
                  line: issue.line,
                  column: issue.column,
                })}
              </div>
            ))
          : !value.trim()
            ? t("rules.expressionRequired")
            : undefined
      }
      className={styles.expression}
    >
      <Typography.Paragraph type="secondary" className={styles.hint}>
        {t(`rules.language.hints.${field}`)}
      </Typography.Paragraph>
      <Input.TextArea
        ref={input}
        id={`rule-expression-${field}`}
        data-testid={`rule-expression-${field}`}
        className={styles.codeInput}
        readOnly={!editable}
        value={value}
        autoSize={{
          minRows: field === "condition_expression" ? 1 : 3,
          maxRows: 8,
        }}
        maxLength={2000}
        onChange={(event) => onChange(event.target.value)}
        onSelect={saveSelection}
        onBlur={saveSelection}
        spellCheck={false}
      />
      <div className={styles.fieldTools}>
        {editable ? (
          <Select<string>
            size="small"
            value={undefined}
            showSearch
            optionFilterProp="label"
            placeholder={t("rules.language.insertVariable")}
            aria-label={t("rules.language.insertVariable")}
            className={styles.insert}
            options={variables
              .filter(
                (variable) =>
                  variable.fields.includes(field) &&
                  (field === "condition_expression" ||
                    variable.type === "number"),
              )
              .map((variable) => ({
                value: variable.name,
                label: `${variable.label[language]} · ${variable.name}`,
              }))}
            onSelect={insert}
          />
        ) : null}
        {editable && original !== undefined && value !== original ? (
          <Button
            size="small"
            type="text"
            icon={<UndoOutlined />}
            onClick={() => onChange(original)}
          >
            {t("rules.language.restore")}
          </Button>
        ) : null}
        <Typography.Text type="secondary" className={styles.counter}>
          {value.length}/2000
        </Typography.Text>
      </div>
      {used.length ? (
        <Dropdown
          trigger={["click"]}
          menu={{
            items: used.map((variable) => ({
              key: variable.name,
              label: `${variable.label[language]} · ${t(`rules.language.units.${variable.unit}`)}`,
              onClick: () => onVariable(variable.name),
            })),
          }}
        >
          <Button
            size="small"
            type="text"
            icon={<InfoCircleOutlined />}
            className={styles.used}
          >
            {t("rules.language.usedVariables", { count: used.length })}
          </Button>
        </Dropdown>
      ) : null}
    </Form.Item>
  );
}
