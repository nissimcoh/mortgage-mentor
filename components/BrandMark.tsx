interface BrandMarkProps {
  className?: string;
}

/**
 * Minimal inline house glyph on a rounded square — no image assets, no icon
 * package, just a hand-authored SVG so the header reads as a real product
 * mark rather than plain text. Purely decorative (aria-hidden); the
 * wordmark next to it carries the accessible name.
 */
export default function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 28 28"
      width="28"
      height="28"
      aria-hidden="true"
      className={className}
    >
      <rect width="28" height="28" rx="8" fill="#0f172a" />
      <path
        d="M7 14.5 14 8l7 6.5M9.5 13v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-7"
        fill="none"
        stroke="#f8fafc"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
