export type StickerLayout = 'portrait' | 'horizontal' | 'transparent' | 'story' | 'square'

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
  { id: 'story', label: 'Story overlay', description: '9:16 transparent overlay for videos, or add a photo to export a ready-to-post Story.', width: 1080, height: 1920 },
  { id: 'square', label: 'Square photo', description: '1:1 transparent sticker or a photo-backed feed post.', width: 1080, height: 1080 },
]
