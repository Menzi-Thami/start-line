import { useState } from 'react'
type Feeling = 'good' | 'okay' | 'tired'
export function ReadinessCheckIn({ today }: { today: string }) {
  const key = 'taperday-readiness-' + today
  const [feeling,setFeeling] = useState<Feeling|null>(()=>{try { const s=localStorage.getItem(key);return s==='good'||s==='okay'||s==='tired'?s:null }catch{return null}})
  const choose=(v:Feeling)=>{setFeeling(v);try{localStorage.setItem(key,v)}catch{/* private mode */}}
  return <details className="disclosure"><summary>How are you feeling today?</summary><p className="field-help">Optional reflection, saved on this device only. This doesn't alter your plan.</p><div className="pills" role="group" aria-label="Today's energy">{(['good','okay','tired'] as const).map(v=><button key={v} type="button" className="button button-quiet" aria-pressed={feeling===v} onClick={()=>choose(v)}>{v==='good'?'Fresh':v==='okay'?'Okay':'Tired'}</button>)}</div>{feeling==='tired'&&<p>Consider taking it easier, and review your workout if fatigue persists.</p>}</details>
}
