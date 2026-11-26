import type { ReactNode } from "react";
import BrandMark from "@/components/BrandMark";
import type { Locale } from "@/lib/i18n/config";

/** Pixel width of every shared image (a common social and messaging size). */
export const SHARE_IMAGE_WIDTH = 1080;

/**
 * The common frame of a shareable image: brand and title on top, the
 * content, then the caveat and date. Fixed width, height follows content.
 */
export default function ShareImageFrame({ locale, title, subtitle, note, createdOn, siteName, children }: {
  locale: Locale;
  title: string;
  subtitle?: string | null;
  note: string;
  createdOn: string;
  siteName: string;
  children: ReactNode;
}) {
  return (
    <div
      dir={locale === "he" ? "rtl" : "ltr"}
      lang={locale}
      style={{ width: SHARE_IMAGE_WIDTH }}
      className="bg-[#f4f8f8] p-12 text-slate-900"
    >
      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-[44px] font-bold leading-tight tracking-tight text-[#102f40]">{title}</h1>
          {subtitle && <p className="mt-2 text-xl text-slate-600">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
          <BrandMark className="h-10 w-10" />
          <span dir="ltr" className="text-xl font-semibold tracking-tight">{siteName}</span>
        </div>
      </header>
      <div className="mt-8">{children}</div>
      <footer className="mt-8 flex items-end justify-between gap-6 border-t border-slate-900/10 pt-5 text-[15px] leading-6 text-slate-500">
        <p className="max-w-[760px]">{note}</p>
        <p className="shrink-0">{createdOn}</p>
      </footer>
    </div>
  );
}
