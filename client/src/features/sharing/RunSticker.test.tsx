import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { RunSticker } from './RunSticker'
vi.mock('./run-sticker', () => ({ renderRunSticker: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })) }))
afterEach(() => vi.unstubAllGlobals())
it('creates an explicit PNG download and restores focus when the preview is closed', async () => {
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sticker')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  const user = userEvent.setup()
  render(<RunSticker units="km" run={{ date: '2026-10-28', title: 'Easy run', seconds: 2530, source: 'Manual' }} />)
  const trigger = screen.getByRole('button', { name: 'Share run sticker' })
  await user.click(trigger)
  expect(await screen.findByRole('link', { name: 'Save PNG' })).toHaveAttribute('download', 'taperday-run-2026-10-28.png')
  await user.click(screen.getByRole('button', { name: 'Close sticker' }))
  expect(trigger).toHaveFocus()
  await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:sticker'))
  create.mockRestore(); revoke.mockRestore()
})
