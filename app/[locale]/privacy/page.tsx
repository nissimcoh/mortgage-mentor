import LegalPage, { legalMetadata, type LegalPageProps } from "@/components/LegalPage";

export const generateMetadata = (props: LegalPageProps) => legalMetadata("privacy", props);
export default function PrivacyPage(props: LegalPageProps) {
  return <LegalPage {...props} kind="privacy" />;
}
