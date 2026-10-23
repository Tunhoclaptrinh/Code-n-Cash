import { uiText } from "../../i18n";
import React, { useState, useEffect } from "react";
import { Input, InputProps } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useDebounce } from "../../hooks/useDebounce";
export interface SearchInputProps extends Omit<InputProps, "onChange"> {
  onSearchChange?: (value: string) => void;
  debounceMs?: number;
}
export const SearchInput: React.FC<SearchInputProps> = ({
  placeholder = uiText("search.placeholder"),
  onSearchChange,
  debounceMs = 300,
  value,
  style,
  ...rest
}) => {
  const [innerValue, setInnerValue] = useState<string>(String(value || ""));
  const debouncedValue = useDebounce(innerValue, debounceMs);
  useEffect(() => {
    if (value !== undefined) {
      setInnerValue(String(value));
    }
  }, [value]);
  useEffect(() => {
    if (onSearchChange) {
      onSearchChange(debouncedValue);
    }
  }, [debouncedValue, onSearchChange]);
  return (
    <Input
      prefix={<SearchOutlined style={{ color: "#9CA3AF" }} />}
      allowClear
      placeholder={placeholder}
      value={innerValue}
      onChange={(e) => setInnerValue(e.target.value)}
      style={{
        width: 240,
        borderRadius: 8,
        ...style,
      }}
      {...rest}
    />
  );
};
