import { fillEmptyInputs } from "@/shared/lib/form-input";
import { ImportOutlined, ReadOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Grid,
  Modal,
  Space,
  Steps,
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
import { DocumentPreview } from "@/shared/ui/DocumentPreview";
import styles from "./ExtractionPanel.module.css";

const paths = [
  "valueMillion",
  "graceDays",
  "penaltyRatePct",
  "maxPenaltyPct",
  "startDate",
  "endDate",
] as const;
export function ExtractionPanel({
  code,
  onReadyChange,
}: {
  code: string;
  onReadyChange?: (ready: boolean) => void;
}) {
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
  const [readOpen, setReadOpen] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [reviewedSource, setReviewedSource] = useState<string>();
  const [reviewedProposal, setReviewedProposal] = useState<string>();
  const small = Grid.useBreakpoint().xs;
  const sourceKey = `${code}:${draft.data?.file.documentId ?? ""}:${draft.data?.file.sha256 ?? ""}`;
  const hasFile = !!draft.data?.file.documentId;
  const confirmed = !!proposal.data?.confirmedBy;
  const readDone = !hasFile || reviewedSource === sourceKey || confirmed;
  useEffect(() => {
    onReadyChange?.(
      draft.isSuccess &&
        proposal.isSuccess &&
        (!hasFile || confirmed || draft.data.state !== "DRAFT"),
    );
  }, [
    onReadyChange,
    draft.isSuccess,
    proposal.isSuccess,
    hasFile,
    confirmed,
    draft.data?.state,
  ]);
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
  const canLoad = !!proposal.data?.fields.some((field) => field.value !== null);
  const nextField = paths.find(
    (path) => !values[path]?.trim() || problems[path],
  );
  const error =
    extract.error ??
    confirm.error ??
    download.error ??
    proposal.error ??
    draft.error;
  const acknowledged =
    reviewedProposal === proposal.data?.id && !!proposal.data;
  const currentStep = confirmed
    ? 3
    : !readDone
      ? 0
      : !proposal.data
        ? 1
        : !acknowledged
          ? 2
          : 3;
  const nextAction = !readDone
    ? "read"
    : !proposal.data
      ? "extract"
      : !ready && canLoad
        ? "load"
        : !acknowledged
          ? "review"
          : "confirm";
  return (
    <Card
      title={t("extraction.title")}
      data-testid="extraction-panel"
      className={styles.panel}
    >
      <Steps
        current={currentStep}
        status={confirmed ? "finish" : "process"}
        size="small"
        responsive={false}
        className={styles.steps}
        items={["read", "extract", "review", "confirm"].map((step, index) => ({
          title:
            small && index !== currentStep ? "" : t(`extraction.flow.${step}`),
          ...(index === 0 && !hasFile
            ? {
                status: "wait" as const,
                title: small ? "" : t("extraction.flow.noFile"),
              }
            : {}),
        }))}
      />
      <Alert
        type={confirmed ? "success" : "info"}
        showIcon
        title={t(
          confirmed
            ? "extraction.flow.done"
            : `extraction.flow.hints.${nextAction}`,
        )}
        description={
          !hasFile && draft.isSuccess ? t("extraction.noDocument") : undefined
        }
        style={{ marginBottom: 12 }}
      />
      <Space wrap style={{ marginBottom: 12 }}>
        {hasFile ? (
          <Button
            icon={<ReadOutlined />}
            type={!readDone ? "primary" : "default"}
            className={!readDone ? styles.nextAction : undefined}
            onClick={() => {
              setPreviewReady(false);
              setReadOpen(true);
            }}
            data-testid="extraction-read-document"
          >
            {t(
              readDone
                ? "extraction.flow.readAgain"
                : "extraction.flow.readDocument",
            )}
          </Button>
        ) : null}
        <Button
          onClick={() => extract.mutate()}
          loading={extract.isPending}
          disabled={
            draft.data?.state !== "DRAFT" ||
            !readDone ||
            confirmed ||
            proposal.isPending
          }
          type={nextAction === "extract" ? "primary" : "default"}
          className={nextAction === "extract" ? styles.nextAction : undefined}
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
          <Button
            size="small"
            icon={<ImportOutlined />}
            className={nextAction === "load" ? styles.nextAction : undefined}
            disabled={!canLoad}
            onClick={() => {
              setReviewedProposal(undefined);
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
              );
            }}
            data-testid="extraction-load-suggestions"
          >
            {t("extraction.loadSuggestions")}
          </Button>
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
          {proposal.data.extractor.kind === "GEMINI" ? (
            <Alert
              type="info"
              showIcon
              title={t("extraction.aiNotice")}
              style={{ marginBottom: 12 }}
            />
          ) : null}
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
                      {proposal.data?.extractor.kind === "GEMINI" ? (
                        <Tag
                          color={row.evidence.verified ? "green" : "warning"}
                        >
                          {t(
                            row.evidence.verified
                              ? "extraction.quoteVerified"
                              : "extraction.scanReview",
                          )}
                        </Tag>
                      ) : null}
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
                      className={
                        !ready && readDone && row.path === nextField
                          ? styles.nextAction
                          : undefined
                      }
                      aria-label={t(`fields.${row.path}`)}
                      data-testid={`extraction-value-${row.path}`}
                      disabled={!!proposal.data?.confirmedBy}
                      value={values[row.path] ?? ""}
                      placeholder={t(`placeholders.${row.path}`)}
                      maxLength={30}
                      onChange={(event) => {
                        setReviewedProposal(undefined);
                        setValues((current) => ({
                          ...current,
                          [row.path]: event.target.value,
                        }));
                      }}
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
            <>
              <div className={styles.reviewAck}>
                <Checkbox
                  checked={acknowledged}
                  disabled={!ready || !readDone}
                  onChange={(event) =>
                    setReviewedProposal(
                      event.target.checked ? proposal.data!.id : undefined,
                    )
                  }
                  data-testid="extraction-review-ack"
                  className={
                    nextAction === "review" && ready
                      ? styles.nextAction
                      : undefined
                  }
                >
                  {t("extraction.flow.reviewAck")}
                </Checkbox>
              </div>
              <Button
                type="primary"
                onClick={() => confirm.mutate()}
                loading={confirm.isPending}
                disabled={!ready || !readDone || !acknowledged}
                className={
                  nextAction === "confirm" ? styles.nextAction : undefined
                }
                data-testid="extraction-confirm"
              >
                {t("extraction.confirm")}
              </Button>
            </>
          )}
        </>
      ) : null}
      <Modal
        open={readOpen}
        onCancel={() => setReadOpen(false)}
        title={t("extraction.flow.readDocument")}
        width={1000}
        style={{ top: 20 }}
        styles={{
          body: { maxHeight: "calc(100dvh - 180px)", overflowY: "auto" },
        }}
        destroyOnHidden
        footer={
          <Space>
            <Button onClick={() => setReadOpen(false)}>
              {t("extraction.flow.close")}
            </Button>
            <Button
              type="primary"
              disabled={!previewReady}
              data-testid="extraction-read-ack"
              onClick={() => {
                setReviewedSource(sourceKey);
                setReadOpen(false);
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLElement>('[data-testid="extract-terms"]')
                    ?.focus(),
                );
              }}
            >
              {t("extraction.flow.readDone")}
            </Button>
          </Space>
        }
      >
        <Alert
          type="info"
          showIcon
          title={t("extraction.flow.readHint")}
          style={{ marginBottom: 12 }}
        />
        <DocumentPreview
          documentId={draft.data?.file.documentId}
          name={draft.data?.file.name ?? ""}
          onReady={setPreviewReady}
        />
      </Modal>
    </Card>
  );
}
