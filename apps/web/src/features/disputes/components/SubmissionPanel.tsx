import { Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { formatDateTime, formatDecimalString } from "@/shared/lib/format";
import { actorName } from "@/shared/lib/domain";
import { organizationInitials } from "@/shared/lib/initials";
import { PersonChip } from "@/shared/ui/PersonChip";
import { DecisionTag } from "@/shared/ui/DomainTags";
import { SideSection } from "@/shared/ui/SidePanel";
import type { DisputeView } from "../types";
import styles from "./SubmissionPanel.module.css";

/** Every dispute of the milestone, who opened and closed it, and what closing would pay. */
export function SubmissionPanel({ view }: { view: DisputeView }) {
  const { t } = useTranslation("disputes");
  const { t: td } = useTranslation("domain");
  const { evaluation, preview } = view;
  return (
    <>
      <SideSection
        title={
          view.disputes.length
            ? t("submission.title", { count: view.disputes.length })
            : undefined
        }
      >
        {view.disputes.length ? null : (
          <Typography.Text type="secondary">{t("lite.none")}</Typography.Text>
        )}
        {view.disputes.map(
          ({
            opened,
            resolution,
            state,
            side,
            openedBy,
            resolvedBy,
            openDays,
          }) => (
            <div
              key={opened.id}
              className={styles.message}
              data-testid="dispute-case"
            >
              <div className={styles.author}>
                <span className={styles.avatar} aria-hidden>
                  {organizationInitials(opened.actor.name)}
                </span>
                <b>{actorName(td, opened.actor)}</b>
                <Tag style={{ margin: 0 }} data-testid="dispute-side">
                  {td(`side.${side}`)}
                </Tag>
                <Tag
                  color={state === "OPEN" ? "warning" : "success"}
                  style={{ margin: 0 }}
                >
                  {t(`state.${state}`)}
                </Tag>
                <span className={styles.time}>{formatDateTime(opened.at)}</span>
              </div>
              <div className={styles.facts}>
                <span className={styles.factLabel}>
                  {t("submission.openedBy")}
                </span>
                {openedBy ? (
                  <PersonChip
                    person={openedBy}
                    organizationName={actorName(td, opened.actor)}
                  />
                ) : (
                  <span
                    className={styles.muted}
                    data-testid="opened-by-unknown"
                  >
                    {t("submission.openedByUnknown")}
                  </span>
                )}
                <span className={styles.muted}>
                  ·{" "}
                  {openDays === 0
                    ? t("submission.openToday")
                    : t(
                        state === "OPEN"
                          ? "submission.openFor"
                          : "submission.wasOpen",
                        { count: openDays },
                      )}
                </span>
              </div>
              {state === "OPEN" && view.resolvers.length ? (
                <div className={styles.facts} data-testid="dispute-resolvers">
                  <span className={styles.factLabel}>
                    {t("submission.resolvers")}
                  </span>
                  {view.resolvers.map((person) => (
                    <PersonChip
                      key={person.userId}
                      person={person}
                      organizationName={view.contract.buyer.name}
                    />
                  ))}
                </div>
              ) : null}
              {/* Organiser rows carry a placeholder note, not words a person wrote. */}
              {opened.origin === "APP" && opened.note ? (
                <div>{t("submission.quote", { message: opened.note })}</div>
              ) : null}
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
                      by:
                        resolvedBy?.name ??
                        resolution.recordedBy ??
                        actorName(td, resolution.actor),
                      at: formatDateTime(resolution.at),
                      note: resolution.note,
                    },
                  )}
                </div>
              ) : null}
            </div>
          ),
        )}
      </SideSection>
      {view.notes.length ? (
        <SideSection title={t("notes.title")}>
          {view.notes.map((note) => (
            <div key={note.id} className={styles.file}>
              <span className={styles.fileKind}>
                {t(`notes.kind.${note.kind}`)}
              </span>
              {note.text} · {note.author}, {formatDateTime(note.at)}
            </div>
          ))}
        </SideSection>
      ) : null}
      <SideSection title={t("impact.title")}>
        <div className={styles.impact}>
          <div className={styles.impactCard}>
            <div className={styles.impactLabel}>{t("impact.now")}</div>
            <div className={styles.impactLine}>
              <DecisionTag decision={evaluation.decision} />
              <b className={styles.impactValue}>
                {formatDecimalString(evaluation.payableMillion)}
              </b>
              <span className={styles.unit}>{t("impact.unit")}</span>
            </div>
            <div className={styles.impactLabel}>
              {td(`reason.${evaluation.reasonCode}`)}
            </div>
          </div>
          {preview ? (
            <div className={`${styles.impactCard} ${styles.impactCardGood}`}>
              <div className={styles.impactLabel}>
                {t("impact.afterResolve")}
              </div>
              <div className={styles.impactLine}>
                <DecisionTag decision={preview.decision} />
                <b
                  className={`${styles.impactValue} ${styles.impactValueGood}`}
                >
                  {formatDecimalString(preview.payableMillion)}
                </b>
                <span className={styles.unit}>{t("impact.unit")}</span>
              </div>
              <div className={styles.impactLabel}>
                {td(`reason.${preview.reasonCode}`)}
                {preview.penaltyMillion !== "0.00"
                  ? ` · ${t("impact.penalty", { penalty: formatDecimalString(preview.penaltyMillion) })}`
                  : ""}
              </div>
            </div>
          ) : null}
        </div>
      </SideSection>
    </>
  );
}
