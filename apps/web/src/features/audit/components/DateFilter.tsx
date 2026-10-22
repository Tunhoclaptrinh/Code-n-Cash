import { DatePicker, Space, Typography } from "antd";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";

interface DateFilterProps {
  id: string;
  label: string;
  /** `yyyy-mm-dd`, empty for no bound. */
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}

export function DateFilter({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: DateFilterProps) {
  const { i18n } = useTranslation();
  return (
    <Space size={8}>
      <Typography.Text>
        <label htmlFor={id}>{label}</label>
      </Typography.Text>
      <DatePicker
        id={id}
        value={value ? dayjs(value) : null}
        minDate={min ? dayjs(min) : undefined}
        maxDate={max ? dayjs(max) : undefined}
        format={i18n.language.startsWith("vi") ? "DD/MM/YYYY" : "MM/DD/YYYY"}
        onChange={(date) => onChange(date?.format("YYYY-MM-DD") ?? "")}
      />
    </Space>
  );
}
