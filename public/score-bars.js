// Adapted from BidPilot ScoreBreakdown.tsx (MIT, Georgios Panagopoulos, 2025).
// Original and full license: vendor/bidpilot. This version renders safe DOM nodes.
export function scoreBreakdown(match, labels) {
  const box = document.createElement('div'); box.className = 'score-breakdown';
  for (const [label,value] of [[labels.rules,match.rule_score],[labels.lexical,match.lexical_score]]) {
    const row=document.createElement('div');row.className='score-row';
    const name=document.createElement('span');name.textContent=label;
    const meter=document.createElement('meter');meter.min=0;meter.max=1;meter.value=Math.max(0,Math.min(1,Number(value)||0));meter.setAttribute('aria-label',label);
    const pct=document.createElement('span');pct.textContent=Math.round(meter.value*100)+'%';
    row.append(name,meter,pct);box.append(row);
  }
  return box;
}
