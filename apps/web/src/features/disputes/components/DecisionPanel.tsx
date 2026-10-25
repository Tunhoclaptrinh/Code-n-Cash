import { DemoFillButton } from "@/shared/ui/DemoFillButton";
import { App as AntApp, Button, Input, Radio } from "antd";
import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { Evaluation } from "@codecash/contracts";
import { ApiError } from "@/shared/api/client";
import { openDispute, resolveDispute } from "@/shared/api/domain";
import type { DisputeView } from "../types";
import { SideSection } from "@/shared/ui/SidePanel";
import styles from "./DecisionPanel.module.css";

type Option = "RESOLVE" | "REQUEST_INFO" | "OPEN";

/** The buyer (or its contract owner) closes disputes (BR-08); either party may open one. */
export function DecisionPanel({ view }: { view: DisputeView }) {
  const { t } = useTranslation("disputes");
  const { t: td } = useTranslation("domain");
  const { t: tc } = useTranslation("common");
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
    <SideSection title={<span id={headingId}>{t("decision.title")}</span>}>
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
                  {t(`lite.options.${value}`)}
                </div>
              </div>
            </label>
          ))}
        </div>
      ) : (
        <div className={styles.pending}>{t("decision.readOnly")}</div>
      )}
      {options.length ? (
        <div className={styles.noteBlock}>
          <label htmlFor={noteId} className={styles.label}>
            {t("decision.note.label")}{" "}
            <DemoFillButton
              disabled={!!note.trim()}
              onClick={() => {
                // A sentence for the chosen action, naming only this milestone.
                setNote(
                  t(`lite.demoNote.${option ?? options[0]}`, {
                    milestone: `${td("milestoneNo", { no: view.milestone.sequence })} · ${td(`milestoneType.${view.milestone.type}`)}`,
                  }),
                );
                setNoteMissing(false);
              }}
            >
              {tc("demoFill.action")}
            </DemoFillButton>
            <span className={styles.required} aria-hidden="true">
              *
            </span>
          </label>
          <Input.TextArea
            id={noteId}
            rows={3}
            status={noteMissing ? "error" : undefined}
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
      <div className={styles.actions}>
        <Button
          onClick={() =>
            navigate(
              `/contracts/${view.contract.id}/milestones/${view.milestone.sequence}/decision`,
            )
          }
        >
          {t("decision.actions.trace")}
        </Button>
        <Button
          {...(option === "OPEN" || option === "REQUEST_INFO"
            ? { color: "orange" as const, variant: "outlined" as const }
            : { color: "green" as const, variant: "solid" as const })}
          disabled={!option || act.isPending}
          loading={act.isPending}
          onClick={onConfirm}
          data-testid="dispute-confirm"
        >
          {t("decision.actions.confirm")}
        </Button>
      </div>
    </SideSection>
  );
}
