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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { downloadBlob, useAccess } from "@codecash/ui";
import type { AnchorJob } from "@codecash/contracts";
import { trustApi } from "@/shared/api/trust";
import { useCurrentUser } from "@/shared/auth/session";
import { formatDateTime } from "@/shared/lib/format";

export function AnchorPanel() {
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
  return (
    <Card title={t("anchors.title")} data-testid="anchor-panel">
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
          <Typography.Paragraph>
            {t("anchors.key")}:{" "}
            <Typography.Text code copyable style={{ overflowWrap: "anywhere" }}>
              {status.data.witnessKeyFingerprint}
            </Typography.Text>
          </Typography.Paragraph>
        </>
      ) : null}
      <Space wrap style={{ marginBottom: 16 }}>
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
        <Button onClick={() => void refresh()}>{t("refresh")}</Button>
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
        pagination={{ pageSize: 5 }}
        scroll={{ x: 900 }}
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
    </Card>
  );
}
