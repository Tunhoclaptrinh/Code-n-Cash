import { useState, type ReactNode } from "react";
import { Button, Drawer, Grid } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { ContractPreviewPane } from "./ContractPreviewPane";
import { Panel } from "./Panel";
import { SplitView } from "./SplitView";
import { WorkflowContext } from "./WorkflowContext";
import styles from "./ContractSideLayout.module.css";

/**
 * A workflow screen with the contract document beside it: on wide screens the document on the
 * left (kept in view while scrolling) and the information and actions on the right, split by a
 * bar that resizes or collapses the document; a "View contract" drawer on narrow ones.
 */
export function ContractSideLayout({
  contractId,
  context,
  nav,
  children,
}: {
  contractId: string;
  /** One line naming the contract, shown above both columns so their tops line up. */
  context?: ReactNode;
  /** Navigation between the screens that handle the same record, below the context line. */
  nav?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation("common");
  const wide = Grid.useBreakpoint().xl;
  const [open, setOpen] = useState(false);
  const pane = <ContractPreviewPane contractId={contractId} />;
  const contextLine = (
    <>
      {context ? <WorkflowContext>{context}</WorkflowContext> : null}
      {nav}
    </>
  );
  // One tree at every width: only the document column's content changes, so the information and
  // actions on the right (often a form) never remount when the window crosses the breakpoint.
  return (
    <>
      {contextLine}
      {wide ? null : (
        <Button
          icon={<FileTextOutlined />}
          onClick={() => setOpen(true)}
          style={{ marginBottom: 12 }}
          data-testid="open-contract-preview"
        >
          {t("contractPane.open")}
        </Button>
      )}
      <SplitView
        testId="contract-side-layout"
        storageKey="contract-side"
        defaultStart="44%"
        minStart={360}
        minEnd={420}
        start={
          wide ? (
            <aside className={styles.asideColumn}>
              <Panel as="div" className={styles.aside}>
                {pane}
              </Panel>
            </aside>
          ) : null
        }
        end={<div className={styles.main}>{children}</div>}
      />
      <Drawer
        open={open && !wide}
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
