/** Database budget for pictures produced by the app; the API retains its existing compatibility limit. */
export const PROFILE_PICTURE_MAX_BYTES = 24 * 1024

async function decodePicture(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    // Ask the native decoder to downsize camera images before handing a bitmap to JavaScript.
    const bitmap = await createImageBitmap(file, { resizeWidth: 1024, resizeQuality: 'high' })
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
  } catch {
    // Safari can sometimes display phone formats that its ImageBitmap decoder cannot read.
    const url = URL.createObjectURL(file)
    const image = new Image()
    try {
      image.src = url
      await image.decode()
      return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => { image.src = ''; URL.revokeObjectURL(url) } }
    } catch {
      URL.revokeObjectURL(url)
      throw new Error('That picture couldn’t be read on this device. Try a JPEG, PNG or WebP image.')
    }
  }
}

/** Re-encode a centred avatar, dropping original metadata and large camera dimensions before upload. */
export async function prepareProfilePicture(file: File): Promise<string> {
  const bitmap = await decodePicture(file)
  const canvas = document.createElement('canvas')
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    if (side <= 0) throw new Error('That picture has no image to use. Try another.')
    for (const size of [256, 192, 128]) {
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')
      if (!context) throw new Error('This browser can’t prepare the picture. Try another.')
      context.fillStyle = '#fff'
      context.fillRect(0, 0, size, size)
      context.drawImage(bitmap.source, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
      for (const quality of [0.82, 0.68, 0.54, 0.4]) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        const prefix = 'data:image/jpeg;base64,'
        if (!dataUrl.startsWith(prefix)) throw new Error('This browser can’t prepare a JPEG picture. Try another.')
        const base64 = dataUrl.slice(prefix.length)
        const bytes = base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)
        if (bytes > 0 && bytes <= PROFILE_PICTURE_MAX_BYTES) return dataUrl
      }
    }
    throw new Error('That picture couldn’t be made small enough. Try another.')
  } finally {
    bitmap.close()
    canvas.width = 0
    canvas.height = 0
  }
}
