import { Menu, Select } from "antd";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { AppPage } from "@/shared/layout/AppPage";
import { GuideContent } from "./GuideContent";
import { GUIDE_TOPICS, isGuideTopic } from "./topics";
import styles from "./guide.module.css";

/** The user guide: one topic per screen or task, with annotated screenshots. */
export default function GuidePage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const param = useParams().topic;
  const topic = isGuideTopic(param) ? param : "start";
  return (
    <AppPage
      active="guide"
      breadcrumb={[
        { label: t("guide.title"), to: "/guide" },
        { label: t(`guide.topics.${topic}`) },
      ]}
    >
      <div className={styles.layout}>
        <Select
          className={styles.topicPicker}
          aria-label={t("guide.title")}
          value={topic}
          options={GUIDE_TOPICS.map((key) => ({
            value: key,
            label: t(`guide.topics.${key}`),
          }))}
          onChange={(key) => navigate(`/guide/${key}`)}
        />
        <Menu
          className={styles.menu}
          mode="inline"
          selectedKeys={[topic]}
          items={GUIDE_TOPICS.map((key) => ({
            key,
            label: t(`guide.topics.${key}`),
          }))}
          onClick={({ key }) => navigate(`/guide/${key}`)}
        />
        <div className={styles.content}>
          <GuideContent topic={topic} />
        </div>
      </div>
    </AppPage>
  );
}
