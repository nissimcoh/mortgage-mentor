/**
 * Categorical colors for mortgage tracks, in fixed order (track 1 is always
 * the first slot). Validated as an adjacent-pair palette on the light
 * surface with the dataviz palette validator: chroma, CVD separation,
 * normal-vision floor and 3:1 contrast all pass. Slot 1 is a slightly more
 * saturated sibling of the brand teal so it clears the chroma floor.
 */
export const TRACK_COLORS = ["#00897b", "#b8862e", "#2a78d6", "#e34948", "#6250d6"] as const;
