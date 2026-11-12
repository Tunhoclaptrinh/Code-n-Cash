import { useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { downloadBlob, StatisticsCard, useAccess } from "@codecash/ui";
import type { AnchorJob } from "@codecash/contracts";
import { trustApi } from "@/shared/api/trust";
import { useCurrentUser } from "@/shared/auth/session";
import { formatDateTime } from "@/shared/lib/format";
import { STAT_TONE } from "@/shared/ui/statTone";

/** Seal jobs and bundle checks; `bare` drops the card when the panel is the whole page. */
export function AnchorPanel({ bare = false }: { bare?: boolean } = {}) {
  const { t } = useTranslation("trust");
  const { t: td } = useTranslation("domain");
  const user = useCurrentUser();
  const { hasPermission } = useAccess(user);
  const client = useQueryClient();
  const { message } = App.useApp();
  const key = useRef<string | null>(null);
  const [bundle, setBundle] = useState<unknown>();
  const jobs = useQuery({
    queryKey: ["anchors", user.id],
    queryFn: trustApi.anchors,
  });
  const status = useQuery({
    queryKey: ["anchor-provider", user.id],
    queryFn: trustApi.status,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["anchors"] });
  const create = useMutation({
    mutationFn: () =>
      trustApi.requestAnchor((key.current ??= crypto.randomUUID())),
    onSuccess: async () => {
      key.current = null;
      await refresh();
    },
  });
  const retry = useMutation({
    mutationFn: trustApi.retryAnchor,
    onSuccess: refresh,
  });
  const verify = useMutation({ mutationFn: trustApi.verifyAnchor });
  const errorText = (error: unknown) =>
    td(`errors.${(error as { code?: string })?.code ?? "UNKNOWN"}`, {
      defaultValue: td("errors.UNKNOWN"),
    });
  const failure = (error: unknown) => message.error(errorText(error));
  const exportBundle = async (id: string) => {
    try {
      downloadBlob(
        new Blob([JSON.stringify(await trustApi.bundle(id), null, 2)], {
          type: "application/json",
        }),
        `audit-anchor-${id}.json`,
      );
    } catch (error) {
      void failure(error);
    }
  };
  const tone = (name: keyof typeof STAT_TONE) => ({
    backgroundColor: STAT_TONE[name].bg,
    valueColor: STAT_TONE[name].value,
  });
  const latest = (jobs.data ?? []).reduce<AnchorJob | undefined>(
    (best, job) =>
      !best || job.payload.sequence > best.payload.sequence ? job : best,
    undefined,
  );
  return (
    <Card
      title={bare ? undefined : t("anchors.title")}
      variant={bare ? "borderless" : "outlined"}
      styles={bare ? { body: { padding: 0 } } : undefined}
      style={bare ? { background: "transparent" } : undefined}
      data-testid="anchor-panel"
    >
      {status.data ? (
        <>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            title={
              status.data.timestampAuthority
                ? t("anchors.tsaNotice", {
                    tsa: status.data.timestampAuthority,
                  })
                : t("anchors.localNotice")
            }
          />
        </>
      ) : null}
      <StatisticsCard
        hideCard
        statShadow={false}
        rowGutter={10}
        containerStyle={{ marginBottom: 12 }}
        data={[
          {
            key: "total",
            title: t("anchors.stats.total"),
            value: (jobs.data ?? []).length,
            ...tone("blue"),
          },
          {
            key: "confirmed",
            title: t("anchors.stats.confirmed"),
            value: (jobs.data ?? []).filter((j) => j.status === "CONFIRMED")
              .length,
            ...tone("green"),
          },
          {
            key: "failed",
            title: t("anchors.stats.failed"),
            value: (jobs.data ?? []).filter((j) => j.status === "FAILED")
              .length,
            ...tone("red"),
          },
          {
            key: "latest",
            title: t("anchors.stats.latest"),
            value: latest ? `#${latest.payload.sequence}` : "—",
            ...tone("violet"),
          },
        ]}
      />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <Space wrap>
          {hasPermission("anchors:write") ? (
            <Button
              type="primary"
              loading={create.isPending}
              onClick={() => create.mutate()}
              data-testid="anchor-create"
            >
              {t("anchors.create")}
            </Button>
          ) : null}
          <Tooltip title={t("refresh")}>
            <Button
              icon={<ReloadOutlined />}
              aria-label={t("refresh")}
              onClick={() => void refresh()}
              data-testid="anchor-refresh"
            />
          </Tooltip>
        </Space>
        {status.data ? (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {t("anchors.key")}:{" "}
            <Typography.Text
              code
              copyable={{ text: status.data.witnessKeyFingerprint }}
            >
              {status.data.witnessKeyFingerprint.slice(0, 16)}…
            </Typography.Text>
          </Typography.Text>
        ) : null}
      </div>
      {[create.error, retry.error, verify.error, jobs.error]
        .filter(Boolean)
        .map((error, index) => (
          <Alert
            key={index}
            type="error"
            title={errorText(error)}
            style={{ marginBottom: 12 }}
          />
        ))}
      {verify.data ? (
        <Alert
          type={verify.data.result === "MATCH" ? "success" : "error"}
          showIcon
          title={t(`anchors.${verify.data.result}`)}
          description={
            <>
              {t(
                verify.data.snapshotMatched
                  ? "anchors.snapshotSame"
                  : "anchors.snapshotChanged",
              )}
              {verify.data.timestamp ? (
                <div data-testid="anchor-timestamp-result">
                  {verify.data.timestamp.valid
                    ? t(
                        verify.data.timestamp.trusted
                          ? "anchors.timestampTrusted"
                          : "anchors.timestampUntrusted",
                        {
                          at: formatDateTime(verify.data.timestamp.genTime!),
                          signer: verify.data.timestamp.signer,
                        },
                      )
                    : t("anchors.timestampInvalid")}
                </div>
              ) : null}
            </>
          }
          style={{ marginBottom: 16 }}
          data-testid="anchor-result"
        />
      ) : null}
      <Table<AnchorJob>
        size="small"
        rowKey="id"
        loading={jobs.isFetching}
        dataSource={jobs.data ?? []}
        pagination={{ pageSize: 5, hideOnSinglePage: true }}
        scroll={{ x: 900 }}
        locale={{ emptyText: t("anchors.empty") }}
        columns={[
          {
            title: t("anchors.createdAt"),
            render: (_, row) => formatDateTime(row.payload.createdAt),
          },
          {
            title: t("anchors.sequence"),
            render: (_, row) => row.payload.sequence,
          },
          {
            title: t("anchors.hash"),
            render: (_, row) => (
              <Typography.Text
                code
                copyable
                style={{ overflowWrap: "anywhere" }}
              >
                {row.payload.headHash.slice(0, 16)}…
              </Typography.Text>
            ),
          },
          {
            title: t("anchors.timestamp"),
            render: (_, row) =>
              row.timestamp ? (
                <Tooltip
                  title={t("anchors.timestampBy", {
                    signer: row.timestamp.signer,
                  })}
                >
                  <Tag color="success">
                    {formatDateTime(row.timestamp.genTime)}
                  </Tag>
                </Tooltip>
              ) : (
                "—"
              ),
          },
          {
            title: t("anchors.status"),
            render: (_, row) => (
              <Tag
                color={
                  row.status === "CONFIRMED"
                    ? "success"
                    : row.status === "FAILED"
                      ? "error"
                      : "processing"
                }
              >
                {t(`anchors.states.${row.status}`)}
              </Tag>
            ),
          },
          {
            title: t("actions"),
            render: (_, row) => (
              <Space>
                {row.status === "CONFIRMED" ? (
                  <Button
                    size="small"
                    onClick={() => void exportBundle(row.id)}
                  >
                    {t("anchors.export")}
                  </Button>
                ) : hasPermission("anchors:write") ? (
                  <Button
                    size="small"
                    loading={retry.isPending}
                    onClick={() => retry.mutate(row.id)}
                  >
                    {t("anchors.retry")}
                  </Button>
                ) : null}
              </Space>
            ),
          },
        ]}
      />
      <section
        style={{
          marginTop: 20,
          paddingTop: 16,
          borderTop: "1px solid var(--color-border)",
        }}
        data-testid="anchor-verify-section"
      >
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          {t("anchors.verifyTitle")}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          {t("anchors.verifyHint")}
        </Typography.Paragraph>
        {/* Checking a saved bundle is its own two-step task: choose the file, then verify it. */}
        <Space wrap>
          <Upload
            maxCount={1}
            accept=".json"
            beforeUpload={async (file) => {
              if (file.size > 1024 * 1024) {
                message.error(t("anchors.invalidBundle"));
                return Upload.LIST_IGNORE;
              }
              try {
                setBundle(JSON.parse(await file.text()));
                verify.reset();
              } catch {
                message.error(t("anchors.invalidBundle"));
                return Upload.LIST_IGNORE;
              }
              return false;
            }}
            onRemove={() => {
              setBundle(undefined);
              verify.reset();
            }}
          >
            <Button>{t("anchors.chooseBundle")}</Button>
          </Upload>
          <Button
            disabled={!bundle}
            loading={verify.isPending}
            onClick={() => verify.mutate(bundle)}
            data-testid="anchor-verify"
          >
            {t("anchors.verify")}
          </Button>
        </Space>
      </section>
    </Card>
  );
}
