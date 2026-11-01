import type { Activity } from '../../lib/types'
export function RunDataQuality({run}:{run:Activity}){
 const missing=[run.averageHeartRate==null?'Heart rate':null,run.elevationGainMetres==null?'Elevation':null,run.splits.length===0?'Splits':null].filter(Boolean)
 return <details className="disclosure"><summary>Run data details</summary><p>Source: {run.source.kind}.</p>{missing.length?<p>Not available from this run: {missing.join(', ')}.</p>:<p>Heart rate, elevation and splits are available.</p>}<p className="field-help">Missing fields are not estimated or silently filled.</p></details>
}
