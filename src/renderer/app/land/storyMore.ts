// The story's next episode, written by the land once every chapter so far is cleared (rev 6 phase
// 3: a `story.more` event of the world's history, so everyone in the world walks the same story).
// An attached world is asked first whether someone is writing it (`more:eN`, D15); the id is the
// next free `eN` and the gate a free chunk on the trail — a gate someone's place took meanwhile is
// moved with no model call (`more-gate-taken`). Before a save has a world, the episode is kept in
// the save as it always was.

import {
  appendToWorld,
  onHistory,
  seenHead,
  syncWorld,
  waitForFold,
  worldNow,
  writeBlocker,
} from "@renderer/history";
import { useLandStore } from "@renderer/state";
import { type ContinueStoryRequest, writeNextChapter } from "@renderer/works/continueStory";
import { nextFreeEpisode } from "@shared/history/admit";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { type StoryEpisode, trailPlace } from "@shared/story";
import { claimTarget } from "@shared/worldProtocol";
import { abandonClaim, claimToWrite } from "./claims";

function liveEpisode(id: string): StoryEpisode | null {
  return worldNow()?.more[id]?.live?.body.episode ?? null;
}

/** Writes the next episode onto the story's map; see the header. One model call, plus one repair. */
export async function writeNextEpisode(
  request: ContinueStoryRequest,
): Promise<Result<StoryEpisode>> {
  const blocked = writeBlocker();
  if (blocked !== null) return { ok: false, error: blocked };
  if (!onHistory()) {
    const written = await writeNextChapter(request);
    if (written.ok) useLandStore.getState().addEpisode(written.value);
    return written;
  }
  const now = worldNow();
  const next = now === null ? null : nextFreeEpisode(now);
  if (next === null) {
    return err("story-ended", "The story has reached its last chapter.");
  }
  const target = claimTarget({ kind: "more", episodeId: next });
  const claimed = await claimToWrite(target);
  if (claimed.kind === "refused") return { ok: false, error: claimed.error };
  if (claimed.kind === "written") {
    await waitForFold((fold) => fold.more[next]?.live != null);
    const theirs = liveEpisode(next);
    return theirs === null
      ? err("more-not-arrived", "Someone wrote the next chapter, but it has not arrived yet.")
      : ok(theirs);
  }
  // `seen`: the history's head when the next chapter began to be written (D2).
  const seen = seenHead();
  const kept: { episode: StoryEpisode | null } = { episode: null };
  // Appended from inside the model's repair (D5): a refusal of what it wrote goes back to it once;
  // a gate someone's place took meanwhile is moved with no model call; anything else ends it.
  const written = await writeNextChapter(request, async (drafted) => {
    let episode: StoryEpisode = { ...drafted, id: next };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const stored = await appendToWorld({ kind: "story.more", body: { episode }, seen });
      if (stored.ok) {
        kept.episode = liveEpisode(next) ?? episode;
        return stored;
      }
      if (stored.error.code !== "more-gate-taken") return stored;
      await syncWorld();
      const places = useLandStore.getState().world?.places ?? [];
      episode = { ...episode, ...trailPlace(request.episodes, places) };
    }
    return err(
      "more-gate-taken",
      "No free ground was found for the next chapter's gate.",
      "Retry.",
    );
  }).catch((thrown: unknown) => fail(toError(thrown, "more-failed")));
  if (!written.ok || kept.episode === null) {
    // Every way out but an appended episode ends the relay "abort" and releases the lease.
    abandonClaim(target, claimed);
    return written.ok ? err("more-not-kept", "The next chapter was not kept.") : written;
  }
  claimed.relay?.end("done");
  return ok(kept.episode);
}
