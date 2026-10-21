import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from './Button.module.css';

export type ButtonVariant =
  | 'primary'
  | 'success'
  | 'outline'
  | 'outlinePrimary'
  | 'outlineDanger'
  | 'outlineWarning'
  | 'outlineSuccess';
export type ButtonSize = 'row' | 'md' | 'header' | 'compact';

interface CommonProps {
  variant: ButtonVariant;
  size: ButtonSize;
  className?: string;
  children: ReactNode;
}

type LinkProps = CommonProps & { to: string };
type NativeProps = CommonProps & { to?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>;

/** Link- or button-shaped action. Pass `to` for navigation, otherwise it renders a real `<button>`. */
export function Button(props: LinkProps | NativeProps) {
  const className = [styles.btn, styles[props.variant], styles[props.size], props.className ?? ''].join(' ');
  if (props.to !== undefined) {
    return (
      <Link to={props.to} className={className}>
        {props.children}
      </Link>
    );
  }
  const { variant: _variant, size: _size, className: _className, children, to: _to, ...rest } = props;
  return (
    <button type="button" className={className} {...rest}>
      {children}
    </button>
  );
}
