# Account picture upload — 29 October 2026

The API's default 16 KiB Kestrel HTTP body limit rejected valid compressed pictures before picture validation. The exception handler then relabelled the HTTP 413 as a malformed HTTP 400. Existing picture tests used eight signature bytes through TestServer, which does not enforce the production HTTP server limit.

The added real-loopback Kestrel tests reproduced the failure (four failed assertions on the original code). The picture endpoint now has a bounded 192 KiB transport allowance for base64/JSON, while the existing 96 KiB decoded storage ceiling stays in place. Oversized HTTP requests now retain status 413 and a specific size error. The default limit for ordinary endpoints is unchanged.

The picker automatically prepares camera files locally: native downsampling, centre-square crop, metadata-free JPEG encoding, and quality/dimension reduction to at most 24 KiB. It never uploads the original. A native image-element fallback supports devices where ImageBitmap decoding fails. Unreadable images give a useful message without changing the existing picture.

Focused checks passed: four real-HTTP/SQL tests, four encoder tests, and four desktop/phone browser journeys. The expanded full-suite tests additionally cover the existing maximum storage boundary, another account receiving no picture, and genuinely malformed JSON. Full gate results and tested commit are recorded in the pull request.

The browser journeys use a synthetic 3024×4032 JPEG larger than 1 MiB, landscape/transparent PNGs, actual browser canvas/decoders, reload, replacement, deletion, failed PUT/DELETE, retry of the same file, corrupted input, and native decoding fallback. The API boundary is controlled in browser tests; real HTTP and SQL tests independently verify persistence and a single picture row per account. [Phone screenshot after replacement](compressed-picture-phone.png).

All database tests use disposable local SQL and synthetic runners. Browser device emulation is not physical iPhone/Android proof; actual HEIC selection depends on native browser/OS support and still needs device validation. See [profile-picture behavior and storage](../../../profile-pictures.md).
