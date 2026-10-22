import { uiText } from "../../i18n";
import React from "react";
import { Spin } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { LoadingStateProps } from "./types";
export const LoadingState: React.FC<LoadingStateProps> = ({
  tip = uiText("sde68491680"),
  size = "default",
  minHeight = 200,
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        minHeight,
        width: "100%",
        gap: 12,
        padding: "32px 0",
      }}
    >
      <Spin
        size={size}
        indicator={
          <LoadingOutlined
            style={{
              fontSize: size === "large" ? 36 : size === "small" ? 18 : 24,
              color: "#315bea",
            }}
            spin
          />
        }
      />
      {tip && (
        <span style={{ color: "#6B7280", fontSize: 13, fontWeight: 500 }}>
          {tip}
        </span>
      )}
    </div>
  );
};
export default LoadingState;
