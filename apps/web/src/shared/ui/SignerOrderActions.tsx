import { Button, Space, Tooltip } from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";

/** The same direct controls in contract drafts and the administrator's template editor. */
export function SignerOrderActions({
  className,
  first,
  last,
  onUp,
  onDown,
  onRemove,
}: {
  className?: string;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation("contracts");
  return (
    <Space className={className} size={0} wrap={false}>
      <Tooltip
        title={t("contractUpload.form.signers.up")}
        trigger={["hover", "focus"]}
      >
        <span>
          <Button
            type="text"
            size="small"
            icon={<ArrowUpOutlined />}
            aria-label={t("contractUpload.form.signers.up")}
            disabled={first}
            onClick={onUp}
            data-testid="signer-up"
          />
        </span>
      </Tooltip>
      <Tooltip
        title={t("contractUpload.form.signers.down")}
        trigger={["hover", "focus"]}
      >
        <span>
          <Button
            type="text"
            size="small"
            icon={<ArrowDownOutlined />}
            aria-label={t("contractUpload.form.signers.down")}
            disabled={last}
            onClick={onDown}
            data-testid="signer-down"
          />
        </span>
      </Tooltip>
      <Tooltip
        title={t("contractUpload.form.signers.remove")}
        trigger={["hover", "focus"]}
      >
        <Button
          type="link"
          danger
          size="small"
          icon={<DeleteOutlined />}
          aria-label={t("contractUpload.form.signers.remove")}
          onClick={onRemove}
          data-testid="signer-remove"
        />
      </Tooltip>
    </Space>
  );
}
