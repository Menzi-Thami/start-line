# Small account pictures

The account picker prepares the image on the runner's device. It never uploads the full camera file. It requests native downsampling, crops the centre to a square, then adjusts JPEG quality and, when needed, dimensions until the result is **at most 24 KiB (24,576 bytes)**. It starts at 256×256 pixels and can reduce to 192 or 128 pixels. Canvas re-encoding removes the original EXIF/GPS metadata; transparent source pixels get a white background.

The original picture remains on the device. If neither native ImageBitmap nor the browser's image decoder can read it, the picker explains which formats to try and keeps the current picture. JPEG, PNG and WebP are covered by browser tests. HEIC/HEIF support depends on the browser and operating system; the native image fallback helps where supported, but actual iPhone HEIC selection still requires physical-device verification. The app does not send an unsupported original to the server as a fallback.

The database stores decoded image bytes in one RunnerPhotos row keyed by RunnerId. Replacing the picture updates that row; removing it deletes the row. There is no application picture history. At the full UI budget, 1,000 pictures contain about 24.6 MB of JPEG data, plus SQL overhead. Plan/activity data and backups have their own storage requirements.

The existing server-side **96 KiB decoded-image limit remains** for compatibility with existing clients and stored pictures; it was not increased. Only PUT /api/v1/me/photo overrides the default 16 KiB HTTP request limit, using a bounded 192 KiB transport limit for base64/JSON overhead. The transport allowance is not the amount stored in SQL. Other endpoints retain their existing limits. A request exceeding its transport limit now returns HTTP 413 with code request_too_large, rather than falsely reporting malformed input.

## Regression checks

- RunnerPhotoHttpTests uses real loopback Kestrel HTTP and disposable local SQL, because TestServer does not enforce Kestrel body limits. It covers a 24 KiB picture, fresh-client reload, replacement keeping one row, repeated removal, failed replacement retaining the prior image, and transport/storage limits.
- profile-picture.test.ts covers byte-budget enforcement, dimension fallback and decoded-image cleanup.
- Playwright profile-picture.spec.ts uses real browser image decoders/canvas and synthetic 3024×4032 camera-size JPEGs, landscape transparent PNGs, failure/retry, the native image decoding fallback, corrupted files, reload and removal on desktop/phone emulation. The API responses are controlled; SQL persistence is independently covered by the real-HTTP tests. No production data or live accounts are used.

Run the complete scripts/check.sh gate before merging. See [testing.md](testing.md). Physical iPhone/Android file pickers and actual HEIC files remain separate device checks.
