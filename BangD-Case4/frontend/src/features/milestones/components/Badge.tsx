import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'primary' | 'neutral' | 'indigo';
export type BadgeSize = 'sm' | 'md' | 'lg' | 'strong' | 'headline';

interface BadgeProps {
  tone: BadgeTone;
  size?: BadgeSize;
  children: ReactNode;
}

/** Pill used for statuses, decision codes and signature states. */
export function Badge({ tone, size = 'sm', children }: BadgeProps) {
  return <span className={[styles.badge, styles[tone], styles[size]].join(' ')}>{children}</span>;
}
