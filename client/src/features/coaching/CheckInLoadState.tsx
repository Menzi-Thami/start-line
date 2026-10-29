export function CheckInLoadState({ ready, failed, retry }: { ready: boolean; failed: boolean; retry: () => void }) {
  if (failed) return <div className="callout" role="alert">
    <p>{ready ? 'Your saved runs couldn’t refresh. Showing the entries already loaded; retry to refresh them.' : 'Your saved runs couldn’t load. Retry before logging or changing a run.'}</p>
    <button type="button" className="button button-quiet" onClick={retry}>Retry saved runs</button>
  </div>
  return ready ? null : <p role="status">Loading saved runs…</p>
}
