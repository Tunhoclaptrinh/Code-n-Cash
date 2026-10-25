import { useState, type ReactNode } from "react";
import { Button, Drawer, Grid } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { ContractPreviewPane } from "./ContractPreviewPane";
import { Panel } from "./Panel";
import { WorkflowContext } from "./WorkflowContext";
import styles from "./ContractSideLayout.module.css";

/**
 * A workflow screen with the contract document beside it: on wide screens the document on the
 * left (kept in view while scrolling) and the information and actions on the right; a "View
 * contract" drawer on narrow ones.
 */
export function ContractSideLayout({
  contractId,
  context,
  children,
}: {
  contractId: string;
  /** One line naming the contract, shown above both columns so their tops line up. */
  context?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation("common");
  const wide = Grid.useBreakpoint().xl;
  const [open, setOpen] = useState(false);
  const pane = <ContractPreviewPane contractId={contractId} />;
  const contextLine = context ? (
    <WorkflowContext>{context}</WorkflowContext>
  ) : null;
  if (wide)
    return (
      <>
        {contextLine}
        <div data-testid="contract-side-layout" className={styles.columns}>
          <aside>
            <Panel as="div" className={styles.aside}>
              {pane}
            </Panel>
          </aside>
          <div className={styles.main}>{children}</div>
        </div>
      </>
    );
  return (
    <>
      {contextLine}
      <Button
        icon={<FileTextOutlined />}
        onClick={() => setOpen(true)}
        style={{ marginBottom: 12 }}
        data-testid="open-contract-preview"
      >
        {t("contractPane.open")}
      </Button>
      {children}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        size="large"
        title={t("contractPane.title")}
        destroyOnHidden
      >
        {pane}
      </Drawer>
    </>
  );
}
