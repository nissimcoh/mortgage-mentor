"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import ModalDialog from "@/components/ModalDialog";
import { SHARE_IMAGE_WIDTH } from "./ShareImageFrame";

type Labels = Dictionary["shareImage"];

/**
 * Opens a preview of a shareable image and saves it as a PNG. The image is
 * drawn in the browser from the page's own figures: nothing is uploaded.
 */
export default function ShareImageButton({ label, fileName, labels, children }: {
  label: string;
  /** Without extension. */
  fileName: string;
  labels: Labels;
  /** The image itself, rendered only while the preview is open. */
  children: () => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLDivElement>(null);

  // Fit the fixed-width image into the dialog without changing what is saved.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const width = frame.current?.clientWidth ?? SHARE_IMAGE_WIDTH;
      setScale(Math.min(1, width / SHARE_IMAGE_WIDTH));
      setHeight(image.current?.offsetHeight ?? 0);
    };
    update();
    const observer = new ResizeObserver(update);
    if (frame.current) observer.observe(frame.current);
    if (image.current) observer.observe(image.current);
    return () => observer.disconnect();
  }, [open]);

  async function save() {
    const node = image.current?.firstElementChild as HTMLElement | null;
    if (!node) return;
    setState("saving");
    try {
      const { toBlob } = await import("html-to-image");
      const options = { pixelRatio: 2, backgroundColor: "#f4f8f8", width: node.offsetWidth, height: node.offsetHeight, cacheBust: true };
      // The first pass loads fonts into the clone; the second is the clean draw (Safari).
      await toBlob(node, options);
      const blob = await toBlob(node, options);
      if (!blob) throw new Error("empty image");
      // On phones, the share sheet sends the image straight to WhatsApp,
      // mail or photos; elsewhere it downloads.
      const file = new File([blob], `${fileName}.png`, { type: "image/png" });
      if (window.matchMedia?.("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
        } catch (error) {
          if ((error as Error).name !== "AbortError") throw error;
        }
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  return (
    <>
      <button type="button" onClick={() => { setState("idle"); setOpen(true); }}
        className="glass-secondary inline-flex min-h-10 items-center gap-2 px-4 text-sm font-medium">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" />
        </svg>
        {label}
      </button>
      {open && (
        <ModalDialog label={labels.dialogTitle} busy={state === "saving"} onClose={() => setOpen(false)}>
          <div className="w-full max-w-3xl rounded-3xl bg-white p-4 shadow-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{labels.dialogTitle}</h2>
              <button type="button" onClick={() => setOpen(false)} disabled={state === "saving"}
                className="rounded-full px-3 py-1.5 text-sm text-slate-600 hover:bg-black/5">{labels.close}</button>
            </div>
            {/* LTR box so the scaled image anchors at its left edge in either direction. */}
            <div ref={frame} dir="ltr" className="relative mt-4 overflow-hidden rounded-2xl border border-slate-200"
              style={{ height: height ? height * scale : undefined }}>
              <div ref={image} className="absolute left-0 top-0" style={{ width: SHARE_IMAGE_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                {children()}
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">{labels.privacyNote}</p>
            {state === "failed" && <p role="alert" className="mt-2 text-sm text-red-700">{labels.failed}</p>}
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => void save()} disabled={state === "saving"}
                className="glass-button inline-flex min-h-11 items-center px-6 text-[15px] font-medium">
                {state === "saving" ? labels.preparing : labels.download}
              </button>
            </div>
          </div>
        </ModalDialog>
      )}
    </>
  );
}
