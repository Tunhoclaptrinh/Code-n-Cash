import type { ReactNode } from "react";
import { Button, Dropdown, Space, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { MenuOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

/** Compact table actions, matching UniFlow; toolbar and form actions keep visible text. */
export function TableRowActions({
  primary,
  menu,
  moreLabel,
}: {
  primary: { label: string; icon: ReactNode; onClick: () => void };
  menu?: MenuProps["items"];
  moreLabel?: string;
}) {
  const { t } = useTranslation("common");
  const more = moreLabel || t("tableActions.more");
  return (
    <Space
      size={4}
      wrap={false}
      style={{ whiteSpace: "nowrap" }}
      data-testid="table-row-actions"
    >
      <Tooltip title={primary.label} trigger={["hover", "focus"]}>
        <Button
          size="small"
          type="text"
          icon={primary.icon}
          aria-label={primary.label}
          onClick={primary.onClick}
          data-testid="table-row-primary"
        />
      </Tooltip>
      {menu?.length ? (
        <Dropdown
          menu={{ items: menu }}
          trigger={["click"]}
          placement="bottomRight"
        >
          <Button
            size="small"
            type="text"
            icon={<MenuOutlined />}
            aria-label={more}
            title={more}
            data-testid="table-row-more"
          />
        </Dropdown>
      ) : null}
    </Space>
  );
}
