"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import {
  bestTextColor,
  contrastRatio,
  evaluateContrast,
  formatRatio,
  normalizeHex,
} from "./contrast";

type SavedPair = {
  id: string;
  name: string;
  foreground: string;
  background: string;
};

const STORAGE_KEY = "nexa-color-pair-lab-v1";
const DEFAULT_FOREGROUND = "#1f2937";
const DEFAULT_BACKGROUND = "#f8fafc";

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function ColorPairLabPage() {
  const [foreground, setForeground] = useState(DEFAULT_FOREGROUND);
  const [background, setBackground] = useState(DEFAULT_BACKGROUND);
  const [pairName, setPairName] = useState("My colour pair");
  const [saved, setSaved] = useState<SavedPair[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const valid = parsed.filter((item): item is SavedPair =>
        !!item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.foreground === "string" &&
        typeof item.background === "string" &&
        normalizeHex(item.foreground) !== null &&
        normalizeHex(item.background) !== null
      );
      setSaved(valid);
    } catch {
      setStatus("Saved pairs could not be read. Your current colours are still available.");
    }
  }, []);

  const fg = normalizeHex(foreground);
  const bg = normalizeHex(background);
  const validPair = Boolean(fg && bg);
  const ratio = useMemo(
    () => (fg && bg ? contrastRatio(fg, bg) : null),
    [fg, bg]
  );
  const checks = useMemo(
    () => (fg && bg ? evaluateContrast(fg, bg) : null),
    [fg, bg]
  );
  const recommendation = useMemo(
    () => (bg ? bestTextColor(bg) : null),
    [bg]
  );

  function persist(next: SavedPair[]) {
    setSaved(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStatus("Saved in this browser only.");
    } catch {
      setStatus("Browser storage is unavailable. Export your pairs to keep a backup.");
    }
  }

  function savePair() {
    if (!fg || !bg) {
      setStatus("Enter valid hex colours before saving.");
      return;
    }
    const record: SavedPair = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now()) + "-" + String(Math.random()).slice(2),
      name: pairName.trim() || "Untitled pair",
      foreground: fg,
      background: bg,
    };
    persist([record, ...saved].slice(0, 50));
  }

  async function copyCss() {
    if (!fg || !bg) {
      setStatus("Correct the hex colours before copying CSS.");
      return;
    }
    const css = ":root {\n  --pair-text: " + fg + ";\n  --pair-background: " + bg + ";\n}";
    try {
      await navigator.clipboard.writeText(css);
      setStatus("CSS variables copied.");
    } catch {
      downloadText("color-pair.css", css + "\n", "text/css;charset=utf-8");
      setStatus("Clipboard unavailable; downloaded the CSS instead.");
    }
  }

  function exportJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      current: fg && bg ? { name: pairName, foreground: fg, background: bg } : null,
      savedPairs: saved,
    };
    downloadText("color-pair-lab.json", JSON.stringify(payload, null, 2), "application/json");
    setStatus("JSON export created.");
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="Nexa Forge home">
          <span className={styles.brandMark}>N</span>
          <span><strong>NEXA FORGE</strong><small>DESIGN TOOLS</small></span>
        </a>
        <span className={styles.localBadge}><span /> LOCAL-FIRST TOOL</span>
      </header>

      <section className={styles.hero}>
        <p className={styles.kicker}>ACCESSIBILITY · COLOUR SYSTEMS</p>
        <h1>Good colour.<br /><em>Clear contrast.</em></h1>
        <p className={styles.intro}>
          Check a foreground and background pair against WCAG contrast thresholds.
          Preview it, improve it, and export the tokens—without sending colours to a server.
        </p>
      </section>

      <section className={styles.workspace} aria-label="Colour contrast workspace">
        <div className={styles.controls}>
          <div className={styles.panelHeading}>
            <div><span className={styles.step}>01 / INPUT</span><h2>Build your pair</h2></div>
            <button className={styles.subtleButton} type="button" onClick={() => {
              setForeground(DEFAULT_FOREGROUND);
              setBackground(DEFAULT_BACKGROUND);
              setStatus("Default pair restored.");
            }}>Reset</button>
          </div>

          <label className={styles.fieldLabel} htmlFor="pair-name">Pair name</label>
          <input id="pair-name" className={styles.textInput} value={pairName} maxLength={60} onChange={(event) => setPairName(event.target.value)} />

          <div className={styles.colorFields}>
            <div className={styles.colorField}>
              <label className={styles.fieldLabel} htmlFor="foreground-hex">Text / foreground</label>
              <div className={styles.colorInputRow}>
                <input aria-label="Choose foreground colour" type="color" value={fg ?? DEFAULT_FOREGROUND} onChange={(event) => setForeground(event.target.value)} />
                <input id="foreground-hex" className={styles.hexInput} value={foreground} maxLength={7} spellCheck={false} onChange={(event) => setForeground(event.target.value)} aria-describedby="foreground-help" />
              </div>
              <small id="foreground-help" className={fg ? styles.validHint : styles.errorHint}>{fg ? "Valid hex colour" : "Use #RGB or #RRGGBB"}</small>
            </div>
            <div className={styles.colorField}>
              <label className={styles.fieldLabel} htmlFor="background-hex">Background</label>
              <div className={styles.colorInputRow}>
                <input aria-label="Choose background colour" type="color" value={bg ?? DEFAULT_BACKGROUND} onChange={(event) => setBackground(event.target.value)} />
                <input id="background-hex" className={styles.hexInput} value={background} maxLength={7} spellCheck={false} onChange={(event) => setBackground(event.target.value)} aria-describedby="background-help" />
              </div>
              <small id="background-help" className={bg ? styles.validHint : styles.errorHint}>{bg ? "Valid hex colour" : "Use #RGB or #RRGGBB"}</small>
            </div>
          </div>

          <div className={styles.recommendation}>
            <div className={styles.recommendationDot} />
            <div>
              <strong>Quick readability fix</strong>
              <p>{recommendation ? "Try " + recommendation.color + " text on your current background for " + formatRatio(recommendation.ratio) + " contrast." : "Enter a valid background colour to get a suggestion."}</p>
            </div>
            <button type="button" disabled={!recommendation} onClick={() => {
              if (recommendation) {
                setForeground(recommendation.color);
                setStatus("Recommended foreground applied.");
              }
            }}>Apply</button>
          </div>

          <div className={styles.actionRow}>
            <button className={styles.primaryButton} type="button" onClick={savePair}>Save pair</button>
            <button className={styles.secondaryButton} type="button" onClick={copyCss}>Copy CSS</button>
            <button className={styles.secondaryButton} type="button" onClick={exportJson}>Export JSON</button>
          </div>
          <p className={styles.status} role="status" aria-live="polite">{status || "Your colours stay in this browser unless you export them."}</p>
        </div>

        <div className={styles.previewPanel}>
          <div className={styles.panelHeading}>
            <div><span className={styles.step}>02 / PREVIEW</span><h2>Read it in context</h2></div>
            <span className={styles.previewLabel}>LIVE</span>
          </div>
          <div className={styles.previewCard} style={{ backgroundColor: bg ?? DEFAULT_BACKGROUND, color: fg ?? DEFAULT_FOREGROUND }}>
            <div className={styles.previewTopline}><span>THE DAILY NOTE</span><span>03 MIN READ</span></div>
            <p className={styles.previewEyebrow}>A LITTLE CLARITY GOES A LONG WAY</p>
            <h3>Make every word easy to see.</h3>
            <p className={styles.previewBody}>Strong contrast helps people read your interface in different lighting, on different screens, and with different visual needs.</p>
            <span className={styles.previewLink} style={{ borderColor: fg ?? DEFAULT_FOREGROUND }}>Read the guide <span aria-hidden="true">↗</span></span>
          </div>

          <div className={styles.ratioBlock}>
            <div><span className={styles.step}>CONTRAST RATIO</span><strong>{validPair && ratio !== null ? formatRatio(ratio) : "—"}</strong></div>
            <span className={validPair && ratio !== null && ratio >= 4.5 ? styles.passPill : styles.failPill}>{!validPair ? "CHECK INPUT" : ratio !== null && ratio >= 4.5 ? "AA NORMAL PASS" : "AA NORMAL FAIL"}</span>
          </div>

          <div className={styles.checkList} aria-label="WCAG contrast results">
            {[
              { label: "AA · Normal text", detail: "4.5:1 minimum", pass: checks?.aaNormal },
              { label: "AA · Large text", detail: "3:1 minimum", pass: checks?.aaLarge },
              { label: "AAA · Normal text", detail: "7:1 minimum", pass: checks?.aaaNormal },
              { label: "AAA · Large text", detail: "4.5:1 minimum", pass: checks?.aaaLarge },
              { label: "Non-text UI contrast", detail: "3:1 reference", pass: checks?.nonText },
            ].map((item) => (
              <div className={styles.checkRow} key={item.label}>
                <div><strong>{item.label}</strong><small>{item.detail}</small></div>
                <span className={item.pass ? styles.passPill : styles.failPill}>{!validPair ? "INVALID" : item.pass ? "PASS" : "FAIL"}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.savedSection}>
        <div className={styles.panelHeading}>
          <div><span className={styles.step}>03 / LIBRARY</span><h2>Saved pairs <span className={styles.count}>{saved.length}</span></h2></div>
          <button className={styles.subtleButton} type="button" disabled={!saved.length} onClick={() => {
            downloadText("color-pair-lab.json", JSON.stringify({ savedPairs: saved }, null, 2), "application/json");
            setStatus("Saved pairs exported.");
          }}>Export library</button>
        </div>
        {saved.length === 0 ? (
          <div className={styles.emptyState}><span className={styles.emptyIcon}>◒</span><p>No saved pairs yet. Save a combination to keep it in this browser.</p></div>
        ) : (
          <div className={styles.savedGrid}>
            {saved.map((item) => (
              <article className={styles.savedCard} key={item.id}>
                <div className={styles.swatches}><span style={{ backgroundColor: item.foreground }} /><span style={{ backgroundColor: item.background }} /></div>
                <div className={styles.savedInfo}><strong>{item.name}</strong><small>{item.foreground.toUpperCase()} on {item.background.toUpperCase()}</small><small>{formatRatio(contrastRatio(item.foreground, item.background))} contrast</small></div>
                <div className={styles.savedActions}>
                  <button type="button" onClick={() => {
                    setForeground(item.foreground);
                    setBackground(item.background);
                    setPairName(item.name);
                    setStatus("Saved pair loaded.");
                  }}>Load</button>
                  <button type="button" aria-label={"Delete " + item.name} onClick={() => persist(saved.filter((entry) => entry.id !== item.id))}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className={styles.footer}>
        <p><strong>Built for clearer interfaces.</strong> Colour checks are a useful design aid, not a complete accessibility audit.</p>
        <a href="https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html" target="_blank" rel="noreferrer">Read the WCAG guidance ↗</a>
      </footer>
    </main>
  );
}
