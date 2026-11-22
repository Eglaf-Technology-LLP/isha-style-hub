import { useRef } from "react";
import { discardUnsavedMedia } from "@/lib/mediaStorage";

// The photos/videos an upload field has put on R2 since it opened. When one
// of them leaves the field again (the cross, or a new one in its place) it
// is deleted from R2 at once - the form hasn't saved it, so nothing links to
// it. Saved ones (and any the server still finds mentioned) are left to the
// nightly clean-up, so cancelling a form never breaks a live photo.
export function useUnsavedUploads() {
  const uploaded = useRef(new Set<string>());
  return {
    added(urls: string[]) {
      urls.forEach((u) => uploaded.current.add(u));
    },
    removed(urls: (string | null | undefined)[]) {
      urls.forEach((u) => {
        if (u && uploaded.current.delete(u)) discardUnsavedMedia(u);
      });
    },
  };
}
