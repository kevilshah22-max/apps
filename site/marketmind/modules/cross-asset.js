/** Pearson correlations of aligned price series. Dates must be normalised to a shared calendar by caller. */
function pearson(a,b){if(a.length!==b.length||a.length<3)return null;const ma=a.reduce((s,x)=>s+x,0)/a.length,mb=b.reduce((s,x)=>s+x,0)/b.length;let cov=0,va=0,vb=0;for(let i=0;i<a.length;i++){cov+=(a[i]-ma)*(b[i]-mb);va+=(a[i]-ma)**2;vb+=(b[i]-mb)**2}return va===0||vb===0?null:cov/Math.sqrt(va*vb)}
export function compareAssets(seriesBySymbol={}) {
 const symbols=Object.keys(seriesBySymbol),returns={};for(const symbol of symbols){const bars=seriesBySymbol[symbol]||[],map=new Map(bars.map(b=>[String(b.time),Number(b.close)]));returns[symbol]=map}
 const common=[...returns[symbols[0]||""]?.keys?.()||[]].filter(t=>symbols.every(s=>returns[s].has(t)&&returns[s].get(t)>0)).sort();
 const result={symbols,commonObservations:common.length,returns:{},correlations:{},warnings:["Series are aligned only by exact timestamp; different trading calendars/time zones may sharply reduce or bias the sample.","Correlation is not causation and can change by regime.","No assets are fetched automatically."]};
 for(const s of symbols){const values=common.map(t=>returns[s].get(t));result.returns[s]=values.slice(1).map((v,i)=>v/values[i]-1)}
 for(const a of symbols){result.correlations[a]={};for(const b of symbols){const ra=result.returns[a],rb=result.returns[b];result.correlations[a][b]=a===b&&ra.length>=2?1:pearson(ra,rb)}}
 return result;
}
