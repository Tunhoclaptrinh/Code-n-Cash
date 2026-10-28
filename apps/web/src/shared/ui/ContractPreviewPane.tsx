import { useRef } from "react";
import styles from "./ContractPreviewPane.module.css";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, Button, Space, Spin, Tag, Tooltip, Typography } from "antd";
import { DownloadOutlined, EditOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { downloadBlob } from "@codecash/ui";
import type { SignMethod, SignStepStatus, Side } from "@codecash/contracts";
import { platform } from "../api/platform";
import { useCurrentUser } from "../auth/session";
import { formatDateTime } from "../lib/format";
import { PendingSignatureSlot, SignedMark } from "./DemoSignatureMarks";
import { PdfPageImage } from "./PdfPageImage";

/** Response of GET /contract-files/:code/view. */
interface ContractView {
  document: { id: string; name: string; simulated: boolean };
  pages: Array<{ pageNo: number; width: number; height: number }>;
  marks: Array<{
    stepNo: number;
    party: Side;
    signerName: string;
    organizationName: string;
    status: SignStepStatus;
    signedAt: string | null;
    method: SignMethod | null;
    page: number;
    x: number;
    y: number;
    w: number;
    h: number;
  }>;
}

const percent = (value: number, of: number) => `${(value / of) * 100}%`;

/**
 * The contract document beside an action: every page as an image, with demo signatures and seals
 * drawn over the signing areas by signing state. Drawing never changes the stored file.
 */
export function ContractPreviewPane({ contractId }: { contractId: string }) {
  const { t } = useTranslation("common");
  const { t: ts } = useTranslation("signing");
  const user = useCurrentUser();
  const pagesRef = useRef<HTMLDivElement>(null);
  const view = useQuery({
    queryKey: ["contract-view", user.id, contractId],
    queryFn: () =>
      platform.get<ContractView>(
        `/contract-files/${encodeURIComponent(contractId)}/view`,
      ),
  });
  const download = useMutation({
    mutationFn: async (document: ContractView["document"]) =>
      downloadBlob(
        await platform.download(
          `/contract-files/${encodeURIComponent(contractId)}/${encodeURIComponent(document.id)}/download`,
        ),
        document.name,
      ),
  });
  const data = view.data;
  const signingPage = data?.marks[0]?.page;
  const caption = (mark: ContractView["marks"][number]) =>
    mark.method === "IMAGE"
      ? t("contractPane.imageCaption", {
          at: mark.signedAt ? formatDateTime(mark.signedAt) : "",
        })
      : t("contractPane.signedCaption", {
          method: mark.method ? ts(`method.${mark.method}.name`) : "",
          at: mark.signedAt ? formatDateTime(mark.signedAt) : "",
        });

  return (
    <section data-testid="contract-preview-pane">
      <div className={styles.header}>
        <Space size={6} wrap>
          <Typography.Text strong>{t("contractPane.title")}</Typography.Text>
          {data?.document.simulated ? (
            <Tooltip title={t("contractPane.simulatedHint")}>
              <Tag color="gold" style={{ margin: 0 }}>
                {t("contractPane.simulated")}
              </Tag>
            </Tooltip>
          ) : null}
        </Space>
        {data ? (
          <Space size={4} wrap className={styles.actions}>
            {signingPage ? (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() =>
                  pagesRef.current
                    ?.querySelector(`[data-page="${signingPage}"]`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                {t("contractPane.toSignatures")}
              </Button>
            ) : null}
            <Button
              size="small"
              icon={<DownloadOutlined />}
              loading={download.isPending}
              onClick={() => download.mutate(data.document)}
            >
              {t("contractPane.download")}
            </Button>
          </Space>
        ) : null}
      </div>
      {view.isPending ? (
        <Spin tip={t("contractPane.loading")}>
          <div style={{ height: 240 }} />
        </Spin>
      ) : null}
      {view.isError || download.isError ? (
        <Alert
          type="warning"
          showIcon
          title={t("contractPane.unavailable")}
          style={{ marginTop: 12 }}
        />
      ) : null}
      {data ? (
        <div ref={pagesRef} style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {data.pages.map((page) => (
            <div
              key={page.pageNo}
              data-page={page.pageNo}
              style={{
                position: "relative",
                aspectRatio: `${page.width} / ${page.height}`,
                background: "white",
                border: "1px solid var(--border-subtle)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <PdfPageImage
                contractId={contractId}
                documentId={data.document.id}
                page={page.pageNo}
              />
              {data.marks
                .filter((mark) => mark.page === page.pageNo)
                .map((mark) => (
                  <div key={mark.stepNo} data-testid="contract-preview-mark">
                    {mark.status === "SIGNED" ? (
                      <SignedMark
                        box={mark}
                        pageWidth={page.width}
                        pageHeight={page.height}
                        name={mark.signerName}
                        caption={caption(mark)}
                        organization={mark.organizationName}
                        sealLabel={t("contractPane.seal")}
                      />
                    ) : (
                      <div
                        style={{
                          position: "absolute",
                          zIndex: 4,
                          left: percent(mark.x, page.width),
                          top: percent(mark.y, page.height),
                          width: percent(mark.w, page.width),
                          height: percent(mark.h, page.height),
                        }}
                      >
                        <PendingSignatureSlot
                          active={mark.status === "CURRENT"}
                          label={t(
                            mark.status === "CURRENT"
                              ? "contractPane.current"
                              : "contractPane.waiting",
                            { step: mark.stepNo, name: mark.signerName },
                          )}
                        />
                      </div>
                    )}
                  </div>
                ))}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
