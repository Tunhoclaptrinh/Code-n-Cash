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
  type TableColumnsType,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { downloadBlob, useAccess } from "@codecash/ui";
import { draftProblems, type ExtractionField } from "@codecash/contracts";
import { trustApi } from "@/shared/api/trust";
import { getContractDraft } from "@/shared/api/domain";
import { platform } from "@/shared/api/platform";
import { useCurrentUser } from "@/shared/auth/session";
import { PdfPageImage } from "@/shared/ui/PdfPageImage";
import { getSigningConfig, signingKeys } from "../api/signingConfig.api";
import { PAGE_WIDTH, pageHeightOf } from "../lib/signature-layout";
import { TechnicalDetails } from "@/shared/ui/TechnicalInfo";
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
  const { t: ts } = useTranslation("signing");
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
  // The document is read as page images, which every browser shows (an embedded PDF is blank on
  // phones and some desktop browsers, so its load would never count as read).
  const pageList = useQuery({
    queryKey: signingKeys.config(code),
    queryFn: () => getSigningConfig(code),
    enabled: allowed && readOpen,
  });
  const [reviewedSource, setReviewedSource] = useState<string>();
  const [reviewedProposal, setReviewedProposal] = useState<string>();
  const small = Grid.useBreakpoint().xs;
  const sourceKey = `${code}:${draft.data?.file.documentId ?? ""}:${draft.data?.file.sha256 ?? ""}`;
  const hasFile = !!draft.data?.file.documentId;
  const confirmed = !!proposal.data?.confirmedBy;
  // Once signing has started the draft is locked: nothing here can change any more.
  const locked = draft.isSuccess && draft.data.state !== "DRAFT";
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
  // A field shows its problem once it is filled in; the two dates are checked against each other
  // only when both are given. Empty fields simply keep the confirm button disabled.
  const shownProblem = (path: string) =>
    !!problems[path] &&
    !!values[path]?.trim() &&
    (path !== "startDate" && path !== "endDate"
      ? true
      : !!values.startDate?.trim() && !!values.endDate?.trim());
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
  const currentStep =
    confirmed || locked
      ? 3
      : !readDone
        ? 0
        : !proposal.data
          ? 1
          : !acknowledged
            ? 2
            : 3;
  const showExtract = !locked && !confirmed && !(!hasFile && proposal.data);
  const showLoad =
    !!proposal.data && !proposal.data.confirmedBy && !locked && canLoad;
  const extractBlocked =
    !draft.isSuccess || !readDone || confirmed || proposal.isPending;
  // Without a file there is nothing to read: the terms are typed in by hand.
  const flowSteps = hasFile
    ? ["read", "extract", "review", "confirm"]
    : ["manual", "review", "confirm"];
  const flowStep = hasFile ? currentStep : Math.max(0, currentStep - 1);
  const nextAction = !readDone
    ? "read"
    : !proposal.data
      ? "extract"
      : !ready && canLoad
        ? "load"
        : !acknowledged
          ? "review"
          : "confirm";
  // Only an extraction from a file has a suggestion and a quoted source per field.
  const fileColumns: TableColumnsType<ExtractionField> = [
    {
      title: t("extraction.suggestion"),
      render: (_, row) =>
        row.value ? (
          <span style={{ whiteSpace: "nowrap" }}>{row.value}</span>
        ) : (
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
              <Tag color={row.evidence.verified ? "green" : "warning"}>
                {t(
                  row.evidence.verified
                    ? "extraction.quoteVerified"
                    : "extraction.scanReview",
                )}
              </Tag>
            ) : null}
            <Typography.Paragraph
              style={{
                maxWidth: 400,
                whiteSpace: "pre-wrap",
                marginBottom: 0,
              }}
            >
              {row.evidence.quote}
            </Typography.Paragraph>
          </>
        ) : (
          "—"
        ),
    },
  ];
  return (
    <Card
      title={t("extraction.title")}
      size="small"
      styles={{ body: { padding: 16 }, header: { paddingInline: 16 } }}
      data-testid="extraction-panel"
      className={styles.panel}
    >
      <Steps
        current={flowStep}
        status={confirmed || locked ? "finish" : "process"}
        size="small"
        responsive={false}
        className={styles.steps}
        items={flowSteps.map((step, index) => ({
          title:
            small && index !== flowStep ? "" : t(`extraction.flow.${step}`),
        }))}
      />
      {locked && !confirmed ? (
        <Alert
          type="info"
          showIcon
          title={t("extraction.flow.locked")}
          style={{ marginBottom: 12 }}
        />
      ) : !hasFile && draft.isSuccess && !confirmed ? (
        <Alert
          type="warning"
          showIcon
          title={ts("prepLite.extraction.noFile")}
          style={{ marginBottom: 12 }}
        />
      ) : null}
      <Space
        wrap
        className={styles.actions}
        hidden={!hasFile && !showExtract && !showLoad}
      >
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
        {/* Locked drafts take no action; a manual form, once open, needs no second button. */}
        {showExtract ? (
          <Button
            onClick={() => extract.mutate()}
            loading={extract.isPending}
            disabled={extractBlocked}
            type={nextAction === "extract" ? "primary" : "default"}
            className={
              nextAction === "extract" && !extractBlocked
                ? styles.nextAction
                : undefined
            }
            data-testid="extract-terms"
          >
            {t(hasFile ? "extraction.extract" : "extraction.manualEntry")}
          </Button>
        ) : null}
        {draft.data?.file.documentId ? (
          <Button
            onClick={() => download.mutate()}
            loading={download.isPending}
          >
            {t("extraction.document")}
          </Button>
        ) : null}
        {showLoad ? (
          <Button
            size="small"
            icon={<ImportOutlined />}
            className={nextAction === "load" ? styles.nextAction : undefined}
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
          <TechnicalDetails
            items={[
              {
                key: "method",
                label: ts("prepLite.extraction.method"),
                value: `${t(`extraction.kinds.${proposal.data.extractor.kind}`)} · ${proposal.data.extractor.version}`,
              },
              {
                key: "fingerprint",
                label: t("extraction.fingerprint"),
                value: proposal.data.documentSha256 ? (
                  <Typography.Text copyable code className={styles.hash}>
                    {proposal.data.documentSha256}
                  </Typography.Text>
                ) : null,
              },
            ]}
          />
          {hasFile &&
          proposal.data.warnings.some(
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
            tableLayout="auto"
            scroll={hasFile ? { x: 760 } : undefined}
            columns={[
              {
                title: t("extraction.field"),
                render: (_, row) => t(`fields.${row.path}`),
              },
              // A manual form has no suggestion or quoted source to show.
              ...(hasFile ? fileColumns : []),
              {
                title: t("extraction.confirmValue"),
                render: (_, row) => (
                  <Form.Item
                    style={{ margin: 0 }}
                    validateStatus={
                      shownProblem(row.path) ? "error" : undefined
                    }
                    help={
                      shownProblem(row.path)
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
                      disabled={!!proposal.data?.confirmedBy || locked}
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
          {locked && !proposal.data.confirmedBy ? null : proposal.data
              .confirmedBy ? (
            <Alert
              type="success"
              showIcon
              title={
                proposal.data.confirmedByName
                  ? t("extraction.confirmed", {
                      actor: proposal.data.confirmedByName,
                    })
                  : t("extraction.flow.done")
              }
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
                  {ts(
                    hasFile
                      ? "prepLite.extraction.reviewAck"
                      : "prepLite.extraction.reviewAckManual",
                  )}
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
        {pageList.data && draft.data?.file.documentId ? (
          <div className={styles.readPages} data-testid="extraction-read-pages">
            {pageList.data.previewPages.map((page) => (
              <div
                key={page.pageNo}
                className={styles.readPage}
                style={{
                  aspectRatio: `${PAGE_WIDTH} / ${pageHeightOf(pageList.data.previewPages, page.pageNo)}`,
                }}
              >
                <PdfPageImage
                  contractId={code}
                  documentId={draft.data!.file.documentId!}
                  page={page.pageNo}
                  // The first page on screen is what the reader starts from.
                  onReady={page.pageNo === 1 ? setPreviewReady : undefined}
                />
              </div>
            ))}
          </div>
        ) : (
          <Alert
            type={pageList.isError ? "warning" : "info"}
            title={t(
              pageList.isError
                ? "extraction.flow.pagesUnavailable"
                : "extraction.flow.pagesLoading",
            )}
          />
        )}
      </Modal>
    </Card>
  );
}
