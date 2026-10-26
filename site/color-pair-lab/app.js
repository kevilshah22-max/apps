import { bestTextColor, contrastRatio, evaluateContrast, formatRatio, normalizeHex } from "./contrast.mjs";

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "nexa-color-pair-lab-v1";
const DEFAULT_FOREGROUND = "#1f2937";
const DEFAULT_BACKGROUND = "#f8fafc";
const state = { foreground: DEFAULT_FOREGROUND, background: DEFAULT_BACKGROUND, saved: [], recoveryData: null, recoveryExported: false, storageBlocked: false };

const foregroundColor = $("foreground-color");
const foregroundHex = $("foreground-hex");
const backgroundColor = $("background-color");
const backgroundHex = $("background-hex");
const statusNode = $("status");
const previewCard = $("preview-card");
const previewLink = $("preview-link");
const recoveryBanner = $("recovery-banner");

function setStatus(message) {
  statusNode.textContent = message;
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isSavedPair(item) {
  return typeof item === "object" && item !== null &&
    typeof item.id === "string" && typeof item.name === "string" &&
    typeof item.foreground === "string" && normalizeHex(item.foreground) !== null &&
    typeof item.background === "string" && normalizeHex(item.background) !== null;
}

function readSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      state.recoveryData = raw;
      setStatus("Saved data is unreadable. Export the original before choosing to reset the library.");
      return;
    }
    if (!Array.isArray(parsed)) {
      state.recoveryData = raw;
      setStatus("Saved data has an unexpected format. Export the original before choosing to reset the library.");
      return;
    }
    state.saved = parsed.filter(isSavedPair);
    if (state.saved.length !== parsed.length) {
      state.recoveryData = raw;
      setStatus("Some saved entries are invalid. Editing is paused until the original data is exported and reset is confirmed.");
    }
  } catch {
    state.storageBlocked = true;
    setStatus("Browser storage could not be read. Saving is paused; check browser storage permissions and retry.");
  }
}

function persist(next) {
  if (state.recoveryData !== null || state.storageBlocked) {
    setStatus("Saving is paused until the saved-library recovery issue is resolved.");
    renderRecovery();
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    state.saved = next;
    setStatus("Saved in this browser only.");
  } catch {
    state.saved = next;
    setStatus("Browser storage could not save this change. Export the library now to keep a copy.");
  }
  renderSaved();
}

function renderChecks() {
  const host = $("checks");
  host.replaceChildren();
  const fg = normalizeHex(state.foreground);
  const bg = normalizeHex(state.background);
  const definitions = [
    ["AA · Normal text", "4.5:1 minimum", "aaNormal"],
    ["AA · Large text", "3:1 minimum", "aaLarge"],
    ["AAA · Normal text", "7:1 minimum", "aaaNormal"],
    ["AAA · Large text", "4.5:1 minimum", "aaaLarge"],
    ["Non-text contrast reference", "3:1 reference", "nonText"],
  ];
  const checks = fg && bg ? evaluateContrast(fg, bg) : null;
  for (const [label, detail, key] of definitions) {
    const row = document.createElement("div");
    row.className = "check-row";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = label;
    const note = document.createElement("small");
    note.textContent = detail;
    copy.append(title, note);
    const pill = document.createElement("span");
    const passed = checks ? checks[key] : false;
    pill.className = !checks ? "fail-pill" : passed ? "pass-pill" : "fail-pill";
    pill.textContent = !checks ? "INVALID" : passed ? "PASS" : "FAIL";
    row.append(copy, pill);
    host.append(row);
  }
}

function renderSaved() {
  const host = $("saved-list");
  host.replaceChildren();
  $("saved-count").textContent = String(state.saved.length);
  $("export-library").disabled = state.saved.length === 0;
  if (!state.saved.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "◒";
    const message = document.createElement("p");
    message.textContent = "No saved pairs yet. Save a combination to keep it in this browser.";
    empty.append(icon, message);
    host.append(empty);
    return;
  }
  for (const pair of state.saved) {
    const card = document.createElement("article");
    card.className = "saved-card";
    const swatches = document.createElement("div");
    swatches.className = "swatches";
    const foregroundSwatch = document.createElement("span");
    foregroundSwatch.style.backgroundColor = normalizeHex(pair.foreground);
    const backgroundSwatch = document.createElement("span");
    backgroundSwatch.style.backgroundColor = normalizeHex(pair.background);
    swatches.append(foregroundSwatch, backgroundSwatch);
    const info = document.createElement("div");
    info.className = "saved-info";
    const title = document.createElement("strong");
    title.textContent = pair.name;
    const colours = document.createElement("small");
    colours.textContent = pair.foreground.toUpperCase() + " on " + pair.background.toUpperCase();
    const ratio = document.createElement("small");
    ratio.textContent = formatRatio(contrastRatio(pair.foreground, pair.background)) + " contrast";
    info.append(title, colours, ratio);
    const actions = document.createElement("div");
    actions.className = "saved-actions";
    const load = document.createElement("button");
    load.type = "button";
    load.textContent = "Load";
    load.addEventListener("click", () => {
      state.foreground = pair.foreground;
      state.background = pair.background;
      $("pair-name").value = pair.name;
      syncInputs();
      renderPreview();
      renderChecks();
      setStatus("Saved pair loaded.");
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", "Delete " + pair.name);
    remove.addEventListener("click", () => persist(state.saved.filter((entry) => entry.id !== pair.id)));
    actions.append(load, remove);
    card.append(swatches, info, actions);
    host.append(card);
  }
}

function renderRecovery() {
  const active = state.recoveryData !== null || state.storageBlocked;
  recoveryBanner.hidden = !active;
  $("download-recovery").hidden = state.recoveryData === null;
  $("discard-recovery").hidden = state.recoveryData === null;
  $("retry-storage").hidden = !(state.storageBlocked && state.recoveryData === null);
  $("discard-recovery").disabled = !state.recoveryExported;
  $("recovery-message").textContent = state.storageBlocked && state.recoveryData === null
    ? "Browser storage could not be read. Saving is paused to avoid replacing data unexpectedly. Retry after checking browser storage permissions."
    : "Some saved data could not be validated. The original is preserved in memory; download it before explicitly discarding the unreadable library.";
}

function syncInputs() {
  const fg = normalizeHex(state.foreground);
  const bg = normalizeHex(state.background);
  foregroundHex.value = state.foreground;
  backgroundHex.value = state.background;
  foregroundColor.value = fg || DEFAULT_FOREGROUND;
  backgroundColor.value = bg || DEFAULT_BACKGROUND;
  $("foreground-help").textContent = fg ? "Valid hex colour" : "Use #RGB or #RRGGBB";
  $("foreground-help").classList.toggle("invalid", !fg);
  $("background-help").textContent = bg ? "Valid hex colour" : "Use #RGB or #RRGGBB";
  $("background-help").classList.toggle("invalid", !bg);
}

function renderPreview() {
  const fg = normalizeHex(state.foreground);
  const bg = normalizeHex(state.background);
  const ratioNode = $("ratio");
  const verdict = $("verdict");
  if (!fg || !bg) {
    ratioNode.textContent = "—";
    verdict.className = "fail-pill";
    verdict.textContent = "CHECK INPUT";
    previewCard.style.color = fg || DEFAULT_FOREGROUND;
    previewCard.style.backgroundColor = bg || DEFAULT_BACKGROUND;
    previewLink.style.borderColor = fg || DEFAULT_FOREGROUND;
    $("recommendation-text").textContent = bg ? "Enter a valid foreground colour." : "Enter a valid background colour.";
    $("apply-recommendation").disabled = !bg;
    return;
  }
  const ratio = contrastRatio(fg, bg);
  const recommendation = bestTextColor(bg);
  previewCard.style.color = fg;
  previewCard.style.backgroundColor = bg;
  previewLink.style.borderColor = fg;
  ratioNode.textContent = formatRatio(ratio);
  verdict.className = ratio >= 4.5 ? "pass-pill" : "fail-pill";
  verdict.textContent = ratio >= 4.5 ? "AA NORMAL PASS" : "AA NORMAL FAIL";
  $("recommendation-text").textContent = "Try " + recommendation.color + " text on this background for " + formatRatio(recommendation.ratio) + " contrast.";
  $("apply-recommendation").disabled = false;
}

function render() {
  syncInputs();
  renderPreview();
  renderChecks();
  renderSaved();
  renderRecovery();
}

function savePair() {
  if (state.recoveryData !== null || state.storageBlocked) {
    setStatus("Resolve the saved-library recovery warning before saving new pairs.");
    return;
  }
  const foreground = normalizeHex(state.foreground);
  const background = normalizeHex(state.background);
  if (!foreground || !background) {
    setStatus("Enter valid hex colours before saving.");
    return;
  }
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : String(Date.now()) + "-" + String(Math.random()).slice(2);
  const pair = { id, name: $("pair-name").value.trim() || "Untitled pair", foreground, background };
  persist([pair, ...state.saved].slice(0, 50));
}

function exportJson() {
  const foreground = normalizeHex(state.foreground);
  const background = normalizeHex(state.background);
  downloadText("color-pair-lab.json", JSON.stringify({
    exportedAt: new Date().toISOString(),
    current: foreground && background ? { name: $("pair-name").value, foreground, background } : null,
    savedPairs: state.saved,
  }, null, 2), "application/json");
  setStatus("JSON export created.");
}

async function copyCss() {
  const foreground = normalizeHex(state.foreground);
  const background = normalizeHex(state.background);
  if (!foreground || !background) {
    setStatus("Correct the hex colours before copying CSS.");
    return;
  }
  const css = ":root {\n  --pair-text: " + foreground + ";\n  --pair-background: " + background + ";\n}";
  try {
    await navigator.clipboard.writeText(css);
    setStatus("CSS variables copied.");
  } catch {
    downloadText("color-pair.css", css + "\n", "text/css;charset=utf-8");
    setStatus("Clipboard unavailable; downloaded the CSS instead.");
  }
}

$("foreground-hex").addEventListener("input", (event) => {
  state.foreground = event.currentTarget.value;
  foregroundColor.value = normalizeHex(state.foreground) || DEFAULT_FOREGROUND;
  $("foreground-help").textContent = normalizeHex(state.foreground) ? "Valid hex colour" : "Use #RGB or #RRGGBB";
  $("foreground-help").classList.toggle("invalid", !normalizeHex(state.foreground));
  renderPreview();
  renderChecks();
});
$("background-hex").addEventListener("input", (event) => {
  state.background = event.currentTarget.value;
  backgroundColor.value = normalizeHex(state.background) || DEFAULT_BACKGROUND;
  $("background-help").textContent = normalizeHex(state.background) ? "Valid hex colour" : "Use #RGB or #RRGGBB";
  $("background-help").classList.toggle("invalid", !normalizeHex(state.background));
  renderPreview();
  renderChecks();
});
foregroundColor.addEventListener("input", () => {
  state.foreground = foregroundColor.value;
  syncInputs();
  renderPreview();
  renderChecks();
});
backgroundColor.addEventListener("input", () => {
  state.background = backgroundColor.value;
  syncInputs();
  renderPreview();
  renderChecks();
});
$("apply-recommendation").addEventListener("click", () => {
  const background = normalizeHex(state.background);
  if (!background) return;
  state.foreground = bestTextColor(background).color;
  syncInputs();
  renderPreview();
  renderChecks();
  setStatus("Recommended foreground applied.");
});
$("reset").addEventListener("click", () => {
  state.foreground = DEFAULT_FOREGROUND;
  state.background = DEFAULT_BACKGROUND;
  $("pair-name").value = "My colour pair";
  render();
  setStatus("Default pair restored.");
});
$("save-pair").addEventListener("click", savePair);
$("copy-css").addEventListener("click", copyCss);
$("export-json").addEventListener("click", exportJson);
$("export-library").addEventListener("click", () => {
  downloadText("color-pair-lab-library.json", JSON.stringify({ savedPairs: state.saved }, null, 2), "application/json");
  setStatus("Saved library exported.");
});
$("download-recovery").addEventListener("click", () => {
  if (state.recoveryData === null) return;
  downloadText("color-pair-lab-recovery.txt", state.recoveryData, "text/plain;charset=utf-8");
  state.recoveryExported = true;
  $("discard-recovery").disabled = false;
  setStatus("Original saved data exported. You may now explicitly discard the unreadable library.");
});
$("discard-recovery").addEventListener("click", () => {
  if (state.recoveryData === null || !state.recoveryExported) return;
  if (!window.confirm("Discard the unreadable saved library? The recovery copy has been downloaded. This cannot be undone from this browser.")) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    state.saved = [];
    state.recoveryData = null;
    state.recoveryExported = false;
    state.storageBlocked = false;
    render();
    setStatus("Saved library reset. You can now save new colour pairs.");
  } catch {
    setStatus("Browser storage could not be reset. The recovery warning remains active.");
  }
});
$("retry-storage").addEventListener("click", () => window.location.reload());

readSaved();
render();
