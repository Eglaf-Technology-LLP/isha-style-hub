import { useRef, useState } from "react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { ChevronLeft, ChevronRight, GripVertical, ImagePlus, Loader2, Maximize2, Play, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { uploadImageFile, type UploadFolder } from "@/hooks/useProducts";
import { cn } from "@/lib/utils";

// Product photos (and the product video) in the order shoppers see them.
// Drag a tile to move it, or use its arrows (phones, keyboards). The first
// tile is the cover - on the product card and first on the product page.
// Used by the boutique's and the admin's product page, and per colour for
// variant photos (photos only).

export const MAX_PHOTO_MB = 5;
export const MAX_VIDEO_MB = 50;
// What the shop's 3:4 frames look best with.
export const PHOTO_SIZE_TIP = "1200 × 1600 px or larger, portrait 3:4";
export const VIDEO_SIZE_TIP = "portrait 3:4 or 9:16, 1080 px wide or more, MP4, up to 50 MB";

export interface MediaValue {
  images: string[];
  // Only when the field has a video slot.
  videoUrl?: string | null;
  // Photos before the video: 0 = video first, null = after the last photo.
  videoPosition?: number | null;
}

type Item = { kind: "image"; url: string } | { kind: "video"; url: string };

export function mediaItems(v: MediaValue): Item[] {
  const items: Item[] = v.images.map((url) => ({ kind: "image", url }));
  if (v.videoUrl) {
    const at = v.videoPosition == null ? items.length : Math.min(Math.max(0, v.videoPosition), items.length);
    items.splice(at, 0, { kind: "video", url: v.videoUrl });
  }
  return items;
}

function fromItems(items: Item[], hasVideoSlot: boolean): MediaValue {
  const images = items.filter((i) => i.kind === "image").map((i) => i.url);
  if (!hasVideoSlot) return { images };
  const at = items.findIndex((i) => i.kind === "video");
  if (at === -1) return { images, videoUrl: null, videoPosition: null };
  // Last (after every photo) is stored as "after the photos", so photos
  // added later still come before it.
  const videoPosition = at === 0 ? 0 : at === items.length - 1 ? null : at;
  return { images, videoUrl: items[at].url, videoPosition };
}

// A warning when a photo is smaller than recommended or far from 3:4 -
// the shop crops other shapes in its cards.
async function photoSizeWarning(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    bitmap.close();
    if (width < 900 || height < 1200) {
      return `${file.name} is ${width} × ${height} px - smaller than the recommended 1200 × 1600, so it may look blurry when shoppers zoom in.`;
    }
    const ratio = width / height;
    if (Math.abs(ratio - 0.75) > 0.12) {
      return `${file.name} is ${width} × ${height} px - not portrait 3:4, so its edges are cut off in product cards.`;
    }
  } catch {
    // Can't read it here (e.g. HEIC) - the upload still goes ahead.
  }
  return null;
}

interface MediaArrangerProps {
  folder: UploadFolder;
  value: MediaValue;
  onChange: (next: MediaValue) => void;
  // Shows the video slot (product media, not variant photos).
  withVideo?: boolean;
  // Under the video, e.g. that it needs approval first.
  videoNote?: string;
  size?: "md" | "sm";
  // Shown before the size tips.
  hint?: string;
  showTips?: boolean;
}

export function MediaArranger({
  folder,
  value,
  onChange,
  withVideo = false,
  videoNote,
  size = "md",
  hint,
  showTips = true,
}: MediaArrangerProps) {
  const items = mediaItems(withVideo ? value : { images: value.images });
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(0);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [fileOver, setFileOver] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const hasVideo = withVideo && !!value.videoUrl;

  const commit = (next: Item[]) => onChange(fromItems(next, withVideo));

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    commit(next);
  };

  const removeAt = (index: number) => commit(items.filter((_, i) => i !== index));

  const uploadPhotos = async (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return toast.error("Please choose image files");
    const big = files.find((f) => f.size > MAX_PHOTO_MB * 1024 * 1024);
    if (big) return toast.error(`${big.name} is over ${MAX_PHOTO_MB}MB - please use a smaller photo`);
    for (const f of files) {
      const warning = await photoSizeWarning(f);
      if (warning) toast.warning(warning, { duration: 8000 });
    }
    setUploadingPhotos(files.length);
    const urls: string[] = [];
    for (const f of files) {
      const url = await uploadImageFile(f, folder);
      if (url) urls.push(url);
      setUploadingPhotos((n) => Math.max(0, n - 1));
    }
    setUploadingPhotos(0);
    if (urls.length < files.length) toast.error(`${files.length - urls.length} photo(s) failed to upload - please try again`);
    if (urls.length) onChange({ ...value, images: [...value.images, ...urls] });
  };

  const uploadVideo = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) return toast.error("Please choose a video file");
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      return toast.error(`Video is over ${MAX_VIDEO_MB}MB - please use a shorter or compressed clip`);
    }
    setUploadingVideo(true);
    const url = await uploadImageFile(file, folder);
    setUploadingVideo(false);
    if (!url) return toast.error("Video upload failed - please try again");
    // A new video keeps the old one's place; the first video goes last.
    onChange({ ...value, videoUrl: url, videoPosition: value.videoUrl ? value.videoPosition ?? null : null });
  };

  const tile = size === "md" ? "w-[92px] sm:w-[104px]" : "w-[68px]";

  return (
    <div className="space-y-3">
      <div
        className={cn("flex flex-wrap gap-2.5 rounded-lg p-1 -m-1 transition-colors", fileOver && "bg-primary/5 ring-2 ring-primary/40")}
        onDragOver={(e) => {
          if (dragFrom !== null || !e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setFileOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileOver(false);
        }}
        onDrop={(e) => {
          if (dragFrom !== null || !e.dataTransfer.files.length) return;
          e.preventDefault();
          setFileOver(false);
          const files = Array.from(e.dataTransfer.files);
          const video = files.find((f) => f.type.startsWith("video/"));
          if (video && withVideo) uploadVideo(video);
          const photos = files.filter((f) => f.type.startsWith("image/"));
          if (photos.length) uploadPhotos(photos);
        }}
      >
        {items.map((item, index) => (
          <div
            key={`${item.kind}-${item.url}`}
            draggable
            onDragStart={(e) => {
              setDragFrom(index);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(index));
            }}
            onDragOver={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              setDragOver(index);
            }}
            onDrop={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              e.stopPropagation();
              move(dragFrom, index);
              setDragFrom(null);
              setDragOver(null);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
            className={cn(
              "group relative aspect-[3/4] shrink-0 cursor-grab overflow-hidden rounded-md border bg-muted active:cursor-grabbing",
              tile,
              index === 0 ? "border-primary" : "border-border",
              dragOver === index && dragFrom !== index && "ring-2 ring-primary ring-offset-2",
              dragFrom === index && "opacity-40",
            )}
          >
            {item.kind === "image" ? (
              <img src={item.url} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <button
                type="button"
                onClick={() => setPlaying(item.url)}
                className="relative block h-full w-full bg-ink"
                aria-label="Play the video full screen"
              >
                <video src={item.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-ink/30">
                  <Play className="h-6 w-6 fill-ivory text-ivory" />
                </span>
              </button>
            )}

            <span
              className={cn(
                "pointer-events-none absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none",
                index === 0 ? "bg-primary text-primary-foreground" : "bg-background/90 text-foreground",
              )}
            >
              {size === "sm"
                ? index + 1
                : index === 0
                  ? item.kind === "video"
                    ? "1 · Video first"
                    : "1 · Cover"
                  : item.kind === "video"
                    ? `${index + 1} · Video`
                    : index + 1}
            </span>
            <button
              type="button"
              onClick={() => removeAt(index)}
              className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 shadow-sm hover:text-destructive"
              aria-label={item.kind === "video" ? "Remove the video" : `Remove photo ${index + 1}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {items.length > 1 && (
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/55 to-transparent px-0.5 pb-0.5 pt-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  className="rounded bg-background/90 p-0.5 disabled:invisible"
                  aria-label="Move earlier"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <GripVertical className="h-3.5 w-3.5 text-white/90" aria-hidden />
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={index === items.length - 1}
                  className="rounded bg-background/90 p-0.5 disabled:invisible"
                  aria-label="Move later"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}

        {Array.from({ length: uploadingPhotos }).map((_, i) => (
          <div key={`up-${i}`} className={cn("flex aspect-[3/4] shrink-0 items-center justify-center rounded-md border border-dashed bg-muted/50", tile)}>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ))}

        <button
          type="button"
          onClick={() => photoInput.current?.click()}
          className={cn(
            "flex aspect-[3/4] shrink-0 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-muted-foreground/30 px-1 text-center text-muted-foreground transition-colors hover:border-primary hover:text-primary",
            tile,
          )}
        >
          <ImagePlus className={size === "md" ? "h-5 w-5" : "h-4 w-4"} />
          <span className="text-[11px] leading-tight">Add photos</span>
        </button>
        {withVideo && !hasVideo && (
          <button
            type="button"
            onClick={() => videoInput.current?.click()}
            disabled={uploadingVideo}
            className={cn(
              "flex aspect-[3/4] shrink-0 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-muted-foreground/30 px-1 text-center text-muted-foreground transition-colors hover:border-primary hover:text-primary",
              tile,
            )}
          >
            {uploadingVideo ? <Loader2 className="h-5 w-5 animate-spin" /> : <Video className="h-5 w-5" />}
            <span className="text-[11px] leading-tight">{uploadingVideo ? "Uploading…" : "Add video"}</span>
          </button>
        )}
        <input
          ref={photoInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            uploadPhotos(e.target.files);
            e.target.value = "";
          }}
        />
        {withVideo && (
          <input
            ref={videoInput}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              uploadVideo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        )}
      </div>

      {hasVideo && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={value.videoPosition === 0}
              onCheckedChange={(on) => onChange({ ...value, videoPosition: on === true ? 0 : null })}
            />
            Show video first
          </label>
          <button
            type="button"
            onClick={() => setPlaying(value.videoUrl!)}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <Maximize2 className="h-3.5 w-3.5" /> Play full screen
          </button>
          <button
            type="button"
            onClick={() => videoInput.current?.click()}
            disabled={uploadingVideo}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {uploadingVideo && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Replace video
          </button>
        </div>
      )}

      {(hint || showTips || (withVideo && videoNote)) && (
        <div className="space-y-0.5 text-xs text-muted-foreground">
          {hint && <p>{hint}</p>}
          {showTips && (
            <>
              <p>
                <span className="font-medium text-foreground">Recommended photo size:</span> {PHOTO_SIZE_TIP} (the shop shows
                every photo in a 3:4 frame), JPG / PNG / WebP up to {MAX_PHOTO_MB} MB. Keep the whole piece in the frame
                with a little space around it.
              </p>
              {withVideo && (
                <p>
                  <span className="font-medium text-foreground">Recommended video:</span> {VIDEO_SIZE_TIP}.
                </p>
              )}
            </>
          )}
          {withVideo && videoNote && <p>{videoNote}</p>}
        </div>
      )}

      <Dialog open={!!playing} onOpenChange={(o) => !o && setPlaying(null)}>
        <DialogContent className="flex h-[100dvh] max-h-none w-screen max-w-none items-center justify-center border-none bg-black p-0 sm:rounded-none [&>button:last-child]:text-white">
          <VisuallyHidden>
            <DialogTitle>Product video</DialogTitle>
          </VisuallyHidden>
          {playing && <video src={playing} controls autoPlay playsInline className="h-full w-full object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
