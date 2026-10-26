/**
 * MarketMind orchestrator contract: combines specialist outputs without inventing facts.
 * Each specialist supplies provenance, timestamp, observations, limitations and warnings.
 */
export function assembleMarketReport(input={}) {
 const now=Number(input.now??Date.now()),modules=Array.isArray(input.modules)?input.modules:[];
 const accepted=[],issues=[];
 for(const [i,m] of modules.entries()){
  if(!m||!String(m.moduleId||"").trim()){issues.push({index:i,reason:"Missing moduleId; output excluded"});continue}
  const stamp=Date.parse(m.asOf||"");
  const stale=!Number.isFinite(stamp)||stamp>now+5*60*1000||now-stamp>Number(input.maxAgeHours??24)*3600000;
  const source=String(m.source||"").trim();
  accepted.push({moduleId:String(m.moduleId),status:String(m.status||"UNSPECIFIED"),asOf:Number.isFinite(stamp)?new Date(stamp).toISOString():null,stale,source:source||null,observations:Array.isArray(m.observations)?m.observations:[],limitations:Array.isArray(m.limitations)?m.limitations:[],warnings:Array.isArray(m.warnings)?m.warnings:[],confidenceBasis:m.confidenceBasis||null,data:m.data??null});
 }
 const stale=accepted.filter(m=>m.stale),unattributed=accepted.filter(m=>!m.source);
 const directionLabels=new Set();
 for(const m of accepted)for(const o of m.observations){const d=String(o?.direction||o?.bias||"").toLowerCase();if(["bullish","bearish","neutral"].includes(d))directionLabels.add(d)}
 const conflicts=directionLabels.has("bullish")&&directionLabels.has("bearish");
 const warnings=[];
 if(!accepted.length)warnings.push("No specialist outputs were accepted; no market conclusion is available.");
 if(stale.length)warnings.push("One or more module outputs are missing a valid timestamp or are outside the configured freshness window.");
 if(unattributed.length)warnings.push("One or more modules lack source attribution.");
 if(conflicts)warnings.push("Specialist outputs disagree on direction. Preserve the disagreement; do not average it into a single signal.");
 if(accepted.some(m=>m.warnings.length))warnings.push("At least one specialist supplied its own warnings or limitations; review those before acting.");
 return {
  schemaVersion:"1.0",generatedAt:new Date(now).toISOString(),instrument:input.instrument||null,timeframe:input.timeframe||null,
  disposition:!accepted.length?"INSUFFICIENT EVIDENCE":stale.length||unattributed.length||conflicts?"REVIEW REQUIRED":"EVIDENCE PACK ASSEMBLED — HUMAN REVIEW REQUIRED",
  modules:accepted,issues,quality:{moduleCount:accepted.length,staleModuleCount:stale.length,unattributedModuleCount:unattributed.length,directionalConflict:conflicts,directionalLabels:[...directionLabels]},
  tradePlan:{entry:null,stop:null,target:null,winProbability:null,orderAction:"NONE",note:"The orchestrator does not invent entry/stop/target levels or calibrated probabilities. These fields must be derived by validated specialist methods and explicitly reviewed by a human."},
  warnings:[...warnings,"This report combines supplied module outputs; it does not independently verify their claims or source data.","No brokerage order is created or transmitted."],
  nextChecks:["Verify data source, instrument, exchange, timeframe and timezone.","Review contradictory observations and all module limitations.","Confirm costs, liquidity, spread, slippage, event risk and portfolio exposure.","Require independent validation before treating a backtest as evidence of future performance."]
 };
}
