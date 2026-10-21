import { formatDate } from '@/shared/lib/format';
import styles from './ActivityLogView.module.css';

interface DateFilterProps {
  id: string;
  label: string;
  /** `yyyy-mm-dd`, empty for no bound. */
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}

/**
 * Shows the date in the active locale's format and keeps a transparent native date input on top,
 * so the picker, keyboard entry and screen-reader semantics come from the browser.
 */
export function DateFilter({ id, label, value, min, max, onChange }: DateFilterProps) {
  return (
    <>
      <label htmlFor={id} className={styles.filterLabel}>
        {label}
      </label>
      <div className={styles.dateControl}>
        <span aria-hidden="true">{value ? formatDate(`${value}T00:00:00`) : ' '}</span>
        <input
          id={id}
          type="date"
          className={styles.dateInput}
          value={value}
          min={min}
          max={max}
          onChange={(event) => onChange(event.target.value)}
          onClick={(event) => event.currentTarget.showPicker?.()}
        />
      </div>
    </>
  );
}
