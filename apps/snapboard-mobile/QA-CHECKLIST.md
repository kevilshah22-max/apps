# Manual device QA — Snapboard storage safety

- [ ] Fresh install with no saved key opens an empty list.
- [ ] Add two snaps, force-close the app, reopen, and verify both remain.
- [ ] Delete one snap, reopen, and verify the deletion persists.
- [ ] Clear all, reopen, and verify the empty state persists.
- [ ] Seed malformed JSON under `nexa_snapboard_v2`; verify the normal UI stays blocked and data is not overwritten.
- [ ] On malformed JSON, choose Cancel; verify stored value remains unchanged.
- [ ] On malformed JSON, explicitly confirm discard; verify app starts empty.
- [ ] Simulate `getItem` rejection; verify retry is offered and destructive reset is not offered.
- [ ] Simulate `setItem` rejection during create/delete/clear; verify an error appears and the in-memory list is not changed.
- [ ] Restore storage writes and retry; verify later operations still work.
- [ ] Run on one Android device/emulator and one iOS device/simulator.
