import { Button, Select } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { SignerOrderActions } from "./SignerOrderActions";
import styles from "./SigningRolePicker.module.css";
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
  const { t: tp } = useTranslation("platform");
  const selected = value ? value.split(";") : [];
  const update = (next: string[]) => onChange?.(next.join(";"));
  const move = (index: number, offset: number) => {
    const next = [...selected];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    update(next);
  };
  return (
    <div id={id} className={styles.list}>
      {selected.map((role, index) => (
        <div className={styles.row} key={index}>
          <span className={styles.index}>{index + 1}</span>
          <Select
            value={role}
            style={{ width: "100%" }}
            aria-label={`${tp("fields.signerRoles")} ${index + 1}`}
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
          <SignerOrderActions
            first={index === 0}
            last={index === selected.length - 1}
            onUp={() => move(index, -1)}
            onDown={() => move(index, 1)}
            onRemove={() =>
              update(selected.filter((_, position) => position !== index))
            }
          />
        </div>
      ))}
      <Button
        type="dashed"
        size="small"
        className={styles.add}
        icon={<PlusOutlined />}
        disabled={selected.length >= 4}
        onClick={() =>
          update([...selected, selected.length ? "SUPPLIER" : "CONTRACT_OWNER"])
        }
      >
        {t("contractUpload.form.signers.add")}
      </Button>
    </div>
  );
}
