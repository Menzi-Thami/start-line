import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/api-client'
import type { AiCoachStatus, CoachAnswer, SessionAdjustment, SessionAdjustmentRequest, TrainingPlan } from '../../lib/types'
import fixture from '../../test/fixtures/plan-5k.json'
import { AiCoachPanel, type AiCoachActions } from './AiCoachPanel'
import { evidenceLine, toAdjustmentRequest } from './ai-coach-model'

const plan = fixture as TrainingPlan
// Thursday of week 2: the progression run is today, the long run on Sunday.
const today = '2026-10-22'

const rulesOnly: AiCoachStatus = { enabled: true, modelAvailable: false, consent: false, aiQuestionsLeftToday: 0 }
const evidence = { runs: 6, checkIns: 4, uploads: 2, km: 31.5, from: '2026-09-25', to: '2026-10-22', excludedLinkedRuns: 0 }

const session = (overrides: Partial<SessionAdjustment['before']> = {}): SessionAdjustment['before'] => ({
  date: '2026-10-25', type: 'LongRun', title: 'Long run', distanceKm: 6.5, zone: 'LongRun',
  fastestSecondsPerKm: 390, slowestSecondsPerKm: 420, estimatedMinutes: 44, steps: [], ...overrides,
})

const proposal = (request: SessionAdjustmentRequest, overrides: Partial<SessionAdjustment> = {}): SessionAdjustment => ({
  token: 'T'.repeat(64),
  outcome: 'Proposed',
  reason: 'A shorter long run still keeps the week’s shape.',
  before: session(),
  after: session({ distanceKm: 4.5, estimatedMinutes: 30 }),
  becomesRest: false,
  weekKmBefore: 17,
  weekKmAfter: 15,
  safeLimitKm: null,
  request,
  ...overrides,
})

const answer = (overrides: Partial<CoachAnswer> = {}): CoachAnswer => ({
  reply: 'Here is a shorter long run.',
  source: 'Rules',
  intent: 'Answer',
  adjustment: null,
  offerWeeklyReview: false,
  evidence,
  notice: null,
  ...overrides,
})

function setup(overrides: Partial<AiCoachActions> = {}, props: { units?: 'km' | 'mi'; onOpenWeeklyReview?: () => void } = {}) {
  const actions: AiCoachActions = {
    status: vi.fn(async () => rulesOnly),
    setConsent: vi.fn(async (consent: boolean) => ({ ...rulesOnly, modelAvailable: true, consent, aiQuestionsLeftToday: 10 })),
    ask: vi.fn(async () => answer()),
    preview: vi.fn(async (request: SessionAdjustmentRequest) => proposal(request)),
    apply: vi.fn(async (request: SessionAdjustmentRequest) => proposal(request)),
    restore: vi.fn(async () => {}),
    ...overrides,
  }
  const user = userEvent.setup()
  render(<AiCoachPanel plan={plan} today={today} units={props.units ?? 'km'} actions={actions} onOpenWeeklyReview={props.onOpenWeeklyReview} />)
  return { actions, user }
}

async function openAndAsk(user: ReturnType<typeof userEvent.setup>, question = 'Make my long run shorter') {
  await user.click(screen.getByRole('button', { name: 'Ask the coach' }))
  await user.type(screen.getByRole('textbox', { name: 'Your question' }), question)
  await user.click(screen.getByRole('button', { name: 'Ask' }))
}

describe('the coach on the plan', () => {
  it('stays closed and calls nothing until the runner opens it, and asks nothing until they ask', async () => {
    const { actions, user } = setup()
    expect(screen.getByRole('button', { name: 'Ask the coach' })).toHaveAttribute('aria-expanded', 'false')
    expect(actions.status).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Ask the coach' }))
    await waitFor(() => expect(actions.status).toHaveBeenCalledTimes(1))
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'Make my long run')
    expect(actions.ask).not.toHaveBeenCalled()
    expect(actions.preview).not.toHaveBeenCalled()
  })

  it('never mentions AI when no model is available', async () => {
    const { user } = setup()
    await openAndAsk(user)
    await screen.findByText('Here is a shorter long run.')
    expect(screen.queryByRole('checkbox', { name: 'Use AI to understand my questions' })).not.toBeInTheDocument()
    expect(screen.queryByText(/\bAI\b/)).not.toBeInTheDocument()
    expect(screen.getByText('Answered by Taperday’s training rules.')).toBeInTheDocument()
  })

  it('offers AI as an optional choice when a model is available, then shows the questions left', async () => {
    const { actions, user } = setup({ status: vi.fn(async () => ({ ...rulesOnly, modelAvailable: true })) })
    await user.click(screen.getByRole('button', { name: 'Ask the coach' }))
    const consent = await screen.findByRole('checkbox', { name: 'Use AI to understand my questions' })
    expect(consent).not.toBeChecked()
    expect(screen.getByText(/Strava data never is/)).toBeInTheDocument()

    await user.click(consent)
    expect(actions.setConsent).toHaveBeenCalledWith(true)
    expect(await screen.findByText('AI questions left today: 10')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Use AI to understand my questions' })).toBeChecked()
  })

  it('asks, shows the suggested change before and after, applies it once, then undoes it', async () => {
    const request: SessionAdjustmentRequest = { date: '2026-10-25', kind: 'Distance', km: 4.5 }
    let finishApply: () => void = () => {}
    const apply = vi.fn(() => new Promise<SessionAdjustment>(resolve => { finishApply = () => resolve(proposal(request)) }))
    const { actions, user } = setup({ ask: vi.fn(async () => answer({ intent: 'AdjustSession', adjustment: proposal(request) })), apply })
    await openAndAsk(user)

    const card = await screen.findByRole('article', { name: 'Suggested change' })
    expect(within(card).getByText('A shorter long run still keeps the week’s shape.')).toBeInTheDocument()
    expect(within(card).getByText('Before')).toBeInTheDocument()
    expect(within(card).getByText('After')).toBeInTheDocument()
    expect(within(card).getByText('6.5 km')).toBeInTheDocument()
    expect(within(card).getByText('4.5 km')).toBeInTheDocument()
    expect(within(card).getByText('about 30 min')).toBeInTheDocument()
    expect(within(card).getAllByText('6:30–7:00/km')).toHaveLength(2)
    expect(within(card).getByText('Week total: 17 km → 15 km')).toBeInTheDocument()
    expect(screen.getByText('Here is a shorter long run.').closest('[aria-live]')).toHaveFocus()
    expect(actions.apply).not.toHaveBeenCalled()

    // A double tap applies once.
    await user.dblClick(within(card).getByRole('button', { name: 'Apply this change' }))
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith(request, 'T'.repeat(64))
    finishApply()

    expect(await screen.findByText('Done. Your plan is updated.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(actions.restore).toHaveBeenCalledWith(['2026-10-25'])
    expect(await screen.findByText(/back as your plan first wrote it/)).toBeInTheDocument()
  })

  it('keeps the plan when the runner says so', async () => {
    const request: SessionAdjustmentRequest = { date: '2026-10-25', kind: 'Distance', km: 4.5 }
    const { actions, user } = setup({ ask: vi.fn(async () => answer({ adjustment: proposal(request) })) })
    await openAndAsk(user)
    await user.click(await screen.findByRole('button', { name: 'Keep my plan' }))
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByText('Your plan stays as it is.')).toBeInTheDocument()
    expect(actions.apply).not.toHaveBeenCalled()
  })

  it('shows a rest day when the change turns the run into rest', async () => {
    const request: SessionAdjustmentRequest = { date: '2026-10-24', kind: 'Duration', minutes: 10 }
    const rest = proposal(request, { reason: 'Ten minutes is too short to be worth it: rest instead.', after: null, becomesRest: true })
    const { user } = setup({ ask: vi.fn(async () => answer({ adjustment: rest })) })
    await openAndAsk(user, 'I only have 10 minutes')
    const card = await screen.findByRole('article', { name: 'Suggested change' })
    expect(within(card).getByText('Rest day')).toBeInTheDocument()
  })

  it('explains a refused change and offers the safe distance in one tap', async () => {
    const asked: SessionAdjustmentRequest = { date: '2026-10-25', kind: 'Distance', km: 12 }
    const refused = proposal(asked, { token: null, outcome: 'NotRecommended', reason: 'That’s a big jump from your recent long runs.', after: null, safeLimitKm: 8 })
    const { actions, user } = setup({ ask: vi.fn(async () => answer({ adjustment: refused })) })
    await openAndAsk(user, 'Make my long run 12 km')

    const card = await screen.findByRole('article', { name: 'Not recommended' })
    expect(within(card).getByText('That’s a big jump from your recent long runs.')).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Apply this change' })).not.toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Try 8 km instead' }))
    expect(actions.preview).toHaveBeenCalledWith({ date: '2026-10-25', kind: 'Distance', km: 8 })
    expect(await screen.findByRole('article', { name: 'Suggested change' })).toBeInTheDocument()
    expect(screen.getByText('Checked by Taperday’s training rules.')).toBeInTheDocument()
  })

  it('shows no apply when no change is needed', async () => {
    const request: SessionAdjustmentRequest = { date: '2026-10-24', kind: 'Duration', minutes: 30 }
    const fits = proposal(request, { token: null, outcome: 'NoChangeNeeded', reason: 'Your easy run already fits in 30 minutes.', after: null })
    const { user } = setup({ ask: vi.fn(async () => answer({ adjustment: fits })) })
    await openAndAsk(user, 'I only have 30 minutes today')
    const card = await screen.findByRole('article', { name: 'No change needed' })
    expect(within(card).getByText('Your easy run already fits in 30 minutes.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply this change' })).not.toBeInTheDocument()
  })

  it('shows a clarifying reply as words only, with a quiet notice', async () => {
    const { user } = setup({ ask: vi.fn(async () => answer({ intent: 'Clarify', reply: 'Which run do you mean?', notice: 'The coach answered from your training rules this time.' })) })
    await openAndAsk(user, 'Change it')
    expect(await screen.findByText('Which run do you mean?')).toBeInTheDocument()
    expect(screen.getByText('The coach answered from your training rules this time.')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review next week' })).not.toBeInTheDocument()
  })

  it('hands next week to the weekly review instead of repeating it', async () => {
    const onOpenWeeklyReview = vi.fn()
    const { user } = setup({ ask: vi.fn(async () => answer({ intent: 'WeeklyReview', reply: 'Your weekly review looks at how the week went.', offerWeeklyReview: true })) }, { onOpenWeeklyReview })
    await openAndAsk(user, 'How should next week change?')
    await user.click(await screen.findByRole('button', { name: 'Review next week' }))
    expect(onOpenWeeklyReview).toHaveBeenCalledTimes(1)
  })

  it('asks the runner to check again when the plan changed since the preview', async () => {
    const request: SessionAdjustmentRequest = { date: '2026-10-25', kind: 'Distance', km: 4.5 }
    const apply = vi.fn(async (): Promise<SessionAdjustment> => { throw new ApiError('Your plan or running has changed. Preview it again before applying.', 409, {}, 'session_adjustment_changed') })
    const { actions, user } = setup({ ask: vi.fn(async () => answer({ adjustment: proposal(request) })), apply })
    await openAndAsk(user)
    await user.click(await screen.findByRole('button', { name: 'Apply this change' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your plan changed since this preview. Check it again.')
    expect(screen.queryByRole('button', { name: 'Apply this change' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Check again' }))
    expect(actions.preview).toHaveBeenCalledWith(request)
    expect(await screen.findByRole('button', { name: 'Apply this change' })).toBeEnabled()
  })

  it('says what the answer was based on, and who understood the question', async () => {
    const { user } = setup({ ask: vi.fn(async () => answer({ source: 'Ai', evidence: { ...evidence, excludedLinkedRuns: 3 } })) })
    await openAndAsk(user)
    expect(await screen.findByText('Based on your plan and 6 runs you logged or uploaded in the last 4 weeks. Strava runs aren’t used: 3 Strava-linked runs left out.')).toBeInTheDocument()
    expect(screen.getByText('Understood with AI · every change is checked by Taperday’s rules.')).toBeInTheDocument()
    expect(screen.getByText('Guidance, not medical advice. Nothing changes until you apply it.')).toBeInTheDocument()
  })

  it('changes a run exactly: the next two weeks of runs, in miles and pace per mile', async () => {
    const { actions, user } = setup({}, { units: 'mi' })
    await user.click(screen.getByRole('button', { name: 'Ask the coach' }))
    await user.click(screen.getByRole('radio', { name: 'Change a run' }))

    const run = screen.getByRole('combobox', { name: 'Which run?' })
    const options = within(run).getAllByRole('option').map(option => option.textContent)
    expect(options[0]).toBe('Thu 22 Oct · Progression run 4.7 mi')
    // Today to 13 days ahead, runs only: no strength, nothing from 5 November.
    expect(options).toHaveLength(8)
    expect(options.some(option => option?.includes('Strength') || option?.includes('Mobility'))).toBe(false)
    expect(options.at(-1)).toBe('Tue 3 Nov · Easy run + strides 2.2 mi')

    await user.selectOptions(run, '2026-10-25')
    await user.click(screen.getByRole('radio', { name: 'Distance' }))
    await user.type(screen.getByRole('textbox', { name: 'Distance in miles' }), '5')
    await user.click(screen.getByRole('button', { name: 'Check this change' }))
    expect(actions.preview).toHaveBeenLastCalledWith({ date: '2026-10-25', kind: 'Distance', km: 8.05 })
    await screen.findByRole('article', { name: 'Suggested change' })

    await user.click(screen.getByRole('radio', { name: 'Pace' }))
    await user.type(screen.getByRole('textbox', { name: 'Pace per mile (m:ss)' }), '8:00')
    await user.click(screen.getByRole('button', { name: 'Check this change' }))
    expect(actions.preview).toHaveBeenLastCalledWith({ date: '2026-10-25', kind: 'Pace', paceSecondsPerKm: 298 })
  })

  it('explains a value it can’t read, and shows the rules’ own message for a run it won’t change', async () => {
    const preview = vi.fn(async (): Promise<SessionAdjustment> => { throw new ApiError('Choose one of your runs from today to the next two weeks.', 400) })
    const { user } = setup({ preview })
    await user.click(screen.getByRole('button', { name: 'Ask the coach' }))
    await user.click(screen.getByRole('radio', { name: 'Change a run' }))
    await user.click(screen.getByRole('radio', { name: 'Pace' }))
    await user.type(screen.getByRole('textbox', { name: 'Pace per km (m:ss)' }), '630')
    await user.click(screen.getByRole('button', { name: 'Check this change' }))
    expect(screen.getByText(/Enter a pace like 6:30/)).toBeInTheDocument()
    expect(preview).not.toHaveBeenCalled()

    await user.clear(screen.getByRole('textbox', { name: 'Pace per km (m:ss)' }))
    await user.type(screen.getByRole('textbox', { name: 'Pace per km (m:ss)' }), '6:30')
    await user.click(screen.getByRole('button', { name: 'Check this change' }))
    expect(preview).toHaveBeenCalledWith({ date: '2026-10-22', kind: 'Pace', paceSecondsPerKm: 390 })
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose one of your runs from today to the next two weeks.')
  })
})

describe('the coach’s conversions and words', () => {
  it('turns minutes, kilometres, miles and paces into what the API expects', () => {
    expect(toAdjustmentRequest('2026-10-25', 'Duration', '30', 'km')).toEqual({ date: '2026-10-25', kind: 'Duration', minutes: 30 })
    expect(toAdjustmentRequest('2026-10-25', 'Distance', '6,5', 'km')).toEqual({ date: '2026-10-25', kind: 'Distance', km: 6.5 })
    expect(toAdjustmentRequest('2026-10-25', 'Distance', '3', 'mi')).toEqual({ date: '2026-10-25', kind: 'Distance', km: 4.83 })
    expect(toAdjustmentRequest('2026-10-25', 'Pace', '10:00', 'mi')).toEqual({ date: '2026-10-25', kind: 'Pace', paceSecondsPerKm: 373 })
    expect(toAdjustmentRequest('2026-10-25', 'Duration', '0', 'km')).toHaveProperty('error')
  })

  it('counts runs and Strava-linked runs in plain words', () => {
    expect(evidenceLine({ ...evidence, runs: 1, excludedLinkedRuns: 1 })).toBe('Based on your plan and 1 run you logged or uploaded in the last 4 weeks. Strava runs aren’t used: 1 Strava-linked run left out.')
    expect(evidenceLine({ ...evidence, runs: 0 })).toBe('Based on your plan. You haven’t logged or uploaded a run in the last 4 weeks. Strava runs aren’t used.')
  })
})
