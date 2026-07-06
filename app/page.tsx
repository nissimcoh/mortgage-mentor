export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col items-start justify-center px-6 py-16">
        <div className="mb-6 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">
          גרסת פיתוח ראשונית
        </div>

        <h1 className="mb-6 text-5xl font-bold tracking-tight sm:text-6xl">
          MortgageMentor
        </h1>

        <p className="mb-4 max-w-2xl text-2xl font-semibold text-slate-800">
          כלי סימולציה חכם להבנת משכנתאות בישראל
        </p>

        <p className="mb-10 max-w-3xl text-lg leading-8 text-slate-600">
          המטרה של המערכת היא לעזור לזוגות ויחידים להבין כמה משכנתא הם צריכים,
          מה צפוי להיות ההחזר החודשי, איך מסלולים שונים משפיעים על הסיכון,
          ואילו שאלות כדאי לשאול לפני שפונים לבנק.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          <a
            href="/calculator"
            className="rounded-xl bg-slate-900 px-6 py-3 text-center text-white transition hover:bg-slate-700"
          >
            התחל מחשבון משכנתא
          </a>

          <a
            href="#about"
            className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-center text-slate-900 transition hover:bg-slate-100"
          >
            מה המערכת תעשה?
          </a>
        </div>

        <div
          id="about"
          className="mt-16 grid w-full gap-4 md:grid-cols-3"
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-xl font-bold">חישוב החזר חודשי</h2>
            <p className="leading-7 text-slate-600">
              חישוב ראשוני של החזר חודשי לפי סכום הלוואה, ריבית ותקופה.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-xl font-bold">השוואת תמהילים</h2>
            <p className="leading-7 text-slate-600">
              בהמשך נוסיף השוואה בין קל״צ, פריים, משתנה וצמוד מדד.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-xl font-bold">סימולציית סיכון</h2>
            <p className="leading-7 text-slate-600">
              נבדוק מה קורה להחזר אם הריבית עולה או אם המדד משתנה.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}