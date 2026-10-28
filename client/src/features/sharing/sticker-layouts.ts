export type StickerLayout = 'portrait' | 'horizontal' | 'transparent'

export const STICKER_LAYOUTS: readonly { id: StickerLayout; label: string; description: string; width: number; height: number }[] = [
  { id: 'portrait', label: 'Portrait', description: 'The original dark card, made for a Story.', width: 1080, height: 1280 },
  {
    id: 'horizontal',
    label: 'Horizontal card',
    description: 'A wide card with all your run details in one view.',
    width: 1600,
    height: 900,
  },
  {
    id: 'transparent',
    label: 'Horizontal transparent',
    description: 'A horizontal overlay with no card background, ready for your photo.',
    width: 1600,
    height: 700,
  },
]
