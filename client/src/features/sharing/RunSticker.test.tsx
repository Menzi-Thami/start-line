import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { renderRunSticker } from './run-sticker'
import { RunSticker } from './RunSticker'
vi.mock('./run-sticker', () => ({ renderRunSticker: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })) }))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.mocked(renderRunSticker).mockReset(); vi.mocked(renderRunSticker).mockResolvedValue(new Blob(['png'], { type: 'image/png' })) })
it('creates an explicit PNG download and restores focus when the preview is closed', async () => {
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sticker')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  const user = userEvent.setup()
  render(<RunSticker units="km" run={{ date: '2026-10-28', title: 'Easy run', seconds: 2530, source: 'Manual' }} />)
  const trigger = screen.getByRole('button', { name: 'Share run sticker' })
  await user.click(trigger)
  expect(await screen.findByRole('link', { name: 'Save PNG' })).toHaveAttribute('download', 'taperday-run-2026-10-28-portrait.png')
  await user.click(screen.getByRole('button', { name: 'Close sticker' }))
  expect(trigger).toHaveFocus()
  await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:sticker'))
  create.mockRestore(); revoke.mockRestore()
})

it('exports the selected horizontal layout and keeps keyboard focus on its selector', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:wide')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  const user = userEvent.setup()
  const run = { date: '2026-10-28', title: 'Easy long run', distanceKm: 10, seconds: 3600, source: 'Manual' as const }
  render(<RunSticker units="km" run={run} />)
  await user.click(screen.getByRole('button', { name: 'Share run sticker' }))
  await screen.findByRole('link', { name: 'Save PNG' })
  const horizontal = screen.getByRole('radio', { name: 'Horizontal card' })
  await user.click(horizontal)
  expect(await screen.findByRole('link', { name: 'Save PNG' })).toHaveAttribute('download', 'taperday-run-2026-10-28-horizontal.png')
  expect(horizontal).toHaveFocus()
  expect(screen.getByRole('img')).toHaveAttribute('width', '1600')
  expect(screen.getByRole('img')).toHaveAttribute('height', '900')
  expect(renderRunSticker).toHaveBeenLastCalledWith(run, 'km', 'horizontal')
  await user.keyboard('{ArrowRight}')
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Horizontal transparent' })).toBeChecked())
  expect(await screen.findByRole('link', { name: 'Save PNG' })).toHaveAttribute('download', 'taperday-run-2026-10-28-transparent.png')
  expect(screen.getByRole('img')).toHaveAttribute('height', '700')
})

it('does not offer an old image while a newly selected layout is rendering', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ready')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  let finish!: (blob: Blob) => void
  vi.mocked(renderRunSticker).mockImplementationOnce(() => new Promise<Blob>((resolve) => { finish = resolve }))
  const user = userEvent.setup()
  render(<RunSticker units="km" run={{ date: '2026-10-28', title: 'Run', seconds: 2530, source: 'Manual' }} />)
  await user.click(screen.getByRole('button', { name: 'Share run sticker' }))
  await waitFor(() => expect(finish).toBeDefined())
  await user.click(screen.getByRole('radio', { name: 'Horizontal transparent' }))
  const link = await screen.findByRole('link', { name: 'Save PNG' })
  expect(link).toHaveAttribute('download', 'taperday-run-2026-10-28-transparent.png')
  await act(async () => { finish(new Blob(['old'], { type: 'image/png' })) })
  expect(screen.getByRole('link', { name: 'Save PNG' })).toHaveAttribute('download', 'taperday-run-2026-10-28-transparent.png')
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
})
