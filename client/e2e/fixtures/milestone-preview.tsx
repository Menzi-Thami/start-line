import React from 'react'
import { createRoot } from 'react-dom/client'
import { MilestoneCards } from '../../src/features/milestones/MilestoneCards'
import '../../src/styles/app.css'
import type { ActivitySummary } from '../../src/lib/types'

const run = (id: string, localDate: string, distanceKm: number): ActivitySummary => ({
  id, localDate, distanceKm, startedAt: localDate + 'T07:00:00Z', kind: 'Run',
  movingSeconds: distanceKm * 350, paceSecondsPerKm: 350,
  plannedTitle: null, plannedSessionType: null, pace: null, averageHeartRate: null,
  source: { kind: 'Upload', viewUrl: null, recordedOnGarmin: false, cachedUntil: null },
})
createRoot(document.getElementById('root')!).render(
  <main style={{ maxWidth: 700, margin: 'auto', padding: 16 }}>
    <MilestoneCards runs={[run('one','2026-10-28',12),run('two','2026-10-30',6)]}/>
  </main>,
)
