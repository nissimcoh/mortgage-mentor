# Privacy and terms readiness — 2026-10-08

Status: publication prepared and tested on 2026-10-09. The operator confirmed
public name ניסים כהן, entirely free service, and the existing Google support
email for website support/privacy. After the initial review rejection, the
operator also explicitly approved publishing that name/email in the public
GitHub repository. Commit 7bb702f has been deployed successfully by Vercel. This is not a legal opinion or certification of legal compliance.

## Implemented

- Hebrew/English privacy, terms and accessibility information pages, linked
  from the shared footer.
- Collection notices before Google sign-in and scenario save/update; notice
  next to copying a calculation link.
- Explicit explanation of account data, mortgage inputs/results, operator
  access, providers, cross-border processing, cookies, access/correction and
  deletion requests, shared URLs and PDFs.
- Mortgage limitations: no personal advice, bank approval or guaranteed future
  rates; official-source attribution does not imply affiliation/endorsement.
- Referrer-Policy: no-referrer prevents calculation URLs being propagated as
  Referer headers. It does not remove URLs from browser history, server logs,
  Google OAuth return parameters, or services to which users share links.
- No marketing tracker or analytics SDK was found in the application code.
  This does not audit independently configured hosting/provider analytics.
- No assertion of full accessibility compliance or an exemption. Save dialogs
  can scroll within the viewport after adding notices.

## Publication and review

- Operator name, website contact email and free business model are confirmed.
- Six bilingual legal pages render the approved contact and current date without
  draft notices; both sign-in pages expose the collection notice and links.
- Build/TypeScript and 588 automated tests passed (one optional network test
  skipped); lint has zero errors and seven pre-existing warnings.
- Publishing the contact in public source was explicitly approved after the
  initial automatic review rejection; the retry used that new authorization.
- Professional legal review remains recommended, particularly applicable
  privacy/security obligations and accessibility. It has not been performed.

## Operator follow-through

- Establish how contact requests are received, proportionately identity-checked,
  answered and recorded. Users can already delete their own saved scenarios;
  full account closure requires operator handling in Supabase. Do not claim a
  self-service account deletion feature or a fixed erasure SLA that does not exist.
- Confirm actual Supabase/Vercel regions, processor arrangements, subprocessors,
  retention of auth records, database backups and request logs, and cross-border
  transfer requirements. Select and implement a retention/deletion schedule;
  there is no automated account-expiry schedule verified in this audit.
- Review admin membership, MFA, access logging and incident response. Listing
  these tasks does not certify that an independent security audit was performed.
- Complete accessibility assessment, including keyboard focus in dialogs,
  screen readers, mobile tables, graphs, contrast and PDF output. Update the
  accessibility page with verified findings and measures.
- If advertising, analytics, payments or mailing are later introduced, review
  disclosure and consent requirements before enabling them.

## Google sign-in branding (separate outstanding request)

Google Auth Platform Branding and brand verification control the displayed
application name/logo. App code cannot replace the provider's consent identity.
These legal pages can support that verification once completed and published.
No Google console changes have been made. Browser administration was blocked
by automatic review under the user's earlier no-manual-testing instruction;
the user subsequently chose to update the Google console personally using
instructions, so do not operate that console on their behalf.

## Primary references reviewed

- Israeli Privacy Protection Authority, collection notice guidance:
  https://www.gov.il/BlobFolder/legalinfo/duty_to_notify/he/notify13.pdf
- Privacy Protection Authority, Amendment 13 Q&A:
  https://www.gov.il/he/pages/tikun13_qa
- Privacy Protection Authority, right of access:
  https://www.gov.il/BlobFolder/reports/right_to_access2023/he/The%20right%20to%20access.pdf
- Commission for Equal Rights of Persons with Disabilities, web accessibility:
  https://www.gov.il/he/pages/website_accessibility
- Supabase, Google sign-in branding:
  https://supabase.com/docs/guides/auth/social-login/auth-google
