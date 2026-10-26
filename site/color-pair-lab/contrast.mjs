export function normalizeHex(input) {
  if (typeof input !== "string") return null;
  const raw = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return "#" + raw.split("").map((part) => part + part).join("").toLowerCase();
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return "#" + raw.toLowerCase();
  return null;
}

function channels(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) throw new Error("Expected a valid 3- or 6-digit hex colour.");
  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16),
  ];
}

function linearChannel(value) {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex) {
  const [red, green, blue] = channels(hex).map(linearChannel);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first, second) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function evaluateContrast(foreground, background) {
  const ratio = contrastRatio(foreground, background);
  return {
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
    nonText: ratio >= 3,
  };
}

export function bestTextColor(background) {
  const blackRatio = contrastRatio("#000000", background);
  const whiteRatio = contrastRatio("#ffffff", background);
  return blackRatio >= whiteRatio
    ? { color: "#000000", ratio: blackRatio }
    : { color: "#ffffff", ratio: whiteRatio };
}

export function formatRatio(ratio) {
  return ratio.toFixed(2) + ":1";
}
