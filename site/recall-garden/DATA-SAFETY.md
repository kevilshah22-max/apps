# RecallGarden data-safety gate

## Implemented safeguards
- Missing storage opens an empty garden; valid saved cards are loaded only after schema validation.
- Malformed JSON or an invalid card schema enters recovery mode. The original raw string remains untouched and normal editing is locked.
- The user can download the original unreadable text. The destructive reset control is disabled until that download is initiated and still requires an explicit confirmation.
- If browser storage cannot be read, reset is unavailable; the only recovery action is to retry access.
- If a write fails after the app has loaded, the current in-memory cards can be exported before a save retry.
- The daily review counter is validated independently, so a damaged counter does not discard otherwise valid cards.

## Verification checklist
- [ ] Open with no saved key.
- [ ] Load valid cards and verify they remain unchanged.
- [ ] Use malformed JSON and verify the original string is unchanged before reset.
- [ ] Use a valid JSON array with an invalid card schema and verify recovery mode.
- [ ] Simulate storage read failure; verify no reset control appears.
- [ ] Download raw data, cancel confirmation, and verify original data remains unchanged.
- [ ] Confirm reset only after recovery download and explicit confirmation.
- [ ] Simulate a storage write failure and verify the in-memory backup path.
- [ ] Complete browser-profile QA before public release.

RecallGarden is a learning tool, not a validated recordkeeping system. Browser storage can be cleared; users should export backups regularly.
