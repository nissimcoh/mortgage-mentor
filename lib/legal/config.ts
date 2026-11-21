// Fill only with details explicitly approved by the operator for publication.
// Do not infer contact details from Git, OAuth metadata or a private allowlist.
export const legalOperator: { name: string; email: string } = {
  name: "ניסים כהן",
  email: "nissssssim@gmail.com",
};

export const legalDetailsComplete = Boolean(legalOperator.name && legalOperator.email);
export const legalUpdatedAt = {
  privacy: "2026-11-21",
  terms: "2026-11-21",
  accessibility: "2026-11-17",
};
