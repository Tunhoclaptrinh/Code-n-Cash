import { Button, Form, Tooltip } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

import { emptyInputPatch } from "../lib/form-input";
export {
  emptyInputPatch,
  isEmptyInput,
  fillEmptyInputs,
} from "../lib/form-input";

export function DemoFillButton({
  onClick,
  disabled,
  children,
  testId,
}: {
  onClick: () => void;
  disabled?: boolean;
  children?: ReactNode;
  testId?: string;
}) {
  const { t } = useTranslation("common");
  return (
    <Tooltip title={t("demoFill.hint")}>
      <Button
        size="small"
        type="link"
        icon={<ThunderboltOutlined />}
        disabled={disabled}
        onClick={onClick}
        data-testid={testId ?? "demo-fill"}
      >
        {children ?? t("demoFill.all")}
      </Button>
    </Tooltip>
  );
}

/** FormModal extension through its render props; the shared base stays unchanged. */
export function DemoFormFill({
  values,
  disabled,
}: {
  values:
    | Record<string, unknown>
    | ((current: Record<string, unknown>) => Record<string, unknown>);
  disabled?: boolean;
}) {
  const form = Form.useFormInstance();
  return (
    <DemoFillButton
      disabled={disabled}
      onClick={() => {
        const all =
          typeof values === "function"
            ? values(form.getFieldsValue(true))
            : values;
        form.setFieldsValue(emptyInputPatch(form.getFieldsValue(true), all));
      }}
    />
  );
}
