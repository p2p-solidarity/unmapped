// The look step's concept pictures (rev 6 phase 2, D1): three drawn at once by main from the saved
// Look card, each shown the moment it lands. The draft remembers which pictures it has and which one
// was chosen (`draft.look`); the bytes stay in main and come back only as data URLs. A redraw keeps
// the chosen picture and replaces the rest. Leaving Create or closing the draft cancels every draw
// still running (the abort reaches the image request in main).

import {
  type CreateDraft,
  type DraftLook,
  LOOK_DRAWS,
  type LookPicture,
} from "@shared/createDraft";
import { type AppError, idle, type Loadable, loading } from "@shared/result";
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";

export interface LookPictures {
  /** Every picture of the open draft by id, as a data URL. */
  pictures: Loadable<Record<string, string>>;
  /** Draws still running. */
  drawing: number;
  error: AppError | null;
  draw(): Promise<void>;
  cancel(): void;
  pick(id: string): void;
  /** The chosen picture's PNG bytes, or null when none is chosen. */
  chosenPng(draft: CreateDraft): Uint8Array | null;
}

const EMPTY_LOOK: DraftLook = { pictures: [], chosen: null };

function lookOf(draft: CreateDraft): DraftLook {
  return draft.look ?? EMPTY_LOOK;
}

/** PNG bytes from a `data:image/png;base64,` URL (the only kind main sends). */
function pngOf(dataUrl: string): Uint8Array | null {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) return null;
  const binary = atob(dataUrl.slice(prefix.length));
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  return bytes;
}

const cancelled = (error: AppError): boolean =>
  error.code === "cancelled" || error.code === "request-aborted";

export function useLookPictures(
  draftId: string | null,
  latest: MutableRefObject<CreateDraft | null>,
  saves: MutableRefObject<Promise<void>>,
  update: (change: (current: CreateDraft) => CreateDraft) => void,
): LookPictures {
  const [pictures, setPictures] = useState<Loadable<Record<string, string>>>(idle());
  const [drawing, setDrawing] = useState(0);
  const [error, setError] = useState<AppError | null>(null);
  const requests = useRef(new Set<string>());
  const starting = useRef(false);

  const cancel = useCallback((): void => {
    for (const requestId of requests.current) {
      void window.seed.createDrafts.cancelLook(requestId);
    }
  }, []);

  // A draft's pictures are read when it opens; a closed draft's draws are cancelled.
  useEffect(() => {
    setError(null);
    if (draftId === null) {
      setPictures(idle());
      return;
    }
    let alive = true;
    setPictures(loading());
    void window.seed.createDrafts.looks(draftId).then((result) => {
      if (!alive) return;
      setPictures(
        result.ok
          ? {
              status: "ready",
              value: Object.fromEntries(result.value.map((one) => [one.id, one.dataUrl])),
            }
          : { status: "error", error: result.error },
      );
    });
    return () => {
      alive = false;
      cancel();
    };
  }, [draftId, cancel]);

  const landed = (id: string, picture: LookPicture): void => {
    setPictures((state) =>
      state.status === "ready"
        ? { status: "ready", value: { ...state.value, [picture.id]: picture.dataUrl } }
        : { status: "ready", value: { [picture.id]: picture.dataUrl } },
    );
    update((one) =>
      one.draftId !== id
        ? one
        : {
            ...one,
            look: { ...lookOf(one), pictures: [...lookOf(one).pictures, picture.id] },
          },
    );
  };

  const draw = async (): Promise<void> => {
    const current = latest.current;
    if (current === null || starting.current || requests.current.size > 0) return;
    const id = current.draftId;
    setError(null);
    starting.current = true;
    // Main draws from the draft it has on disk: every edit must be saved first.
    await saves.current;
    const chosen = lookOf(current).chosen;
    const keep = chosen === null ? [] : [chosen];
    const discarded = await window.seed.createDrafts.discardLooks(id, keep);
    if (!discarded.ok) {
      starting.current = false;
      setError(discarded.error);
      return;
    }
    update((one) =>
      one.draftId !== id ? one : { ...one, look: { pictures: keep, chosen, skipped: false } },
    );
    const ids = Array.from({ length: LOOK_DRAWS }, () => crypto.randomUUID());
    for (const requestId of ids) requests.current.add(requestId);
    starting.current = false;
    setDrawing(ids.length);
    await Promise.all(
      ids.map(async (requestId, view) => {
        const result = await window.seed.createDrafts.drawLook(id, view, requestId);
        requests.current.delete(requestId);
        setDrawing(requests.current.size);
        if (result.ok) landed(id, result.value);
        else if (!cancelled(result.error)) setError((before) => before ?? result.error);
      }),
    );
  };

  const pick = (id: string): void =>
    update((one) => {
      const look = lookOf(one);
      if (!look.pictures.includes(id)) return one;
      return { ...one, look: { ...look, chosen: look.chosen === id ? null : id, skipped: false } };
    });

  const chosenPng = (draft: CreateDraft): Uint8Array | null => {
    const chosen = lookOf(draft).chosen;
    if (chosen === null || pictures.status !== "ready") return null;
    const url = pictures.value[chosen];
    return url === undefined ? null : pngOf(url);
  };

  return { pictures, drawing, error, draw, cancel, pick, chosenPng };
}
