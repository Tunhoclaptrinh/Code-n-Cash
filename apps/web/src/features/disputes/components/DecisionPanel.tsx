import { DemoFillButton } from "@/shared/ui/DemoFillButton";
import { App as AntApp, Button, Input, Radio } from "antd";
import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { Evaluation } from "@codecash/contracts";
import { ApiError } from "@/shared/api/client";
import { openDispute, resolveDispute } from "@/shared/api/domain";
import type { DisputeView } from "../types";
import styles from "./DecisionPanel.module.css";

type Option = "RESOLVE" | "REQUEST_INFO" | "OPEN";

/**
 * Right column. The buyer (or its contract owner) closes disputes with DISPUTE_RESOLVED events
 * that reference them (BR-08); either party may open a new one. Nobody edits the penalty by hand:
 * the engine re-evaluates the milestone after every event (spec 9.5).
 */
export function DecisionPanel({ view }: { view: DisputeView }) {
  const { t } = useTranslation("disputes");
  const { t: td } = useTranslation("domain");
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const ids = useId();
  const options: Option[] = [
    ...(view.canResolve ? (["RESOLVE", "REQUEST_INFO"] as const) : []),
    ...(view.canOpen ? (["OPEN"] as const) : []),
  ];
  const [option, setOption] = useState<Option | undefined>();
  const [note, setNote] = useState("");
  const [noteMissing, setNoteMissing] = useState(false);
  const ref = {
    contractId: view.contract.id,
    sequence: view.milestone.sequence,
  };

  const act = useMutation({
    mutationFn: (): Promise<{ evaluation?: Evaluation | null }> =>
      option === "OPEN"
        ? openDispute({ ...ref, note: note.trim() })
        : resolveDispute({
            ...ref,
            option: option as "RESOLVE" | "REQUEST_INFO",
            note: note.trim(),
          }),
    onSuccess: async (result) => {
      setNote("");
      message.success(
        result.evaluation
          ? t("decision.done", {
              status: td(`status.${result.evaluation.status}`),
              reason: td(`reason.${result.evaluation.reasonCode}`),
            })
          : t("decision.noted"),
      );
      await queryClient.invalidateQueries({ queryKey: ["dispute"] });
      await queryClient.invalidateQueries({ queryKey: ["milestones"] });
    },
    onError: (error) =>
      message.error(
        td(`errors.${error instanceof ApiError ? error.code : "UNKNOWN"}`, {
          defaultValue: td("errors.UNKNOWN"),
        }),
      ),
  });

  function onConfirm() {
    if (!option) return;
    if (!note.trim()) {
      setNoteMissing(true);
      return;
    }
    act.mutate();
  }

  const headingId = `${ids}-heading`;
  const noteId = `${ids}-note`;
  return (
    <section className={styles.panel}>
      <h2 id={headingId} className={styles.heading}>
        {t("decision.title")}
      </h2>
      {options.length ? (
        <div
          className={styles.options}
          role="radiogroup"
          aria-labelledby={headingId}
        >
          {options.map((value) => (
            <label
              key={value}
              className={
                value === option ? styles.optionSelected : styles.option
              }
            >
              <Radio
                name={`${ids}-option`}
                className={styles.radio}
                value={value}
                checked={value === option}
                onChange={() => setOption(value)}
                data-testid={`dispute-option-${value}`}
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
      ) : (
        <div className={styles.pending}>{t("decision.readOnly")}</div>
      )}
      {options.length ? (
        <div>
          <label htmlFor={noteId} className={styles.label}>
            {t("decision.note.label")}{" "}
            <DemoFillButton
              disabled={!!note.trim()}
              onClick={() => {
                setNote(t("decision.note.demo"));
                setNoteMissing(false);
              }}
            />
            <span className={styles.required}>*</span>
          </label>
          <Input.TextArea
            id={noteId}
            className={styles.note}
            rows={3}
            value={note}
            placeholder={t("decision.note.placeholder")}
            maxLength={2000}
            showCount
            onBlur={() => setNoteMissing(!note.trim())}
            aria-invalid={noteMissing}
            onChange={(event) => {
              setNote(event.target.value);
              setNoteMissing(false);
            }}
            data-testid="dispute-note"
          />
          {noteMissing ? (
            <div className={styles.error} role="alert">
              {t("decision.note.required")}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={styles.pending}>{t("decision.rule")}</div>
      <div className={styles.actions}>
        <Link
          to={`/contracts/${view.contract.id}/milestones/${view.milestone.sequence}/decision`}
          className={styles.later}
        >
          {t("decision.actions.trace")}
        </Link>
        <Button
          {...(option === "OPEN" || option === "REQUEST_INFO"
            ? { color: "orange" as const, variant: "outlined" as const }
            : { color: "green" as const, variant: "solid" as const })}
          size="small"
          disabled={!option || act.isPending}
          loading={act.isPending}
          onClick={onConfirm}
          data-testid="dispute-confirm"
        >
          {t("decision.actions.confirm")}
        </Button>
      </div>
    </section>
  );
}
