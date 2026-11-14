import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { chapter, raceResult } from './journey-fixtures'
import { storyFromChapter } from './journey-story'
import { cardSvg, shareCard } from './share-card'
import { TrainingStory } from './TrainingStory'

vi.mock('./share-card', async importOriginal => ({ ...await importOriginal<typeof import('./share-card')>(), shareCard: vi.fn(async () => 'shared') }))

describe('Training story sharing', () => {
  it('shares the confirmed race time and distance, including an edited chip time', async () => {
    render(<TrainingStory story={storyFromChapter(chapter())} units="km" raceResult={raceResult({ finishTime: '01:51:00' })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Share my story' }))
    expect(shareCard).toHaveBeenLastCalledWith(expect.objectContaining({
      heading: 'RACE FINISHED',
      stats: [
        { value: '1:51:00', label: 'Race result time' },
        { value: '21.1 km', label: 'Race distance' },
        { value: '38/38', label: 'Training runs confirmed' },
      ],
    }), expect.stringContaining('in 1:51:00!'), 'taperday-race-finish', null)
    expect(await screen.findByRole('status')).toHaveTextContent('Shared.')
  })

  it('keeps an unfinished race out of the finish card and share text', async () => {
    render(<TrainingStory story={storyFromChapter(chapter())} units="km" raceResult={raceResult({ outcome: 'DidNotFinish', finishTime: null })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Share my story' }))
    expect(shareCard).toHaveBeenLastCalledWith(expect.objectContaining({ heading: 'TRAINING COMPLETE' }), expect.not.stringContaining('I finished'), 'taperday-training-story', null)
  })

  it('escapes user text in the SVG fallback and preserves the portrait size and result', () => {
    const svg = cardSvg({ kicker: 'TAPERDAY', heading: 'RACE FINISHED', raceName: 'A <race> & "friends"', stats: [{ value: '4:40:12', label: 'Race result time' }], footer: 'taperday.run' })
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.documentElement.getAttribute('width')).toBe('1080')
    expect(doc.documentElement.getAttribute('height')).toBe('1920')
    expect(doc.querySelector('race')).toBeNull()
    expect(doc.documentElement.textContent).toContain('A <race> & "friends"')
    expect(doc.documentElement.textContent).toContain('4:40:12')
  })
})
