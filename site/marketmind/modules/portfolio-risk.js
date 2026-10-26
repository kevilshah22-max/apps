/** Portfolio exposure helper. Values must be normalised into one base currency by caller. */
export function analysePortfolio(positions=[],options={}) {
 const valid=positions.filter(p=>p&&String(p.symbol||"").trim()&&Number.isFinite(Number(p.marketValue))&&Number(p.marketValue)>=0);
 const total=valid.reduce((s,p)=>s+Number(p.marketValue),0),bySymbol={},bySector={},byAssetClass={};
 for(const p of valid){const v=Number(p.marketValue),sym=String(p.symbol).trim(),sector=String(p.sector||"Unclassified"),asset=String(p.assetClass||"Unclassified");bySymbol[sym]=(bySymbol[sym]||0)+v;bySector[sector]=(bySector[sector]||0)+v;byAssetClass[asset]=(byAssetClass[asset]||0)+v}
 const rows=Object.entries(bySymbol).map(([symbol,value])=>({symbol,value,weightPct:total?value/total*100:0})).sort((a,b)=>b.weightPct-a.weightPct);
 const sectorRows=Object.entries(bySector).map(([sector,value])=>({sector,value,weightPct:total?value/total*100:0})).sort((a,b)=>b.weightPct-a.weightPct);
 const warnings=[];if(!valid.length)warnings.push("No valid positions were supplied.");if(valid.length!==positions.length)warnings.push("Some rows were excluded; check symbols and non-negative market values.");
 if(total<=0)warnings.push("Total portfolio market value is zero; weights are undefined.");
 const cap=Number(options.singleNameCapPct??20);for(const p of rows)if(p.weightPct>cap)warnings.push(p.symbol+" exceeds the configured "+cap+"% single-name concentration threshold.");
 return {baseCurrency:options.baseCurrency||null,positionCount:valid.length,totalMarketValue:total,positions:rows,sectors:sectorRows,assetClasses:byAssetClass,largestPositionPct:rows[0]?.weightPct??null,herfindahlIndex:rows.length?rows.reduce((s,p)=>s+(p.weightPct/100)**2,0):null,warnings,limitations:["Values must be converted to a common currency before aggregation.","Market value concentration is not the same as risk contribution; correlations, volatility, leverage, liquidity and derivatives exposures are not included.","This module does not calculate a complete portfolio VaR or stress test."]};
}
