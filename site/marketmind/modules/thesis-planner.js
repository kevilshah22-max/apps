/** Structured bull/base/bear thesis; checks completeness, never recommends a trade. */
export function buildThesis(input={}) {
 const required=["instrument","timeframe","entryCondition","invalidation","horizon"];
 const missing=required.filter(k=>!String(input[k]??"").trim());
 const scenarios=["bull","base","bear"].map(name=>({name,thesis:String(input[name+"Case"]??"").trim(),target:input[name+"Target"]==null?"":String(input[name+"Target"]),trigger:String(input[name+"Trigger"]??"").trim()}));
 for(const s of scenarios)if(!s.thesis)missing.push(s.name+"Case");
 const report={version:1,createdAt:new Date().toISOString(),instrument:String(input.instrument??""),timeframe:String(input.timeframe??""),entryCondition:String(input.entryCondition??""),invalidation:String(input.invalidation??""),horizon:String(input.horizon??""),catalysts:String(input.catalysts??""),risks:String(input.risks??""),scenarios,missingFields:[...new Set(missing)],completenessPct:Math.round((1-[...new Set(missing)].length/Math.max(required.length+3,1))*100),status:missing.length?"INCOMPLETE — do not treat as a trade plan":"DRAFT — requires independent review",limitations:["Targets and scenarios are user-authored, not generated predictions.","A complete template does not imply positive expected value.","Reassess when data, thesis or risk conditions change."]};
 return report;
}
