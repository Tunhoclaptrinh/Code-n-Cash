import { Space, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { formatDateTime, formatDecimalString } from "@/shared/lib/format";
import { actorName } from "@/shared/lib/domain";
import { initialsOf } from "@/shared/lib/initials";
import { DecisionTag } from "@/shared/ui/DomainTags";
import type { DisputeView } from "../types";
import styles from "./SubmissionPanel.module.css";

/** Left column: every dispute of the milestone, who opened and closed it, and what closing would pay. */
export function SubmissionPanel({ view }: { view: DisputeView }) {
  const { t } = useTranslation("disputes");
  const { t: td } = useTranslation("domain");
  const { evaluation, preview } = view;
  return (
    <section className={styles.panel}>
      {view.disputes.length ? (
        <h2 className={styles.heading}>
          {t("submission.title", { count: view.disputes.length })}
        </h2>
      ) : (
        <Typography.Text type="secondary">{t("lite.none")}</Typography.Text>
      )}
      {view.disputes.map(({ opened, resolution, state }) => (
        <div
          key={opened.id}
          className={styles.message}
          data-testid="dispute-case"
        >
          <div className={styles.author}>
            <span className={styles.avatar}>
              {initialsOf(opened.recordedBy ?? actorName(td, opened.actor))}
            </span>
            <b>
              {opened.recordedBy
                ? t("submission.author", {
                    name: opened.recordedBy,
                    organization: actorName(td, opened.actor),
                  })
                : actorName(td, opened.actor)}
            </b>
            <span className={styles.time}>{formatDateTime(opened.at)}</span>
          </div>
          {/* Organiser rows carry a placeholder note, not words a person wrote. */}
          {opened.origin === "APP" && opened.note ? (
            <div>{t("submission.quote", { message: opened.note })}</div>
          ) : null}
          <Space size={6} wrap style={{ marginTop: 8 }}>
            <Tag color={state === "OPEN" ? "warning" : "success"}>
              {t(`state.${state}`)}
            </Tag>
          </Space>
          {resolution ? (
            <div className={styles.file}>
              <span className={styles.fileKind}>
                {td("eventType.DISPUTE_RESOLVED")}
              </span>
              {t(
                resolution.origin === "APP" && resolution.note
                  ? "submission.resolution"
                  : "submission.resolutionPlain",
                {
                  by: resolution.recordedBy ?? actorName(td, resolution.actor),
                  at: formatDateTime(resolution.at),
                  note: resolution.note,
                },
              )}
            </div>
          ) : null}
        </div>
      ))}
      {view.notes.length ? (
        <>
          <h2 className={`${styles.heading} ${styles.headingSpaced}`}>
            {t("notes.title")}
          </h2>
          {view.notes.map((note) => (
            <div key={note.id} className={styles.file}>
              <span className={styles.fileKind}>
                {t(`notes.kind.${note.kind}`)}
              </span>
              {note.text} · {note.author}, {formatDateTime(note.at)}
            </div>
          ))}
        </>
      ) : null}
      <h2 className={`${styles.heading} ${styles.headingSpaced}`}>
        {t("impact.title")}
      </h2>
      <div className={styles.impact}>
        <div className={styles.impactCard}>
          <div className={styles.impactLabel}>{t("impact.now")}</div>
          <Space size={6}>
            <DecisionTag decision={evaluation.decision} />
            <b className={styles.impactValue}>
              {formatDecimalString(evaluation.payableMillion)}
            </b>
          </Space>
          <span className={styles.unit}> {t("impact.unit")}</span>
          <div className={styles.impactLabel}>
            {td(`reason.${evaluation.reasonCode}`)}
          </div>
        </div>
        <div className={`${styles.impactCard} ${styles.impactCardGood}`}>
          <div className={styles.impactLabel}>{t("impact.afterResolve")}</div>
          {preview ? (
            <>
              <Space size={6}>
                <DecisionTag decision={preview.decision} />
                <b
                  className={`${styles.impactValue} ${styles.impactValueGood}`}
                >
                  {formatDecimalString(preview.payableMillion)}
                </b>
              </Space>
              <span className={styles.unit}> {t("impact.unit")}</span>
              <div className={styles.impactLabel}>
                {td(`reason.${preview.reasonCode}`)}
                {preview.penaltyMillion !== "0.00"
                  ? ` · ${t("impact.penalty", { penalty: formatDecimalString(preview.penaltyMillion) })}`
                  : ""}
              </div>
            </>
          ) : (
            <div className={styles.impactLabel}>{t("lite.noPreview")}</div>
          )}
        </div>
      </div>
    </section>
  );
}
