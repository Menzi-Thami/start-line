import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthContext, accountsOff } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { clearSnapshot, readSnapshot, saveSnapshot } from '../../lib/home-snapshot'
import { planFixture } from '../../test/server'
import { PrivateImport } from './PrivateImport'
import { PrivateGym } from './PrivateGym'
import { PlanView } from '../plan/PlanView'

const auth = { ...accountsOff, enabled: true, sessionReady: true, account: { id: 'synthetic-owner', name: 'Synthetic runner', email: null }, getToken: async () => 'synthetic-token' }
const wrapper = ({ children }: { children: React.ReactNode }) => <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
afterEach(() => { vi.restoreAllMocks(); clearSnapshot() })

it('hides import for an account without server entitlement', async () => {
  const access = vi.spyOn(api.me, 'privateAccess').mockResolvedValue({ enabled: false })
  render(<PrivateImport />, { wrapper })
  await waitFor(() => expect(access).toHaveBeenCalled())
  expect(screen.queryByText('Private prescription')).not.toBeInTheDocument()
})

it('requires a reviewed preview and consent; a failed activation retains the preview for recovery', async () => {
  vi.spyOn(api.me, 'privateAccess').mockResolvedValue({ enabled: true })
  const preview = vi.spyOn(api.me, 'previewPrivateImport').mockResolvedValue({ importId: 'synthetic-import', token: 'A'.repeat(64), expiresAt: '2026-10-08T09:30:00Z', replacesCurrent: true, plan: { ...planFixture, isPrivate: true } })
  const activate = vi.spyOn(api.me, 'activatePrivateImport').mockRejectedValue(new Error('Your plan changed. Preview again.'))
  render(<PrivateImport />, { wrapper })
  await userEvent.click(await screen.findByText('Private prescription', { exact: true }))
  const file = new File(['{}'], 'synthetic.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => '{}' })
  await userEvent.upload(screen.getByLabelText('Prescription file'), file)
  const approve = await screen.findByRole('button', { name: 'Make prescription current' })
  expect(approve).toBeDisabled()
  expect(activate).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(approve)
  expect(await screen.findByRole('status')).toHaveTextContent('Your plan changed. Preview again.')
  expect(screen.getByRole('region', { name: 'Private prescription preview' })).toBeVisible()
  expect(preview).toHaveBeenCalledWith('synthetic-token', {})
})

it('gym completion calls only its owner endpoint and does not complete a same-day run', async () => {
  const session = { ...planFixture.weeks[0]!.sessions[0]!, type: 'Strength' as const, prescriptionId: 'gym-id', gym: 'Upper' as const, gymDone: false }
  const save = vi.spyOn(api.me, 'completePrivateGym').mockResolvedValue({ ...planFixture, isPrivate: true })
  const run = vi.spyOn(api.me, 'saveCheckIn')
  const onChanged = vi.fn()
  render(<PrivateGym planId="plan-id" session={session} today={session.date} onChanged={onChanged} />, { wrapper })
  await userEvent.click(screen.getByRole('button', { name: 'Complete gym' }))
  await waitFor(() => expect(onChanged).toHaveBeenCalled())
  expect(save).toHaveBeenCalledWith('synthetic-token', 'plan-id', 'gym-id', true)
  expect(run).not.toHaveBeenCalled()
})

it('never persists a private current plan or prescription in the home snapshot', () => {
  saveSnapshot('owner', { current: { id: 'plan', name: 'Private name', isPrivate: true, inputs: { raceName: 'Private race' } as never }, plan: { id: 'plan', plan: { ...planFixture, isPrivate: true } } })
  expect(readSnapshot('owner')?.plan).toBeUndefined()
  expect(readSnapshot('owner')?.current).toBeUndefined()
  expect(JSON.stringify(localStorage)).not.toContain('Private name')
})

it('private plans have no share link or calendar subscription and keep their export', () => {
  render(<PlanView plan={{ ...planFixture, isPrivate: true }} today="2026-10-08" units="km" shareUrl="https://example.test/forbidden" />)
  expect(screen.queryByRole('button', { name: 'Share link' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Google Calendar/ })).not.toBeInTheDocument()
  expect(screen.getByText('Download a calendar file')).toBeInTheDocument()
})
