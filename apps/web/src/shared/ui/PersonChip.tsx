import { Avatar, Popover } from "antd";
import { useTranslation } from "react-i18next";
import type { PersonRef } from "@codecash/contracts";
import { initialsOf } from "@/shared/lib/initials";
import styles from "./PersonChip.module.css";

interface PersonChipProps {
  person: PersonRef;
  /** Organisation name for the hover card; the chip itself shows only the person. */
  organizationName?: string;
  /** Business role in words, for the hover card. */
  roleLabel?: string;
}

/** A person by name with initials; hovering, focusing or tapping shows their title, role and organisation. */
export function PersonChip({
  person,
  organizationName,
  roleLabel,
}: PersonChipProps) {
  const { t } = useTranslation("common");
  const card = (
    <dl className={styles.card}>
      <dt className={styles.cardName}>
        {person.name}
        {person.isYou ? (
          <span className={styles.you}>{t("person.you")}</span>
        ) : null}
      </dt>
      {person.title ? (
        <dd>
          <span>{t("person.title")}</span> {person.title}
        </dd>
      ) : null}
      {roleLabel ? <dd>{roleLabel}</dd> : null}
      {organizationName ? (
        <dd>
          <span>{t("person.organization")}</span> {organizationName}
        </dd>
      ) : null}
    </dl>
  );
  return (
    <Popover content={card} trigger={["hover", "focus", "click"]}>
      <span
        className={styles.chip}
        data-you={person.isYou || undefined}
        tabIndex={0}
        data-testid="person-chip"
      >
        <Avatar size={20} className={styles.avatar}>
          {initialsOf(person.name)}
        </Avatar>
        <span className={styles.name}>{person.name}</span>
        {person.isYou ? (
          <span className={styles.you}>{t("person.you")}</span>
        ) : null}
      </span>
    </Popover>
  );
}
