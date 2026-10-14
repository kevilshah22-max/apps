export class UnreadableSnapDataError extends Error {
  constructor(message = "Saved snaps are not valid JSON or do not match the expected format.") {
    super(message);
    this.name = "UnreadableSnapDataError";
  }
}

export function isValidSnapList(value) {
  return Array.isArray(value) && value.every((snap) =>
    snap !== null &&
    typeof snap === "object" &&
    typeof snap.id === "string" &&
    typeof snap.title === "string" &&
    typeof snap.body === "string" &&
    typeof snap.kind === "string" &&
    typeof snap.energy === "string" &&
    Array.isArray(snap.tags) &&
    snap.tags.every((tag) => typeof tag === "string") &&
    Number.isFinite(snap.created)
  );
}

export async function readSnapsSafely(storage, key) {
  const raw = await storage.getItem(key);
  if (raw === null || raw === undefined) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UnreadableSnapDataError("Saved snaps contain malformed JSON.");
  }

  if (!isValidSnapList(parsed)) {
    throw new UnreadableSnapDataError("Saved snaps do not match the expected data format.");
  }

  return parsed;
}

/**
 * Serialises writes and only publishes an in-memory change after storage confirms
 * the write. Failed writes leave the current in-memory list unchanged.
 */
export function createSnapPersistence({ storage, key, getCurrent, onCommitted, onError }) {
  let queue = Promise.resolve();

  return function persist(update) {
    const operation = queue.then(async () => {
      const next = update(getCurrent());
      await storage.setItem(key, JSON.stringify(next));
      onCommitted(next);
      return next;
    });

    // Keep the queue usable after a failed write, without swallowing the caller's error.
    queue = operation.catch(() => undefined);

    return operation.catch((error) => {
      if (onError) onError(error);
      throw error;
    });
  };
}
