import { Button, Input, Radio } from "antd";
import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useCurrentUser } from "@/shared/auth/session";
import { formatDateTime } from "@/shared/lib/format";
import { resolveDispute } from "../api/dispute.api";
import type { Dispute, ResolutionOption } from "../types";
import styles from "./DecisionPanel.module.css";

const OPTIONS: ResolutionOption[] = [
  "ACCEPT_WAIVE_PENALTY",
  "KEEP_PENALTY",
  "REQUEST_MORE_EVIDENCE",
];

/** Right column: the contract owner's decision on the dispute. */
export function DecisionPanel({ dispute }: { dispute: Dispute }) {
  const { t } = useTranslation("disputes");
  const { t: tc } = useTranslation("common");
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const ids = useId();

  const [option, setOption] = useState<ResolutionOption>(
    dispute.resolution?.option ?? "ACCEPT_WAIVE_PENALTY",
  );
  const [note, setNote] = useState(
    dispute.resolution?.note ?? dispute.draftNote,
  );
  const [noteMissing, setNoteMissing] = useState(false);

  const isOpen = dispute.status === "OPEN";
  const canDecide = isOpen && user.role === "CONTRACT_OWNER";

  const decide = useMutation({
    mutationFn: resolveDispute,
    onSuccess: async (updated) => {
      queryClient.setQueryData(
        ["dispute", updated.contractCode, updated.milestoneNo],
        updated,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pending-task-count"] }),
        queryClient.invalidateQueries({ queryKey: ["contract-summaries"] }),
      ]);
    },
  });

  function onConfirm() {
    if (!note.trim()) {
      setNoteMissing(true);
      return;
    }
    decide.mutate({
      contractCode: dispute.contractCode,
      milestoneNo: dispute.milestoneNo,
      option,
      note: note.trim(),
      actor: { id: user.id, displayName: user.displayName },
    });
  }

  const headingId = `${ids}-heading`;
  const noteId = `${ids}-note`;
  const resolution = dispute.resolution;

  return (
    <section className={styles.panel}>
      <h2 id={headingId} className={styles.heading}>
        {t("decision.title")}
      </h2>

      <div
        className={styles.options}
        role="radiogroup"
        aria-labelledby={headingId}
      >
        {OPTIONS.map((value) => (
          <label
            key={value}
            className={value === option ? styles.optionSelected : styles.option}
          >
            <Radio
              name={`${ids}-option`}
              className={styles.radio}
              value={value}
              checked={value === option}
              disabled={!canDecide}
              onChange={() => setOption(value)}
            />
            <span className={styles.indicator} aria-hidden="true" />
            <div>
              <b>{t(`decision.options.${value}.name`)}</b>
              <div className={styles.optionHint}>
                {t(`decision.options.${value}.description`)}
              </div>
            </div>
          </label>
        ))}
      </div>

      <div>
        <label htmlFor={noteId} className={styles.label}>
          {t("decision.note.label")} <span className={styles.required}>*</span>
        </label>
        <Input.TextArea
          id={noteId}
          className={styles.note}
          rows={3}
          value={note}
          readOnly={!canDecide}
          aria-invalid={noteMissing}
          onChange={(event) => {
            setNote(event.target.value);
            setNoteMissing(false);
          }}
        />
        {noteMissing ? (
          <div className={styles.error} role="alert">
            {t("decision.note.required")}
          </div>
        ) : null}
      </div>

      <div className={styles.pending}>
        <Trans
          t={t}
          i18nKey="decision.pendingPoint"
          components={{ b: <b /> }}
        />
      </div>

      {resolution ? (
        <div className={styles.outcome} role="status">
          <b>{t(`decision.outcome.${resolution.option}`)}</b>
          <div>
            {t("decision.outcome.by", {
              name: resolution.decidedBy,
              at: formatDateTime(resolution.decidedAt),
            })}
          </div>
        </div>
      ) : null}
      {decide.isError ? (
        <div className={styles.error} role="alert">
          {tc("common.loadError")}
        </div>
      ) : null}

      <div className={styles.actions}>
        <Link
          to={`/contracts/${dispute.contractCode}`}
          className={styles.later}
        >
          {t("decision.actions.later")}
        </Link>
        <Button
          type="primary"
          size="large"
          disabled={!canDecide || decide.isPending}
          onClick={onConfirm}
        >
          {t("decision.actions.confirm")}
        </Button>
      </div>
    </section>
  );
}
