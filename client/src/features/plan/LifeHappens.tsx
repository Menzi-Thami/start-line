import { useState } from 'react'
export function LifeHappens() {
 const [reason,setReason]=useState<'missed'|'short'|'travel'|'ill'|null>(null)
 const advice={missed:'Avoid stacking missed hard sessions. Return to your normal schedule or use the existing replan action.',short:'Choose an easy shortened session rather than compressing all intervals into limited time.',travel:'Keep easy runs flexible. Move a hard session only if recovery time remains.',ill:'Rest while unwell. If symptoms persist or are concerning, seek medical advice; resume gradually.'}
 return <details className="disclosure"><summary>Life happens · change of plans?</summary><p>Choose what's changed for practical guidance. Your plan is never changed without your action.</p><div className="pills">{(['missed','short','travel','ill'] as const).map(v=><button type="button" key={v} className="button button-quiet" aria-pressed={reason===v} onClick={()=>setReason(v)}>{{missed:'Missed a run',short:'Only 30 minutes',travel:'Travelling',ill:'Not feeling well'}[v]}</button>)}</div>{reason&&<p role="status">{advice[reason]}</p>}</details>
}
