import type { ReactNode } from "react";
import { Button, Dropdown, Space, Tooltip } from "antd";
import type { ButtonProps, MenuProps } from "antd";
import { MenuOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

/**
 * Meaning of a row action, shown by its colour:
 * - `primary`: the row's main step (open, edit, continue);
 * - `success`: approve, confirm, sign;
 * - `warning`: a step that raises or resolves a problem (dispute, exception);
 * - `danger`: delete, cancel, reject (menu items use `danger: true`);
 * - `neutral`: read-only (view, details).
 */
export type ActionTone =
  "primary" | "success" | "warning" | "danger" | "neutral";

export const ACTION_TONE_COLOR: Record<ActionTone, ButtonProps["color"]> = {
  primary: "primary",
  success: "green",
  warning: "orange",
  danger: "danger",
  neutral: "default",
};

/** Compact table actions, matching UniFlow; toolbar and form actions keep visible text. */
export function TableRowActions({
  primary,
  menu,
  moreLabel,
}: {
  primary: {
    label: string;
    icon: ReactNode;
    onClick: () => void;
    /** Defaults to `primary`; read-only actions pass `neutral`. */
    tone?: ActionTone;
  };
  menu?: MenuProps["items"];
  moreLabel?: string;
}) {
  const { t } = useTranslation("common");
  const more = moreLabel || t("tableActions.more");
  const tone = primary.tone ?? "primary";
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
          color={ACTION_TONE_COLOR[tone]}
          variant="text"
          icon={primary.icon}
          aria-label={primary.label}
          onClick={primary.onClick}
          data-testid="table-row-primary"
          data-tone={tone}
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
