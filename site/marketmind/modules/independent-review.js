/** Red-team checklist for a research package. Missing evidence fails closed to REVIEW REQUIRED. */
export function reviewResearch(input={}) {
 const checks=[
 ["dataProvenance","Data source and timestamps are recorded"],
 ["outOfSample","Out-of-sample or walk-forward evaluation is documented"],
 ["costsIncluded","Fees and realistic slippage are included"],
 ["lookAheadTested","Look-ahead and leakage checks are documented"],
 ["survivorshipAddressed","Survivorship and delisting bias are addressed"],
 ["benchmarkCompared","A relevant benchmark is compared"],
 ["sampleSizeReviewed","Trade/sample size and uncertainty are discussed"],
 ["regimeSensitivity","Sensitivity across market regimes is assessed"],
 ["parametersPrecommitted","Parameters were fixed before final evaluation"],
 ["riskLimitsDefined","Exposure and drawdown limits are defined"]
 ];
 const results=checks.map(([key,label])=>({key,label,passed:input[key]===true,detail:String(input[key+"Notes"]||"")})),failed=results.filter(x=>!x.passed);
 return {status:failed.length?"REVIEW REQUIRED":"CHECKLIST COMPLETE — NOT A VALIDATION GUARANTEE",passed:results.length-failed.length,total:results.length,failed,checks:results,warnings:["A checked box is a claim supplied by the reviewer, not an independent audit.","Checklist completion does not establish a strategy's profitability or statistical validity.","Do not promote research to live execution based on this module alone."]};
}
