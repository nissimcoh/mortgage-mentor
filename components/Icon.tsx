import type { SVGProps } from "react";

/**
 * One small line-icon set drawn on a 24px grid with a 1.6px stroke, so the
 * navigation, cards and buttons share a single visual weight. Decorative by
 * default: the adjacent text supplies the accessible name.
 */
const PATHS = {
  home: "M4 11.2 12 4.5l8 6.7M6.2 9.8V19a.8.8 0 0 0 .8.8h3.2v-5.3h3.6v5.3H17a.8.8 0 0 0 .8-.8V9.8",
  calculator: "M7.2 3.8h9.6a1.6 1.6 0 0 1 1.6 1.6v13.2a1.6 1.6 0 0 1-1.6 1.6H7.2a1.6 1.6 0 0 1-1.6-1.6V5.4a1.6 1.6 0 0 1 1.6-1.6ZM8.6 7h6.8v2.6H8.6zM8.9 13h.01M12 13h.01M15.1 13h.01M8.9 16.4h.01M12 16.4h.01M15.1 16.4h.01",
  book: "M12 6.6c-1.7-1.3-3.9-1.9-7-1.9v12.6c3.1 0 5.3.6 7 1.9 1.7-1.3 3.9-1.9 7-1.9V4.7c-3.1 0-5.3.6-7 1.9Zm0 0v12.6",
  bookmark: "M7.4 4.2h9.2a1 1 0 0 1 1 1v14.3L12 15.6l-5.6 3.9V5.2a1 1 0 0 1 1-1Z",
  search: "M10.8 17.2a6.4 6.4 0 1 0 0-12.8 6.4 6.4 0 0 0 0 12.8Zm4.6-1.8 4.2 4.2",
  globe: "M12 20.4a8.4 8.4 0 1 0 0-16.8 8.4 8.4 0 0 0 0 16.8ZM3.8 12h16.4M12 3.6c2.2 2.3 3.3 5.1 3.3 8.4s-1.1 6.1-3.3 8.4c-2.2-2.3-3.3-5.1-3.3-8.4S9.8 5.9 12 3.6Z",
  chevron: "m9.5 5.5 6.5 6.5-6.5 6.5",
  arrowUpRight: "M8 16 16 8M9.5 8H16v6.5",
  shield: "M12 3.8 5.4 6.3v5.2c0 4 2.6 7.1 6.6 8.7 4-1.6 6.6-4.7 6.6-8.7V6.3L12 3.8Zm-2.9 8.3 2.1 2.1 3.9-4.1",
  chart: "M4.5 19.5h15M7.5 16v-4.5M12 16V7.5M16.5 16v-7",
  layers: "m12 4 8 4.2-8 4.2-8-4.2L12 4Zm-8 8.1 8 4.2 8-4.2M4 15.9l8 4.2 8-4.2",
  table: "M5.4 5h13.2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5.4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm-1 4.8h15.2M4.4 14.4h15.2M10 9.8V19",
  share: "M12 14.5V4.2m0 0L8.4 7.8M12 4.2l3.6 3.6M6.5 11.5v6.6a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-6.6",
  sparkle: "M12 4.2c.5 3.9 2 5.4 5.9 5.9-3.9.5-5.4 2-5.9 5.9-.5-3.9-2-5.4-5.9-5.9 3.9-.5 5.4-2 5.9-5.9ZM18.2 15.4c.2 1.6.8 2.2 2.4 2.4-1.6.2-2.2.8-2.4 2.4-.2-1.6-.8-2.2-2.4-2.4 1.6-.2 2.2-.8 2.4-2.4Z",
  close: "M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5",
  enter: "M18.5 6v6.5a2 2 0 0 1-2 2H6.5m0 0 3.5-3.5M6.5 14.5l3.5 3.5",
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 20, ...props }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      <path d={PATHS[name]} />
    </svg>
  );
}
