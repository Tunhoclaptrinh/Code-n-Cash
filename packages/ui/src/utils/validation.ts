import { uiText } from "../i18n";
export const validationRules = {
  required: (message = uiText("sf2a3332bb6")) => ({
    required: true,
    message,
  }),
  email: (message = uiText("s243a066c7f")) => ({
    type: "email" as const,
    message,
  }),
  phoneVN: (message = uiText("sbc0605d293")) => ({
    pattern: /^(0|\+84)(3[2-9]|5[6|8|9]|7[0|6-9]|8[1-5]|9[0-4|6-9])[0-9]{7}$/,
    message,
  }),
  skuCode: (message = uiText("sac079decb6")) => ({
    pattern: /^[A-Z0-9_-]+$/,
    message,
  }),
  url: (message = uiText("sd1aba635e5")) => ({
    type: "url" as const,
    message,
  }),
  min: (minVal: number, message?: string) => ({
    min: minVal,
    message: message || uiText("s7a0e18a8dc", { v0: minVal }),
  }),
  max: (maxVal: number, message?: string) => ({
    max: maxVal,
    message: message || uiText("s4dec5b14d9", { v0: maxVal }),
  }),
};
