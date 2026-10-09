import LegalPage, { legalMetadata, type LegalPageProps } from "@/components/LegalPage";

export const generateMetadata = (props: LegalPageProps) => legalMetadata("accessibility", props);
export default function AccessibilityPage(props: LegalPageProps) {
  return <LegalPage {...props} kind="accessibility" />;
}
