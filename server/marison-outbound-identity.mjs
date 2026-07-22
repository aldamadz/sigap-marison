const normalizedText = (value) => String(value ?? "").trim();

export const resolveMarisonOutboundNik = ({
  environment,
  stagingOverride,
  candidates = [],
}) => {
  const override = normalizedText(environment).toLowerCase() === "staging"
    ? normalizedText(stagingOverride)
    : "";
  if (override) return override;
  return candidates.map(normalizedText).find(Boolean) || "";
};
