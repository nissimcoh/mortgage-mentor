import { notFound } from "next/navigation";

/** Any unmatched URL under a locale renders that locale's not-found page
 * (inside the normal header/footer layout) instead of the bare default. */
export default function MissingPage() {
  notFound();
}
