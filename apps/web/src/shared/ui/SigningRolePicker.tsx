import { Button, Select, Space } from "antd";
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  DeleteOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
const roles = [
  "CONTRACT_OWNER",
  "FINANCE_APPROVER",
  "SECONDARY_APPROVER",
  "LEGAL_REVIEWER",
  "SUPPLIER",
];
export function SigningRolePicker({
  value = "",
  onChange,
  id,
}: {
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const { t } = useTranslation("contracts");
  const { t: tc } = useTranslation("common");
  const selected = value ? value.split(";") : [];
  const update = (next: string[]) => onChange?.(next.join(";"));
  const move = (index: number, offset: number) => {
    const next = [...selected];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    update(next);
  };
  return (
    <Space id={id} orientation="vertical" style={{ width: "100%" }}>
      {selected.map((role, index) => (
        <Space wrap key={index}>
          <span>{index + 1}.</span>
          <Select
            value={role}
            style={{ width: 220 }}
            options={roles.map((value) => ({
              value,
              label: tc(`roles.${value}.name`),
            }))}
            onChange={(role) =>
              update(
                selected.map((value, position) =>
                  position === index ? role : value,
                ),
              )
            }
          />
          <Button
            size="small"
            icon={<ArrowUpOutlined />}
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            {t("contractUpload.form.signers.up")}
          </Button>
          <Button
            size="small"
            icon={<ArrowDownOutlined />}
            disabled={index === selected.length - 1}
            onClick={() => move(index, 1)}
          >
            {t("contractUpload.form.signers.down")}
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() =>
              update(selected.filter((_, position) => position !== index))
            }
          >
            {t("contractUpload.form.signers.remove")}
          </Button>
        </Space>
      ))}
      <Button
        type="dashed"
        icon={<PlusOutlined />}
        disabled={selected.length >= 4}
        onClick={() =>
          update([...selected, selected.length ? "SUPPLIER" : "CONTRACT_OWNER"])
        }
      >
        {t("contractUpload.form.signers.add")}
      </Button>
    </Space>
  );
}
