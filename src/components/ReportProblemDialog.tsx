import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageDropzone } from "@/components/ImageDropzone";
import { uploadUserFile } from "@/lib/userPhotoUpload";
import { VIDEO_ACCEPT, VIDEO_FORMATS, prepareVideo, uploadProblemMessage } from "@/lib/uploadPrep";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { formatDateTimeInWords } from "@/lib/dates";
import {
  PROBLEM_EVIDENCE_FOLDER,
  PROBLEM_MAX_PHOTOS,
  PROBLEM_MIN_PHOTOS,
  PROBLEM_NOTE_MAX,
  PROBLEM_NOTE_MIN,
  PROBLEM_REASONS,
  PROBLEM_REPORT_WINDOW_HOURS,
  type ProblemReason,
} from "@/lib/problemReport";

// Report a problem (src/lib/problemReport.ts): within 24 hours of delivery,
// with the unboxing video and photos. Sent to supabase/functions/
// report-order-problem, which gives it a ticket number and tells the admins
// and the boutique.

export interface ProblemReportItem {
  id: string;
  product_title: string;
  size: string | null;
  color: string | null;
  quantity: number;
  image: string | null;
}

export function ReportProblemDialog({
  orderId,
  items,
  closesAt,
  open,
  onOpenChange,
  onReported,
}: {
  orderId: string;
  // Only pieces whose part was delivered less than 24 hours ago.
  items: ProblemReportItem[];
  closesAt: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReported?: () => void;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    items.length === 1 ? { [items[0].id]: true } : {},
  );
  const [reason, setReason] = useState<ProblemReason | "">("");
  const [note, setNote] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  // 0-1 while a video over 50 MB is being compressed.
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ticket: string; ackSent: boolean } | null>(null);

  const chosen = items.filter((i) => selected[i.id]);
  const noteLength = note.trim().length;
  const problems = [
    chosen.length === 0 && "Choose the piece(s) the problem is with.",
    !reason && "Choose what the problem is.",
    !videoUrl && "Add your unboxing video.",
    photoUrls.length < PROBLEM_MIN_PHOTOS && "Add at least one photo of the problem.",
    noteLength < PROBLEM_NOTE_MIN && `Tell us a little more in the note (at least ${PROBLEM_NOTE_MIN} characters).`,
  ].filter((p): p is string => !!p);

  const handleVideo = async (picked: File | undefined) => {
    if (!picked) return;
    setUploadingVideo(true);
    try {
      let file: File;
      try {
        file = await prepareVideo(picked, setVideoProgress);
      } catch (e) {
        toast.error(uploadProblemMessage(e, picked.name), { duration: 10000 });
        return;
      } finally {
        setVideoProgress(null);
      }
      const url = await uploadUserFile(file, PROBLEM_EVIDENCE_FOLDER);
      if (!url) {
        toast.error("Video upload failed - please try again");
        return;
      }
      setVideoUrl(url);
    } finally {
      setUploadingVideo(false);
    }
  };

  const submit = async () => {
    setServerError(null);
    if (problems.length) {
      toast.error(problems[0]);
      return;
    }
    setSubmitting(true);
    const { data, errorMessage } = await invokeEdgeFunction<{ ticket: string; ack_sent: boolean }>("report-order-problem", {
      order_id: orderId,
      order_item_ids: chosen.map((i) => i.id),
      reason,
      note: note.trim(),
      video_url: videoUrl,
      photo_urls: photoUrls,
    });
    setSubmitting(false);
    if (errorMessage || !data?.ticket) {
      setServerError(errorMessage || "Something went wrong. Please try again.");
      return;
    }
    setResult({ ticket: data.ticket, ackSent: data.ack_sent });
    onReported?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto rounded-none sm:rounded-none">
        {result ? (
          <div className="py-2 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-primary" />
            <DialogHeader className="space-y-2 text-center sm:text-center">
              <DialogTitle className="font-serif text-2xl font-normal">Problem reported</DialogTitle>
              <DialogDescription>Your ticket number is</DialogDescription>
            </DialogHeader>
            <p className="my-3 select-all font-mono text-2xl font-semibold tracking-wider text-primary">{result.ticket}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {result.ackSent ? "We've emailed it to you too. " : "Please note your ticket number. "}
              Our team and the boutique have your video and photos, and we'll get back to you within 48 hours. Please
              keep the piece, its tag and the packaging as they are until then.
            </p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-6 h-11 w-full bg-primary text-[11px] font-medium uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl font-normal">Report a problem</DialogTitle>
              <DialogDescription>
                Damaged, wrong or missing piece, or a measurement more than 1 inch off? Tell us within{" "}
                {PROBLEM_REPORT_WINDOW_HOURS} hours of delivery
                {closesAt ? ` (until ${formatDateTimeInWords(closesAt)})` : ""}, with your unboxing video and photos.
              </DialogDescription>
            </DialogHeader>

            <div className="flex gap-2 border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>
                The <strong>unboxing video</strong> and at least one <strong>photo</strong> are needed: the video of
                opening the parcel, and photos that show the problem clearly. Keep the tag on and the packaging until we
                get back to you.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="block">Which piece?</Label>
              {items.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-center gap-3 border border-border p-3 hover:bg-muted/40"
                >
                  <Checkbox
                    checked={!!selected[item.id]}
                    onCheckedChange={(v) => setSelected((s) => ({ ...s, [item.id]: v === true }))}
                  />
                  {item.image ? (
                    <img src={item.image} alt="" className="h-12 w-10 shrink-0 object-cover" />
                  ) : (
                    <span className="h-12 w-10 shrink-0 bg-ivory" />
                  )}
                  <span className="min-w-0 text-sm">
                    <span className="block truncate">{item.product_title}</span>
                    <span className="text-xs text-muted-foreground">
                      {[item.size && `Size ${item.size}`, item.color, `Qty ${item.quantity}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="problem-reason">What's the problem?</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as ProblemReason)}>
                <SelectTrigger id="problem-reason">
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  {PROBLEM_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="block">Unboxing video (required)</Label>
              <p className="text-xs text-muted-foreground">
                One video, {VIDEO_FORMATS}. A large video is compressed automatically.
              </p>
              {videoUrl ? (
                <div className="relative">
                  <video src={videoUrl} controls className="max-h-56 w-full border border-border bg-black" />
                  <button
                    type="button"
                    onClick={() => setVideoUrl(null)}
                    className="absolute right-2 top-2 inline-flex h-7 items-center gap-1 bg-background/90 px-2 text-xs hover:bg-background"
                  >
                    <X className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              ) : (
                <label className="inline-flex cursor-pointer">
                  <span className="inline-flex items-center gap-1.5 border border-foreground px-3 py-2 text-xs font-medium hover:bg-muted">
                    {uploadingVideo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
                    {uploadingVideo
                      ? videoProgress != null
                        ? `Compressing video ${Math.round(videoProgress * 100)}%...`
                        : "Uploading video..."
                      : "Add the unboxing video"}
                  </span>
                  <input
                    type="file"
                    accept={VIDEO_ACCEPT}
                    className="hidden"
                    disabled={uploadingVideo}
                    onChange={(e) => {
                      handleVideo(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="block">
                Photos (at least {PROBLEM_MIN_PHOTOS}, up to {PROBLEM_MAX_PHOTOS})
              </Label>
              <ImageDropzone
                folder="vendor-uploads"
                value={photoUrls}
                onChange={setPhotoUrls}
                maxFiles={PROBLEM_MAX_PHOTOS}
                uploadFile={(file) => uploadUserFile(file, PROBLEM_EVIDENCE_FOLDER)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="problem-note">Note</Label>
              <Textarea
                id="problem-note"
                rows={4}
                maxLength={PROBLEM_NOTE_MAX}
                placeholder="What's wrong, and where on the piece?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <p className="text-right text-xs text-muted-foreground">
                {noteLength < PROBLEM_NOTE_MIN ? `${PROBLEM_NOTE_MIN - noteLength} more characters needed` : `${noteLength} / ${PROBLEM_NOTE_MAX}`}
              </p>
            </div>

            {serverError && (
              <p role="alert" className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {serverError}
              </p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={submitting || uploadingVideo}
              className="flex h-11 w-full items-center justify-center gap-2 bg-primary text-[11px] font-medium uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Sending" : "Submit report"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
