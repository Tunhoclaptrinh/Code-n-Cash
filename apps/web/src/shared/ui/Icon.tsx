import type { ReactNode, SVGProps } from "react";

interface SvgIconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number;
  strokeWidth?: number;
  children: ReactNode;
}

/**
 * Base for every icon: 24px grid, stroke follows `currentColor`.
 * Features that need an icon this file does not provide should build it from `SvgIcon`.
 */
export function SvgIcon({
  size = 20,
  strokeWidth = 1.8,
  children,
  ...rest
}: SvgIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

const iconPaths = {
  check: <path d="M5 12l5 5 9-10" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  file: <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" />,
  inbox: <path d="M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5" />,
  shield: (
    <>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  bell: <path d="M6 17h12l-1.5-2V11a4.5 4.5 0 00-9 0v4zM10 20h4" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ),
} as const;

export type IconName = keyof typeof iconPaths;

interface IconProps extends Omit<SvgIconProps, "children"> {
  name: IconName;
}

export function Icon({ name, ...rest }: IconProps) {
  return <SvgIcon {...rest}>{iconPaths[name]}</SvgIcon>;
}
