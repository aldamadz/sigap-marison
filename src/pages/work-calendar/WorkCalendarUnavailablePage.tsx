import { CalendarClock } from "lucide-react";
import { Link } from "react-router";

const WorkCalendarUnavailablePage = () => (
  <main className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-2xl items-center px-5 py-10 sm:px-8">
    <section className="w-full border-y border-border py-10 sm:py-14" aria-labelledby="work-calendar-unavailable-title">
      <CalendarClock className="mb-5 h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-muted-foreground">Kalender Kerja</p>
      <h1 id="work-calendar-unavailable-title" className="mt-2 text-2xl font-semibold text-foreground">
        Sedang dikembangkan
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        Kalender Kerja masih dalam pengembangan dan pengujian di staging. Fitur ini belum digunakan di production.
      </p>
      <Link
        to="/dashboard"
        className="mt-7 inline-flex min-h-touch items-center text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80"
      >
        Kembali ke Dashboard
      </Link>
    </section>
  </main>
);

export default WorkCalendarUnavailablePage;
