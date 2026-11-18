import { createRoot } from 'react-dom/client'
import '@fontsource/instrument-serif'
import '@fontsource-variable/instrument-sans'
import '../../src/styles/tokens.css'
import '../../src/styles/app.css'
import '../../src/styles/polish.css'
import '../../src/styles/skin.css'
import { RacePrep } from '../../src/features/plan/RacePrep'
import type { TrainingPlan } from '../../src/lib/types'
import plan from '../../src/test/fixtures/plan-5k.json'

// The race-prep card alone; `today` comes from the URL so a test can show race week or race day.
const today = new URLSearchParams(location.search).get('today') ?? '2026-11-08'
createRoot(document.getElementById('root')!).render(<main className="page" style={{ paddingTop: 24 }}><RacePrep plan={{ ...plan, race: { ...plan.race, date: '2026-11-08' } } as TrainingPlan} today={today} units="km" /></main>)
