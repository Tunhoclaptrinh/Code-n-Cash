import { Alert, Button, Divider, Form, Select, Tag, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import type { Side } from "@codecash/contracts";
import { SignerOrderActions } from "@/shared/ui/SignerOrderActions";
import type { ContractUploadFormState } from "../hooks/useContractUploadForm";
import { MAX_SIGNERS } from "../lib/uploadDraft";
import type { UploadFormOptions } from "../types";
import { HelpLabel } from "./HelpLabel";
import styles from "./ContractUploadForm.module.css";

interface UploadSigningSectionProps {
  form: ContractUploadFormState;
  options: UploadFormOptions;
}

/** Template picker and the ordered signer list. */
export function UploadSigningSection({
  form,
  options,
}: UploadSigningSectionProps) {
  const { t } = useTranslation("contracts");
  const { t: tl } = useTranslation("contracts", { keyPrefix: "lite" });
  const { t: tc } = useTranslation("common");
  const { t: td } = useTranslation("domain");
  const {
    value,
    touched,
    problem,
    setSigners,
    peopleFor,
    move,
    applyPreset,
    clearTemplate,
  } = form;
  return (
    <>
      <Divider className={styles.divider} titlePlacement="start">
        {t("contractUpload.sections.signing")}
      </Divider>
      {value.signers.length === 1 ? (
        <Alert
          type="warning"
          showIcon
          title={tl("singleSigner")}
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <div data-testid="template-and-signers">
        <Form.Item
          label={
            <HelpLabel
              label={t("contractUpload.templates.choose")}
              hint={t("contractUpload.templates.notice")}
            />
          }
        >
          <Select
            data-testid="contract-template-picker"
            style={{ width: "100%" }}
            allowClear
            placeholder={t("contractUpload.templates.choose")}
            value={value.templateId}
            labelRender={({ label }) =>
              value.templateSnapshot ? value.templateSnapshot.name : label
            }
            onSelect={(id?: string) => {
              if (id) applyPreset(id);
            }}
            onChange={(id?: string) => {
              if (!id) clearTemplate();
            }}
            options={[
              ...(value.templateSnapshot &&
              !options.presets.some((preset) => preset.id === value.templateId)
                ? [
                    {
                      value: value.templateId!,
                      label: value.templateSnapshot.name,
                    },
                  ]
                : []),
              ...options.presets.map((preset) => ({
                value: preset.id,
                label: (
                  <span data-testid={`template-option-${preset.id}`}>
                    {preset.name}
                  </span>
                ),
              })),
            ]}
          />
        </Form.Item>
        <Form.Item
          label={
            <HelpLabel
              label={t("contractUpload.form.signers.label")}
              hint={t("contractUpload.form.signers.hint")}
            />
          }
          required
          validateStatus={touched && problem ? "error" : undefined}
          help={
            touched && problem
              ? t(`contractUpload.form.signers.errors.${problem}`)
              : undefined
          }
        >
          <div data-testid="signer-list">
            {value.signers.map((signer, index) => (
              <div
                className={styles.signerRow}
                data-testid="signer-row"
                key={`${index}-${signer.party}`}
              >
                <Tag
                  className={styles.signerIndex}
                  color={index === value.signers.length - 1 ? "gold" : "blue"}
                >
                  {index + 1}
                </Tag>
                <div className={styles.signerSide}>
                  <Select<Side>
                    aria-label={t("contractUpload.form.signers.sideAt", {
                      index: index + 1,
                    })}
                    value={signer.party}
                    style={{ width: "100%" }}
                    onChange={(party) =>
                      setSigners(
                        value.signers.map((s, i) =>
                          i === index
                            ? {
                                party,
                                userId: "",
                              }
                            : s,
                        ),
                      )
                    }
                    options={(["BUYER", "SUPPLIER"] as const).map((party) => ({
                      value: party,
                      label: td(`side.${party}`),
                    }))}
                  />
                </div>
                <div className={styles.signerPerson}>
                  <Select
                    aria-label={t("contractUpload.form.signers.personAt", {
                      index: index + 1,
                    })}
                    value={signer.userId || undefined}
                    style={{ width: "100%" }}
                    placeholder={t("contractUpload.form.signers.person")}
                    onChange={(userId: string) =>
                      setSigners(
                        value.signers.map((s, i) =>
                          i === index ? { ...s, userId } : s,
                        ),
                      )
                    }
                    options={peopleFor(signer.party).map((person) => ({
                      value: person.userId,
                      label: `${person.name} · ${tc(`roles.${person.role}.name`)}`,
                    }))}
                  />
                </div>
                <SignerOrderActions
                  className={styles.signerActions}
                  first={index === 0}
                  last={index === value.signers.length - 1}
                  onUp={() => move(index, -1)}
                  onDown={() => move(index, 1)}
                  onRemove={() =>
                    setSigners(value.signers.filter((_, i) => i !== index))
                  }
                />
              </div>
            ))}
          </div>
          <div className={styles.signerFooter}>
            <Button
              data-testid="signer-add"
              size="small"
              icon={<PlusOutlined />}
              disabled={value.signers.length >= MAX_SIGNERS}
              onClick={() =>
                setSigners([
                  ...value.signers,
                  {
                    party: "BUYER",
                    userId: "",
                  },
                ])
              }
            >
              {t("contractUpload.form.signers.add")}
            </Button>
            <Typography.Text type="secondary">
              {t("contractUpload.form.signers.count", {
                count: value.signers.length,
                max: MAX_SIGNERS,
              })}
            </Typography.Text>
          </div>
        </Form.Item>
      </div>
    </>
  );
}
