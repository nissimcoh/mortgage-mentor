import LegalPage, { legalMetadata, type LegalPageProps } from "@/components/LegalPage";

export const generateMetadata = (props: LegalPageProps) => legalMetadata("terms", props);
export default function TermsPage(props: LegalPageProps) {
  return <LegalPage {...props} kind="terms" />;
}
