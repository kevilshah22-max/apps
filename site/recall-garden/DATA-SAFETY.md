# RecallGarden data-safety review

The current initial loader silently replaces malformed saved JSON with an empty card list in memory. The next save can overwrite the original unreadable data.

Recommended fix: validate the stored card schema before initialising the app; stop normal startup if the data cannot be read; preserve the raw saved text; provide a recovery download; and require explicit user confirmation before discarding unreadable data. If browser storage itself cannot be read, do not offer a destructive reset.

All handling should remain local. No account, analytics, backend, or external API is needed.

## Validation checklist
- [ ] Missing key opens an empty garden.
- [ ] Valid cards load unchanged.
- [ ] Malformed JSON stays byte-for-byte unchanged until explicit reset.
- [ ] Invalid card schema is not silently reset.
- [ ] Storage read failure offers retry but no reset.
- [ ] Recovery download is available before reset.
- [ ] Reset requires confirmation and works only after the recovery action.
- [ ] Review counter corruption does not discard valid cards.
- [ ] Verify in a real browser profile before merging.