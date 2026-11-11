import type { ReactNode } from "react";
import { Button, Dropdown, Space } from "antd";
import type { ButtonProps } from "antd";
import { MenuOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

export interface BarAction {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  /** Stays a visible button when the bar folds; the main actions of a screen are pinned. */
  pinned?: boolean;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
  /** Look of the visible button (type, color, variant). */
  button?: Pick<ButtonProps, "type" | "color" | "variant">;
  testId?: string;
}

/**
 * A row of actions. From `foldFrom` actions on, only the pinned ones stay as buttons and the
 * rest move into a menu behind a ☰ button (the same icon as the table row menu), so a toolbar
 * shows what matters and keeps the rest one click away.
 */
export function ActionBar({
  actions,
  foldFrom = 3,
  moreLabel,
  testId,
}: {
  actions: BarAction[];
  foldFrom?: number;
  moreLabel?: string;
  testId?: string;
}) {
  const { t } = useTranslation("common");
  const fold = actions.length >= foldFrom;
  const shown = fold ? actions.filter((action) => action.pinned) : actions;
  const folded = fold ? actions.filter((action) => !action.pinned) : [];
  const more = moreLabel || t("tableActions.more");
  if (!actions.length) return null;
  return (
    <Space wrap size={8} data-testid={testId}>
      {folded.length ? (
        <Dropdown
          trigger={["click"]}
          placement="bottomRight"
          menu={{
            items: folded.map((action) => ({
              key: action.key,
              icon: action.icon,
              danger: action.danger,
              disabled: action.disabled || action.loading,
              label: <span data-testid={action.testId}>{action.label}</span>,
              onClick: action.onClick,
            })),
          }}
        >
          <Button
            icon={<MenuOutlined />}
            aria-label={more}
            title={more}
            data-testid={testId ? `${testId}-more` : "action-bar-more"}
          />
        </Dropdown>
      ) : null}
      {shown.map((action) => (
        <Button
          key={action.key}
          icon={action.icon}
          danger={action.danger}
          disabled={action.disabled}
          loading={action.loading}
          onClick={action.onClick}
          data-testid={action.testId}
          {...action.button}
        >
          {action.label}
        </Button>
      ))}
    </Space>
  );
}
