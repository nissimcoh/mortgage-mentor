"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import type { MortgagePrintReportProps } from "./MortgagePrintReport";
import type MortgagePrintReport from "./MortgagePrintReport";

export default function ExportMortgagePdfButton(props: Omit<MortgagePrintReportProps, "generatedAt"> & { disabled?: boolean }) {
  const [report, setReport] = useState<{ Component: typeof MortgagePrintReport; generatedAt: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [failed, setFailed] = useState(false);
  const oldTitle = useRef<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const cleanup = () => {
      document.body.classList.remove("mortgage-printing");
      if (oldTitle.current !== null) document.title = oldTitle.current;
      oldTitle.current = null;
    };
    const afterPrint = () => { cleanup(); setReport(null); setPreparing(false); };
    window.addEventListener("afterprint", afterPrint);
    return () => { mounted.current = false; cleanup(); window.removeEventListener("afterprint", afterPrint); };
  }, []);

  async function print() {
    setPreparing(true);
    setFailed(false);
    try {
      // Load report markup only on demand; no PDF library or extra server request.
      const [{ default: Component }] = await Promise.all([import("./MortgagePrintReport"), document.fonts.ready]);
      if (!mounted.current) return;
      flushSync(() => setReport({ Component, generatedAt: new Date().toISOString() }));
      oldTitle.current = document.title;
      document.title = "MortgageMentor-summary";
      document.body.classList.add("mortgage-printing");
      window.print();
      setPreparing(false);
    } catch {
      document.body.classList.remove("mortgage-printing");
      if (oldTitle.current !== null) document.title = oldTitle.current;
      oldTitle.current = null;
      setReport(null); setPreparing(false); setFailed(true);
    }
  }

  return <div>
    <button type="button" onClick={print} disabled={props.disabled || preparing} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50">
      {preparing ? props.labels.pdfPrinting : props.labels.pdfButton}
    </button>
    {failed && <p role="alert" className="mt-1 text-xs text-red-700">{props.labels.pdfError}</p>}
    {report && createPortal(<report.Component {...props} generatedAt={report.generatedAt} />, document.body)}
  </div>;
}
