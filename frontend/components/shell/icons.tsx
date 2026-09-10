type IconProps = { className?: string };

export function Logo({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 8 L16 24 L25 8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="miter"
      />
      <path
        d="M12 8 L16 15 L20 8"
        stroke="var(--color-acid)"
        strokeWidth="2.4"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export function CopyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M10.5 5.5 V3 A0.5 .5 0 0 0 10 2.5 H2.5 V10 A.5 .5 0 0 0 3 10.5 H5.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path
        d="M3 8.5 L6.5 12 L13 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function AlertIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path
        d="M8 1.5 L15 14 H1 Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="miter"
      />
      <path d="M8 6 V9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
      <circle cx="8" cy="11.6" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function ExternalIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M6 3 H3 V13 H13 V10" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9 3 H13 V7 M13 3 L7.5 8.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
