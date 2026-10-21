export function isValidCard(card) {
  return !!card &&
    typeof card === "object" &&
    !Array.isArray(card) &&
    typeof card.id === "string" && card.id.length > 0 &&
    typeof card.question === "string" && card.question.trim().length > 0 &&
    typeof card.answer === "string" && card.answer.trim().length > 0 &&
    typeof card.tag === "string" &&
    Number.isFinite(card.dueAt) &&
    Number.isFinite(card.interval) && card.interval >= 0 &&
    Number.isFinite(card.ease) && card.ease >= 1 &&
    Number.isInteger(card.reps) && card.reps >= 0;
}

export function parseCardStorage(raw) {
  if (raw === null) return { state: "ready", cards: [], raw: null };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isValidCard)) {
      return { state: "corrupt", cards: [], raw };
    }
    return { state: "ready", cards: parsed, raw };
  } catch {
    return { state: "corrupt", cards: [], raw };
  }
}

export function readReviewCount(raw) {
  const value = Number(raw ?? 0);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function canDiscardCorruptData(state, rawDownloaded, confirmed) {
  return state === "corrupt" && rawDownloaded === true && confirmed === true;
}
