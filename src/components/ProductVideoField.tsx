import { useRef, useState } from "react";
import { Loader2, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { uploadImageFile } from "@/hooks/useProducts";

const MAX_VIDEO_MB = 50;

interface ProductVideoFieldProps {
  folder: "products" | "vendor-uploads";
  idPrefix: string;
  videoUrl: string | null;
  isPrimary: boolean;
  onChange: (next: { videoUrl: string | null; isPrimary: boolean }) => void;
  // Shown under the field, e.g. that the video needs approval first.
  note?: string;
}

export function ProductVideoField({ folder, idPrefix, videoUrl, isPrimary, onChange, note }: ProductVideoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) return toast.error("Please choose a video file");
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      return toast.error(`Video is over ${MAX_VIDEO_MB}MB - please use a shorter or compressed clip`);
    }
    setUploading(true);
    const url = await uploadImageFile(file, folder);
    setUploading(false);
    if (!url) return toast.error("Video upload failed - please try again");
    onChange({ videoUrl: url, isPrimary });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div>
        <Label className="text-sm font-medium">Product video (optional)</Label>
        <p className="text-xs text-muted-foreground">
          A short clip of this product, up to {MAX_VIDEO_MB}MB.{note ? ` ${note}` : ""}
        </p>
      </div>

      {videoUrl ? (
        <div className="relative">
          <video src={videoUrl} controls muted playsInline className="w-full max-h-56 rounded-md border border-border bg-black" />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="absolute top-2 right-2 h-7 gap-1"
            onClick={() => onChange({ videoUrl: null, isPrimary: false })}
          >
            <X className="h-3.5 w-3.5" /> Remove
          </Button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
            dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {uploading ? (
            <Loader2 className="h-6 w-6 mx-auto animate-spin text-primary" />
          ) : (
            <>
              <Video className="h-6 w-6 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-2">Drag and drop a video here, or click to browse</p>
            </>
          )}
        </div>
      )}

      {videoUrl && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor={`${idPrefix}-video-primary`} className="text-sm">
              Show video first
            </Label>
            <p className="text-xs text-muted-foreground">
              Off: the main image leads and the video plays in a small highlight frame over it.
            </p>
          </div>
          <Switch
            id={`${idPrefix}-video-primary`}
            checked={isPrimary}
            onCheckedChange={(checked) => onChange({ videoUrl, isPrimary: checked })}
          />
        </div>
      )}
    </div>
  );
}
