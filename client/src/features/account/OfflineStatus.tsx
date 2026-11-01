import { useEffect, useState } from 'react'
export function OfflineStatus(){
 const [online,setOnline]=useState(()=>navigator.onLine)
 useEffect(()=>{const yes=()=>setOnline(true),no=()=>setOnline(false);window.addEventListener('online',yes);window.addEventListener('offline',no);return()=>{window.removeEventListener('online',yes);window.removeEventListener('offline',no)}},[])
 return <details className="settings-group"><summary>Offline access</summary><p role="status">{online?'Connected':'Offline'}</p><p>Installed Taperday may open without internet, but generating, syncing and saving new training data still needs a connection. Open your plan while online before travelling.</p></details>
}
