import { uiText } from "../i18n";
export const validationRules = {
  required: (message = uiText("validation.required")) => ({
    required: true,
    message,
  }),
  email: (message = uiText("validation.email")) => ({
    type: "email" as const,
    message,
  }),
  phoneVN: (message = uiText("validation.phone")) => ({
    pattern: /^(0|\+84)(3[2-9]|5[6|8|9]|7[0|6-9]|8[1-5]|9[0-4|6-9])[0-9]{7}$/,
    message,
  }),
  skuCode: (message = uiText("validation.code")) => ({
    pattern: /^[A-Z0-9_-]+$/,
    message,
  }),
  url: (message = uiText("validation.url")) => ({
    type: "url" as const,
    message,
  }),
  min: (minVal: number, message?: string) => ({
    min: minVal,
    message: message || uiText("validation.minLength", { count: minVal }),
  }),
  max: (maxVal: number, message?: string) => ({
    max: maxVal,
    message: message || uiText("validation.maxLength", { count: maxVal }),
  }),
};
