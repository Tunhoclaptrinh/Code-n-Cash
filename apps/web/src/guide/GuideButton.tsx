import { useState } from "react";
import { Button, Drawer } from "antd";
import { ReadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { GuideContent } from "./GuideContent";
import type { GuideTopic } from "./topics";

/** "How to use this page": the page's guide topic in a side drawer, next to the page title. */
export function GuideButton({ topic }: { topic: GuideTopic }) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        icon={<ReadOutlined />}
        onClick={() => setOpen(true)}
        data-testid="page-guide"
      >
        {t("guide.button")}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        size="large"
        title={t(`guide.topics.${topic}`)}
        extra={
          <Link to={`/guide/${topic}`} onClick={() => setOpen(false)}>
            {t("guide.openFull")}
          </Link>
        }
        destroyOnHidden
      >
        <GuideContent topic={topic} />
      </Drawer>
    </>
  );
}
