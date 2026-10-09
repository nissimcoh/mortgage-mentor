interface BrandMarkProps {
  className?: string;
}

/**
 * House + M monogram. Keep geometry in sync with public/brand/mortgagementor.svg.
 * Decorative: the adjacent wordmark supplies the accessible name.
 * Inline paths stay sharp at small sizes and print without another image request.
 */
export default function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      width="32"
      height="32"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect width="512" height="512" rx="112" fill="#102f40" />
      <path
        d="M96 232 256 100 416 232M136 224v172h240V224"
        fill="none"
        stroke="#f5faf8"
        strokeWidth="28"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M200 344v-96l56 52 56-52v96" fill="none" stroke="#88dfc0" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
