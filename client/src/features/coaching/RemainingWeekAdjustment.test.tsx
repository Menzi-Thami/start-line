import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { planFixture } from '../../test/server'
import { RemainingWeekAdjustment } from './RemainingWeekAdjustment'
const proposal = { token: 'A'.repeat(64), summary: 'Ease remaining runs.', proposed: planFixture, changes: [{ appliedOn: '2026-10-28', date: '2026-10-30', originalType: 'Tempo', originalTitle: 'Tempo run', originalKm: 10, easyKm: 8 }] }
it('confirms logs before preview and applies only the reviewed change', async () => {
 const actions = { reviewRemaining: vi.fn().mockResolvedValue(proposal), applyRemaining: vi.fn().mockResolvedValue(undefined) }
 const user = userEvent.setup(); render(<RemainingWeekAdjustment current={planFixture} units="km" actions={actions}/> )
 expect(screen.getByRole('button', {name:'Preview the rest of this week'})).toBeDisabled()
 await user.click(screen.getByRole('checkbox')); await user.click(screen.getByRole('button', {name:'Preview the rest of this week'}))
 expect(await screen.findByText(/Tempo run · 10 km → Easy run · 8 km/)).toBeVisible(); expect(actions.applyRemaining).not.toHaveBeenCalled()
 await user.click(screen.getByRole('button', {name:'Apply this easier week'})); expect(actions.applyRemaining).toHaveBeenCalledExactlyOnceWith(proposal.token)
})
it('discards a stale preview and preserves the current plan', async () => {
 const actions = { reviewRemaining: vi.fn().mockResolvedValue(proposal), applyRemaining: vi.fn().mockRejectedValue(new Error('Preview again.')) }
 const user = userEvent.setup(); render(<RemainingWeekAdjustment current={planFixture} units="km" actions={actions}/> )
 await user.click(screen.getByRole('checkbox')); await user.click(screen.getByRole('button', {name:'Preview the rest of this week'})); await user.click(await screen.findByRole('button', {name:'Apply this easier week'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('Preview again.'); expect(screen.queryByRole('button', {name:'Apply this easier week'})).toBeNull()
})
