import { Space, Tooltip } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import styles from "./ContractUploadForm.module.css";

/** Label followed by an info icon whose tooltip opens on hover and keyboard focus. */
export function HelpLabel({ label, hint }: { label: string; hint: string }) {
  return (
    <Space size={6}>
      {label}
      <Tooltip title={hint} trigger={["hover", "focus"]}>
        <InfoCircleOutlined
          tabIndex={0}
          aria-label={hint}
          className={styles.helpIcon}
        />
      </Tooltip>
    </Space>
  );
}
