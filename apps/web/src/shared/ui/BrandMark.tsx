/** CodeCash mark: a contract sheet with a check. `inverse` is for placement on the brand colour. */
export function BrandMark({
  size = 32,
  inverse = false,
}: {
  size?: number;
  inverse?: boolean;
}) {
  const tile = inverse ? "#fff" : "var(--color-primary)";
  const sheet = inverse ? "var(--color-primary)" : "#fff";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      style={{ flex: "none" }}
    >
      <rect width="32" height="32" rx="9" fill={tile} />
      <path
        d="M11 8h7l5 5v10a1 1 0 0 1-1 1H11a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"
        fill={sheet}
      />
      <path
        d="M18 8v4a1 1 0 0 0 1 1h4"
        fill="none"
        stroke={tile}
        strokeWidth="1.4"
      />
      <path
        d="M13 18.5l2.2 2.2 4.3-4.6"
        fill="none"
        stroke={tile}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
