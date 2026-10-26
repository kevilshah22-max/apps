/**
 * MarketMind data-integrity gate for imported OHLCV bars.
 * Does not verify vendor authenticity or corporate-action adjustments.
 */
export function validateOHLCV(input, options = {}) {
  const bars = Array.isArray(input) ? input : [];
  const issues = [], seen = new Set(); let invalid = 0, duplicates = 0;
  const clean = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i] || {};
    const time = String(b.time ?? b.timestamp ?? b.date ?? "");
    const row = { time, open: Number(b.open), high: Number(b.high), low: Number(b.low), close: Number(b.close), volume: b.volume == null || b.volume === "" ? null : Number(b.volume) };
    if (!time || ![row.open,row.high,row.low,row.close].every(Number.isFinite) || row.open <= 0 || row.close <= 0 || row.high < Math.max(row.open,row.close) || row.low > Math.min(row.open,row.close) || row.high < row.low || (row.volume !== null && (!Number.isFinite(row.volume) || row.volume < 0))) { invalid++; continue; }
    if (seen.has(time)) { duplicates++; continue; }
    seen.add(time); clean.push(row);
  }
  const ordered = [...clean].sort((a,b) => { const x=Date.parse(a.time), y=Date.parse(b.time); return Number.isFinite(x)&&Number.isFinite(y)?x-y:a.time.localeCompare(b.time); });
  let outOfOrder = 0;
  for (let i=1;i<clean.length;i++) if (clean[i-1].time > clean[i].time) outOfOrder++;
  if (invalid) issues.push({ severity:"error", code:"INVALID_ROWS", count:invalid, message:"Rows with malformed timestamps, OHLC relationships or invalid volume were excluded." });
  if (duplicates) issues.push({ severity:"error", code:"DUPLICATE_TIMESTAMPS", count:duplicates, message:"Duplicate timestamps were excluded; confirm whether the file contains multiple instruments or mixed timeframes." });
  if (outOfOrder) issues.push({ severity:"warning", code:"UNSORTED_ROWS", count:outOfOrder, message:"Rows were sorted chronologically for calculations." });
  if (ordered.length < 2) issues.push({ severity:"error", code:"INSUFFICIENT_BARS", count:ordered.length, message:"At least two valid bars are required for basic validation." });
  const dates=ordered.map(b=>Date.parse(b.time)).filter(Number.isFinite);
  const deltas=[]; for(let i=1;i<dates.length;i++)if(dates[i]>dates[i-1])deltas.push(dates[i]-dates[i-1]);
  const medianDelta=deltas.length?[...deltas].sort((a,b)=>a-b)[Math.floor(deltas.length/2)]:null;
  if(medianDelta!==null){const gaps=deltas.filter(d=>d>medianDelta*Number(options.gapMultiple||1.8)).length;if(gaps)issues.push({severity:"warning",code:"POSSIBLE_TIME_GAPS",count:gaps,message:"Large timestamp intervals found. Trading sessions, weekends and holidays may explain some gaps; configure a session-aware calendar before treating them as missing bars."})}
  return { valid: !issues.some(x=>x.severity==="error"), received:bars.length, accepted:ordered.length, invalidRows:invalid, duplicateTimestamps:duplicates, outOfOrderRows:outOfOrder, medianTimestampDeltaMs:medianDelta, issues, bars:ordered, provenance:{verified:false,source:options.source||null,timeZone:options.timeZone||null,timeframe:options.timeframe||null,corporateActionAdjusted:options.corporateActionAdjusted??null}, warnings:["Validation checks format and internal consistency only; it cannot prove that prices are authentic, complete, correctly adjusted or current."] };
}
