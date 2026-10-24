import type { ThemeConfig } from "antd";

/** App actions follow the 32px UniFlow toolbar; form fields keep their existing density. */
export const actionTheme: ThemeConfig = {
  components: {
    Button: {
      controlHeight: 32,
      controlHeightSM: 32,
      contentFontSize: 13,
      contentFontSizeSM: 13,
      paddingInline: 12,
      paddingInlineSM: 12,
      borderRadius: 6,
      borderRadiusSM: 6,
    },
  },
};
