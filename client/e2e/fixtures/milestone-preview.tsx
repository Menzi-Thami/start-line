import React from 'react'
import { createRoot } from 'react-dom/client'
import { MilestoneCards } from '../../src/features/milestones/MilestoneCards'
import '@fontsource/instrument-serif'
import '@fontsource-variable/instrument-sans'
import '../../src/styles/tokens.css'
import '../../src/styles/app.css'
import '../../src/styles/overview.css'
import '../../src/styles/home.css'
import '../../src/styles/polish.css'
import '../../src/styles/skin.css'
import '../../src/styles/landing-refresh.css'
import '../../src/styles/sign-in-landing.css'
import '../../src/styles/skip-main.css'
import '../../src/styles/training-clarity.css'
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
