import type { ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps {
  as?: 'section' | 'div';
  className?: string;
  children: ReactNode;
}

/** White surface with the standard border and radius; layout (padding, gap) comes from the caller. */
export function Card({ as: Tag = 'section', className, children }: CardProps) {
  return <Tag className={[styles.card, className ?? ''].join(' ')}>{children}</Tag>;
}
