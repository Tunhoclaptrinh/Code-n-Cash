import i18n from '@/i18n';
import { formatDate } from '@/shared/lib/format';

/** `12/2027` style month and year; independent of locale. */
export function formatMonthYear(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}/${year}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `04:36` style countdown, never negative. */
export function formatCountdown(milliseconds: number): string {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** `7 4 2 9` style spacing for a confirmation code. */
export function spaceCode(code: string): string {
  return code.split('').join(' ');
}

/** True when the certificate runs out before the current moment. */
export function isCertificateExpired(month: number, year: number, now = new Date()): boolean {
  return new Date(year, month, 1).getTime() <= now.getTime();
}

const locale = () => (i18n.language?.startsWith('vi') ? 'vi-VN' : 'en-US');

/** Text shown in a date input for a stored local date-time. */
export function dateToInputText(value: string | null): string {
  return value ? formatDate(value) : '';
}

/**
 * Reads a date typed in the order of the current locale.
 * Returns `null` for empty text, `undefined` for text that is not a real date, otherwise a local ISO date-time.
 */
export function inputTextToDate(text: string): string | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const numbers = trimmed.split(/[^0-9]+/).filter(Boolean).map(Number);
  if (numbers.length !== 3) return undefined;
  const order = new Intl.DateTimeFormat(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' })
    .formatToParts(new Date(2000, 10, 25))
    .filter((part) => part.type === 'day' || part.type === 'month' || part.type === 'year')
    .map((part) => part.type);
  const values = Object.fromEntries(order.map((type, index) => [type, numbers[index]])) as Record<
    'day' | 'month' | 'year',
    number
  >;
  const date = new Date(values.year, values.month - 1, values.day);
  const valid =
    values.year >= 1000 &&
    date.getFullYear() === values.year &&
    date.getMonth() === values.month - 1 &&
    date.getDate() === values.day;
  if (!valid) return undefined;
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${pad(values.year, 4)}-${pad(values.month)}-${pad(values.day)}T00:00:00`;
}

/** Joins class names, skipping the falsy ones. */
export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

/** "a and b" style list in the current language. */
export function formatList(items: string[]): string {
  return new Intl.ListFormat(locale(), { style: 'long', type: 'conjunction' }).format(items);
}
