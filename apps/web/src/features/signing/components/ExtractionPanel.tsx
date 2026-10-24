import { DemoFillButton, fillEmptyInputs } from "@/shared/ui/DemoFillButton";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { downloadBlob, useAccess } from "@codecash/ui";
import { draftProblems, type ExtractionField } from "@codecash/contracts";
import { trustApi } from "@/shared/api/trust";
import { getContractDraft } from "@/shared/api/domain";
import { platform } from "@/shared/api/platform";
import { useCurrentUser } from "@/shared/auth/session";

const paths = [
  "valueMillion",
  "graceDays",
  "penaltyRatePct",
  "maxPenaltyPct",
  "startDate",
  "endDate",
] as const;
export function ExtractionPanel({ code }: { code: string }) {
  const { t } = useTranslation("trust");
  const { t: td } = useTranslation("domain");
  const user = useCurrentUser();
  const { hasPermission } = useAccess(user);
  const allowed = hasPermission("contracts:digitize");
  const client = useQueryClient();
  const key = ["extraction", user.id, code];
  const proposal = useQuery({
    queryKey: key,
    queryFn: () => trustApi.extraction(code),
    enabled: allowed,
  });
  const draft = useQuery({
    queryKey: ["contract-draft", user.id, code],
    queryFn: () => getContractDraft(code),
    enabled: allowed,
  });
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!proposal.data || !draft.data) return;
    setValues(
      Object.fromEntries(
        paths.map((path) => [
          path,
          proposal.data?.confirmedValues?.[path] ?? "",
        ]),
      ),
    );
  }, [proposal.data, draft.data]);
  const extract = useMutation({
    mutationFn: () => trustApi.extract(code),
    onSuccess: (data) => client.setQueryData(key, data),
  });
  const confirm = useMutation({
    mutationFn: () =>
      trustApi.confirmExtraction(code, proposal.data!.id, values),
    onSuccess: async (data) => {
      client.setQueryData(key, data);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["signing"] }),
        client.invalidateQueries({ queryKey: ["contract-draft"] }),
      ]);
    },
  });
  const download = useMutation({
    mutationFn: async () => {
      if (draft.data?.file.documentId)
        downloadBlob(
          await platform.download(
            `/documents/${draft.data.file.documentId}/download`,
          ),
          draft.data.file.name,
        );
    },
  });
  if (!allowed) return null;
  const problems = draft.data
    ? draftProblems({
        ...draft.data,
        ...values,
        graceDays: Number(values.graceDays),
      })
    : {};
  const ready = paths.every((path) => values[path]?.trim() && !problems[path]);
  const error = extract.error ?? confirm.error ?? download.error;
  return (
    <Card title={t("extraction.title")} data-testid="extraction-panel">
      <Alert
        type="info"
        showIcon
        title={t("extraction.notice")}
        style={{ marginBottom: 12 }}
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <Button
          onClick={() => extract.mutate()}
          loading={extract.isPending}
          disabled={draft.data?.state !== "DRAFT"}
          data-testid="extract-terms"
        >
          {t("extraction.extract")}
        </Button>
        {draft.data?.file.documentId ? (
          <Button
            onClick={() => download.mutate()}
            loading={download.isPending}
          >
            {t("extraction.document")}
          </Button>
        ) : null}
        {proposal.data && !proposal.data.confirmedBy ? (
          <DemoFillButton
            onClick={() =>
              setValues((current) =>
                fillEmptyInputs(
                  current,
                  Object.fromEntries(
                    proposal.data!.fields.map((field) => [
                      field.path,
                      field.value ?? "",
                    ]),
                  ),
                ),
              )
            }
            testId="extraction-load-suggestions"
          >
            {t("extraction.loadSuggestions")}
          </DemoFillButton>
        ) : null}
        {proposal.data ? (
          <Tag>
            {t(`extraction.kinds.${proposal.data.extractor.kind}`)} ·{" "}
            {proposal.data.extractor.version}
          </Tag>
        ) : null}
      </Space>
      {error ? (
        <Alert
          type="error"
          showIcon
          title={td(
            `errors.${(error as { code?: string }).code ?? "UNKNOWN"}`,
            { defaultValue: td("errors.UNKNOWN") },
          )}
        />
      ) : null}
      {proposal.data ? (
        <>
          {proposal.data.documentSha256 ? (
            <Typography.Paragraph copyable code>
              {proposal.data.documentSha256}
            </Typography.Paragraph>
          ) : (
            <Alert type="warning" showIcon title={t("extraction.noDocument")} />
          )}
          {proposal.data.warnings.some(
            (warning) =>
              warning === "NO_TEXT" || warning === "EXTRACTION_UNAVAILABLE",
          ) ? (
            <Alert type="warning" title={t("extraction.noText")} />
          ) : null}
          <Table<ExtractionField>
            rowKey="path"
            size="small"
            dataSource={proposal.data.fields}
            pagination={false}
            scroll={{ x: 980 }}
            columns={[
              {
                title: t("extraction.field"),
                render: (_, row) => t(`fields.${row.path}`),
              },
              {
                title: t("extraction.suggestion"),
                render: (_, row) =>
                  row.value ?? (
                    <Tag color="warning">{t("extraction.manual")}</Tag>
                  ),
              },
              {
                title: t("extraction.source"),
                render: (_, row) =>
                  row.evidence ? (
                    <>
                      <Typography.Text strong>
                        {t("extraction.page", { page: row.evidence.page })}
                      </Typography.Text>
                      <Typography.Paragraph
                        style={{ maxWidth: 400, whiteSpace: "pre-wrap" }}
                      >
                        {row.evidence.quote}
                      </Typography.Paragraph>
                    </>
                  ) : (
                    "—"
                  ),
              },
              {
                title: t("extraction.confirmValue"),
                render: (_, row) => (
                  <Form.Item
                    style={{ margin: 0 }}
                    validateStatus={
                      !values[row.path]?.trim() || problems[row.path]
                        ? "error"
                        : undefined
                    }
                    help={
                      problems[row.path]
                        ? td(`errors.${problems[row.path]}`)
                        : undefined
                    }
                  >
                    <Input
                      disabled={!!proposal.data?.confirmedBy}
                      value={values[row.path] ?? ""}
                      placeholder={t(`placeholders.${row.path}`)}
                      maxLength={30}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [row.path]: event.target.value,
                        }))
                      }
                    />
                  </Form.Item>
                ),
              },
            ]}
          />
          {proposal.data.confirmedBy ? (
            <Alert
              type="success"
              showIcon
              title={t("extraction.confirmed", {
                actor: proposal.data.confirmedBy,
              })}
            />
          ) : (
            <Button
              type="primary"
              onClick={() => confirm.mutate()}
              loading={confirm.isPending}
              disabled={!ready}
              data-testid="extraction-confirm"
            >
              {t("extraction.confirm")}
            </Button>
          )}
        </>
      ) : null}
    </Card>
  );
}
