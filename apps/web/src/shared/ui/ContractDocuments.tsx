import { DownloadOutlined } from "@ant-design/icons";
import { downloadBlob } from "@codecash/ui";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, Button, Select, Space, Spin } from "antd";
import { useTranslation } from "react-i18next";
import type { Entity } from "@codecash/contracts";
import { platform } from "../api/platform";
import { useCurrentUser } from "../auth/session";
import { DocumentPreview } from "./DocumentPreview";
export function ContractDocuments({ contractId }: { contractId: string }) {
  const { t } = useTranslation("contracts");
  const user = useCurrentUser();
  const [selected, setSelected] = useState<string>();
  const query = useQuery({
    queryKey: ["resource", "documents", user.id, contractId],
    queryFn: () =>
      platform.get<Entity[]>(
        `/contract-files/${encodeURIComponent(contractId)}`,
      ),
  });
  const files = query.data ?? [];
  const file = files.find((file) => file.id === selected) ?? files[0];
  const original = useMutation({
    mutationFn: async () => {
      if (file)
        downloadBlob(
          await platform.download(
            `/contract-files/${encodeURIComponent(contractId)}/${encodeURIComponent(file.id)}/download`,
          ),
          String(file.name),
        );
    },
  });
  if (query.isPending) return <Spin />;
  if (query.isError)
    return (
      <Alert type="warning" title={t("contractUpload.preview.unavailable")} />
    );
  if (!file)
    return (
      <Alert type="info" title={t("contractUpload.preview.noStoredFile")} />
    );
  return (
    <Space orientation="vertical" style={{ width: "100%" }}>
      <Select
        style={{ width: "100%" }}
        value={file.id}
        onChange={setSelected}
        options={files.map((file) => ({
          value: file.id,
          label: String(file.name),
        }))}
      />
      <Button
        icon={<DownloadOutlined />}
        loading={original.isPending}
        onClick={() => original.mutate()}
      >
        {t("contractUpload.preview.downloadOriginal")}
      </Button>
      {original.isError ? (
        <Alert type="error" title={t("contractUpload.preview.unavailable")} />
      ) : null}
      <DocumentPreview
        documentId={file.id}
        previewPath={`/contract-files/${encodeURIComponent(contractId)}/${encodeURIComponent(file.id)}/preview`}
        name={String(file.name)}
      />
    </Space>
  );
}
