const q=s=>document.querySelector(s),input=q("#input"),result=q("#result"),signals=q("#signals"),count=q("#count"),score=q("#score");
const checks=[
["Sensitive credentials mentioned",20,"Use a scoped secret store and keep credentials out of agent context."],
["Data may be removed or replaced",25,"Create a backup and require explicit approval."],
["Message or publication will happen",15,"Preview the exact content and destination."],
["Money or purchase is involved",25,"Show the exact amount and require confirmation."],
["Account or permission changes",20,"Use least privilege and a separate approval step."],
["A program or downloaded file will run",15,"Review the source and execution step first."],
["Action cannot easily be undone",20,"Prefer a dry run or reversible workflow."]
];
function scan(){
 const t=input.value.toLowerCase(); let hits=checks.filter(x=>{
   const words=x[0].toLowerCase().split(" ").filter(w=>w.length>4);
   return words.some(w=>t.includes(w));
 });
 let s=Math.min(100,hits.reduce((n,x)=>n+x[1],0)); score.textContent=s+"/100"; count.textContent=hits.length;
 result.innerHTML="<div class='verdict'>"+(s>=60?"HIGH RISK":s>=30?"REVIEW REQUIRED":"LOWER RISK")+"</div>"+(hits.length?hits.map(x=>"<div class='tip'><b>"+x[0]+"</b><br>"+x[2]+"</div>").join(""):"<div class='tip'>No major signals matched. Still review permissions, destinations, data scope and reversibility.</div>");
 signals.innerHTML=hits.length?hits.map(x=>"<div class='risk'><b>"+x[0]+"</b><span>"+x[2]+"</span></div>").join(""):"No major signals detected.";
}
q("#scan").onclick=scan;
q("#clear").onclick=()=>{input.value="";result.textContent="Paste a plan and run a preflight.";signals.textContent="No scan yet.";count.textContent=0;score.textContent="—"};
q("#copy").onclick=async()=>{scan();await navigator.clipboard.writeText("AGENTGUARD PREFLIGHT\nRisk score: "+score.textContent+"\n\n"+signals.innerText+"\n\nHuman review: confirm permissions, destinations, data scope, reversibility and exact side effects before execution.")};