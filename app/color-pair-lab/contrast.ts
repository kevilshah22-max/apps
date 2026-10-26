export type ContrastChecks = {
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
  nonText: boolean;
};

export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return "#" + raw.split("").map((part) => part + part).join("").toLowerCase();
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return "#" + raw.toLowerCase();
  return null;
}

function channels(hex: string): [number, number, number] {
  const normalized = normalizeHex(hex);
  if (!normalized) throw new Error("Expected a valid 3- or 6-digit hex colour.");
  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16),
  ];
}

function linearChannel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const [red, green, blue] = channels(hex).map(linearChannel);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export function evaluateContrast(foreground: string, background: string): ContrastChecks {
  const ratio = contrastRatio(foreground, background);
  return {
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
    nonText: ratio >= 3,
  };
}

export function bestTextColor(background: string): { color: string; ratio: number } {
  const blackRatio = contrastRatio("#000000", background);
  const whiteRatio = contrastRatio("#ffffff", background);
  return blackRatio >= whiteRatio
    ? { color: "#000000", ratio: blackRatio }
    : { color: "#ffffff", ratio: whiteRatio };
}

export function formatRatio(ratio: number): string {
  return ratio.toFixed(2) + ":1";
}
