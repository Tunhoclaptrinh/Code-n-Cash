import React from "react";
import { TabSwitcherProps } from "./types";
export const TabSwitcher: React.FC<TabSwitcherProps> = ({
  children,
  style,
  className,
}) => {
  return (
    <div
      className={`tab-switcher-container ${className || ""}`}
      style={{
        marginBottom: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
export default TabSwitcher;
