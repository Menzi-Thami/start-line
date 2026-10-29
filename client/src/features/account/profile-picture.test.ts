import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareProfilePicture, PROFILE_PICTURE_MAX_BYTES } from './profile-picture'

const jpeg = (bytes: number) => `data:image/jpeg;base64,${btoa('a'.repeat(bytes))}`
const file = new File(['synthetic source'], 'camera.jpg', { type: 'image/jpeg' })
const close = vi.fn()

beforeEach(() => {
  close.mockClear()
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4032, height: 3024, close }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('phone picture preparation', () => {
  it('reduces encoding quality until the actual JPEG fits the 24 KB budget', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValueOnce(jpeg(40 * 1024)).mockReturnValue(jpeg(PROFILE_PICTURE_MAX_BYTES - 1))
    const result = await prepareProfilePicture(file)
    expect(atob(result.split(',')[1]!).length).toBeLessThanOrEqual(PROFILE_PICTURE_MAX_BYTES)
    expect(close).toHaveBeenCalledOnce()
  })

  it('also reduces dimensions when quality changes alone cannot fit the picture', async () => {
    const sizes: number[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
      sizes.push(this.width)
      return jpeg(this.width > 192 ? 40 * 1024 : 20 * 1024)
    })
    expect(await prepareProfilePicture(file)).toBe(jpeg(20 * 1024))
    expect(sizes).toContain(192)
    expect(close).toHaveBeenCalledOnce()
  })

  it('releases decoded camera memory when the browser cannot create a canvas', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(prepareProfilePicture(file)).rejects.toThrow('can’t prepare')
    expect(close).toHaveBeenCalledOnce()
  })

  it('rejects an encoder result that never fits instead of uploading a large original', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(jpeg(40 * 1024))
    await expect(prepareProfilePicture(file)).rejects.toThrow('couldn’t be made small enough')
    expect(close).toHaveBeenCalledOnce()
  })
})
