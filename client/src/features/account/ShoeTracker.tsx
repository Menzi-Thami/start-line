import { useState } from 'react'
type Shoe = {id:number;name:string;km:number}
const key='taperday-shoes-v1'
function read():Shoe[]{try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v.filter(x=>typeof x.name==='string'&&typeof x.km==='number'):[]}catch{return []}}
export function ShoeTracker(){
 const [shoes,setShoes]=useState<Shoe[]>(read),[name,setName]=useState(''),[km,setKm]=useState('')
 const save=(next:Shoe[])=>{setShoes(next);try{localStorage.setItem(key,JSON.stringify(next))}catch{/* storage unavailable */}}
 return <details className="settings-group"><summary>Running shoes</summary><p className="field-help">Track shoe mileage manually on this device. Runs are not assigned automatically yet.</p><ul>{shoes.map(s=><li key={s.id}>{s.name} · {s.km} km <button type="button" className="link-button" onClick={()=>save(shoes.filter(x=>x.id!==s.id))}>Remove</button></li>)}</ul><form onSubmit={e=>{e.preventDefault();const n=name.trim();const distance=Number(km);if(!n||!Number.isFinite(distance)||distance<0)return;save([...shoes,{id:Date.now(),name:n,km:distance}]);setName('');setKm('')}}><label>Shoe name<input className="input" value={name} maxLength={80} onChange={e=>setName(e.target.value)} required/></label><label>Current distance (km)<input className="input" type="number" min="0" step=".1" value={km} onChange={e=>setKm(e.target.value)} required/></label><button type="submit" className="button button-quiet">Add shoes</button></form></details>
}
