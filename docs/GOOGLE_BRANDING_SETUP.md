# Google sign-in branding — owner setup

Updated 2026-10-09. The owner chose to edit Google settings personally.
No Google console settings have been changed by the coding agent.

Automated checks confirm the configured sign-in endpoint redirects to
accounts.google.com, uses the default Supabase callback domain, and requests
email/profile. This is not a complete authenticated login test and does not
reveal the current draft/published Google branding settings.

## Prepare the website contact details

The operator approved the public name **ניסים כהן** and confirmed that all
current services are free. The user approved the existing Google support email for public website use
and separately approved publishing it in the public source repository. No new
mailbox, paid email service or custom domain was created.

The privacy, terms and accessibility pages are now published in Hebrew and
English with operator/contact details. The URLs below can be used in the
Google configuration. Screenshots supplied by the owner show the OAuth app
is currently in Testing, so the Audience/publishing setup still needs review.

## Google Auth Platform

1. Open https://console.cloud.google.com/auth/branding and select the existing
   project whose OAuth client is configured in Supabase Authentication →
   Sign In / Providers → Google. Use that existing client/project.
2. Set **App name** to **MortgageMentor**. Select a monitored **User support
   email** and set the developer contact details. Google restricts the support
   email dropdown to eligible Google accounts/groups; a newly created mailbox
   is not automatically an available option. Follow Google's instructions for
   the chosen account/group rather than changing the OAuth client.
3. Once the site pages are live, enter:

   | Field | URL |
   | --- | --- |
   | Application home page | https://mortgage-mentor-fawn.vercel.app/he |
   | Privacy policy | https://mortgage-mentor-fawn.vercel.app/he/privacy |
   | Terms of service | https://mortgage-mentor-fawn.vercel.app/he/terms |

4. Complete the branding verification flow shown by Google. Google requires
   ownership verification of the relevant domains. Whether the current Vercel
   deployment domain can meet this project's verification requirements has not
   been checked in the console. Do not claim ownership of vercel.app or
   supabase.co. If a domain verification issue appears, resolve that specific
   issue before submitting; a domain controlled by the operator may be needed.
5. After approval / **Ready to publish**, use **Publish branding**. A saved
   draft is not the public consent-screen identity. Google notes that compliant
   verification results are valid for seven days before reverification is needed.
6. Manually open the site's Google sign-in flow and confirm the brand users
   actually see. If it still displays the project identifier, check Published
   Branding and that the edited project's client matches Supabase's configured
   client. Authentication callback URLs and keys need not be changed just to
   edit branding.

## Official references

- https://support.google.com/cloud/answer/15549049?hl=en
- https://support.google.com/cloud/answer/13464321?hl=en
- https://supabase.com/docs/guides/auth/social-login/auth-google
