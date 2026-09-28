import { useRef, useState } from "react";
import { Loader2, Upload, X, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { uploadImageFile } from "@/hooks/useProducts";

interface ImageDropzoneProps {
  // "products" for admin uploads, "vendor-uploads" for anything a vendor
  // (or admin acting on a vendor's behalf) writes - the bucket's RLS only
  // allows vendors to write under that specific prefix.
  folder: "products" | "vendor-uploads";
  value: string[];
  onChange: (urls: string[]) => void;
  multiple?: boolean;
  maxFiles?: number;
  className?: string;
}

const MAX_FILE_SIZE_MB = 5;

// The single upload control for every image field in the app - real
// drag-and-drop (not just a styled click target, which is all every prior
// "dropzone" in this codebase actually was) plus click-to-browse, used for
// both single-image fields (wrapped by SingleImageDropzone below) and
// multi-image fields (product galleries) via the same component.
export function ImageDropzone({ folder, value, onChange, multiple = true, maxFiles, className = "" }: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    let files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) {
      toast.error("Please choose an image file");
      return;
    }
    if (!multiple) files = files.slice(0, 1);
    if (maxFiles) files = files.slice(0, Math.max(0, maxFiles - value.length));
    const oversized = files.find((f) => f.size > MAX_FILE_SIZE_MB * 1024 * 1024);
    if (oversized) {
      toast.error(`${oversized.name} is over ${MAX_FILE_SIZE_MB}MB - please use a smaller image`);
      return;
    }
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const url = await uploadImageFile(file, folder);
        if (url) uploaded.push(url);
      }
      if (uploaded.length === 0) {
        toast.error("Upload failed - please try again");
        return;
      }
      if (uploaded.length < files.length) {
        toast.warning(`${files.length - uploaded.length} image(s) failed to upload`);
      }
      onChange(multiple ? [...value, ...uploaded] : uploaded);
    } finally {
      setUploading(false);
    }
  };

  const removeAt = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className={className}>
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
          handleFiles(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {uploading ? (
          <Loader2 className="h-6 w-6 mx-auto animate-spin text-primary" />
        ) : (
          <>
            {multiple ? <Upload className="h-6 w-6 mx-auto text-muted-foreground" /> : <ImagePlus className="h-6 w-6 mx-auto text-muted-foreground" />}
            <p className="text-sm text-muted-foreground mt-2">
              Drag and drop {multiple ? "images" : "an image"} here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">Up to {MAX_FILE_SIZE_MB}MB each</p>
          </>
        )}
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {value.map((url, idx) => (
            <div key={url + idx} className="relative h-20 w-20 rounded-md overflow-hidden border border-border group">
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(idx);
                }}
                className="absolute top-0.5 right-0.5 bg-background/90 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove image"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Ergonomic wrapper for the common "one image, one URL (or none)" case -
// logo, banner, category image, variant image - so callers don't all have
// to juggle single-element arrays themselves.
export function SingleImageDropzone({
  folder,
  value,
  onChange,
  className,
}: {
  folder: "products" | "vendor-uploads";
  value: string | null;
  onChange: (url: string | null) => void;
  className?: string;
}) {
  return (
    <ImageDropzone
      folder={folder}
      multiple={false}
      value={value ? [value] : []}
      onChange={(urls) => onChange(urls[0] ?? null)}
      className={className}
    />
  );
}
