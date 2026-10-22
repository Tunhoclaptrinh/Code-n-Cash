/** Ant Design adapters preserve existing native event contracts during the migration. */
import {
  Children,
  isValidElement,
  type ReactElement,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type ButtonHTMLAttributes,
  type TextareaHTMLAttributes,
  type Ref,
  type FormHTMLAttributes,
} from "react";
import { Button, Input, Select, Checkbox, Radio, Form } from "antd";
import type { InputProps } from "antd";
export function UiButton({
  type,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button {...(props as any)} htmlType={type ?? "button"}>
      {children}
    </Button>
  );
}
export function UiInput(
  props: InputHTMLAttributes<HTMLInputElement> & {
    ref?: Ref<HTMLInputElement>;
  },
) {
  const { type, onChange, checked, ref, ...rest } = props;
  if (type === "checkbox")
    return (
      <Checkbox
        {...(rest as any)}
        checked={checked}
        onChange={onChange as any}
      />
    );
  if (type === "radio")
    return (
      <Radio {...(rest as any)} checked={checked} onChange={onChange as any} />
    );
  if (type === "password")
    return <Input.Password {...(rest as InputProps)} onChange={onChange} />;
  return (
    <Input
      {...(rest as InputProps)}
      ref={(instance) => {
        const element = instance?.input ?? null;
        if (typeof ref === "function") ref(element);
        else if (ref) ref.current = element;
      }}
      type={type}
      onChange={onChange}
    />
  );
}
export function UiTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <Input.TextArea {...(props as any)} />;
}
export function UiSelect({
  children,
  onChange,
  value,
  defaultValue,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = Children.toArray(children)
    .filter(isValidElement)
    .map((child: ReactElement<any>) => ({
      value: child.props.value ?? child.props.children,
      label: child.props.children,
      disabled: child.props.disabled,
    }));
  return (
    <Select
      {...(rest as any)}
      value={value}
      defaultValue={defaultValue}
      options={options}
      onChange={(next) =>
        onChange?.({
          target: { value: next },
          currentTarget: { value: next },
        } as any)
      }
    />
  );
}
export function UiForm({
  onSubmit,
  children,
  ...props
}: FormHTMLAttributes<HTMLFormElement>) {
  return (
    <Form
      {...(props as any)}
      onFinish={() =>
        onSubmit?.({ preventDefault() {}, currentTarget: null } as any)
      }
    >
      {children}
    </Form>
  );
}
