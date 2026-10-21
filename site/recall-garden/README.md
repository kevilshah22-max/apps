# RecallGarden v0.1

RecallGarden is a lightweight, local-first flashcard app with a simple spaced-repetition review loop.

## MVP features
- Create, edit and delete question/answer cards
- Optional subject tags, search and filtering
- Review due cards or practise the full collection
- Rate recall as Again, Hard, Good or Easy
- Simple interval scheduling and daily progress counters
- Export a JSON backup
- Responsive interface and keyboard shortcuts (Space to flip; 1–4 to rate)

## Privacy
Cards and daily review counts stay in this browser's localStorage. There is no account, server, analytics or external API. Export a backup before clearing browser data or changing devices.

## Scheduling note
The interval scheduler is a simplified educational heuristic, not a validated memory system. Choose ratings that reflect your actual recall.

## Run
Open `index.html` in a modern browser or serve the containing directory with a static web server.

## Data recovery
RecallGarden validates stored card data before opening the editor. If saved data is malformed, the app locks editing, offers a download of the original saved text, and requires explicit confirmation before starting fresh. If browser storage cannot be read, it offers retry only. Automated regression tests are in `tests/storage-safety.test.mjs`.
