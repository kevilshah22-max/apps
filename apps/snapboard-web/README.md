# Snapboard Web

Zero-cost public web MVP. Local-first, no account, no backend.

## Backup and restore (v1.1)
- Export notes as readable TXT or structured JSON.
- Import a JSON backup by merging it with existing local notes; matching records are skipped.
- Invalid records are skipped, identifier collisions are repaired, and JSON files over 5 MB are rejected.
- No account, server, analytics, or external API is used. Browser storage can still be lost if browser data is cleared, so keep a backup somewhere safe.
