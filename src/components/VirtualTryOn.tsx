import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sparkles, Upload, Loader2, RefreshCw, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface VirtualTryOnProps {
  productName: string;
  productImageUrl?: string;
}

const MAX_DIM = 1024;

async function fileToResizedDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

export function VirtualTryOn({ productName, productImageUrl }: VirtualTryOnProps) {
  const [open, setOpen] = useState(false);
  const [personImage, setPersonImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
      return;
    }
    try {
      const resized = await fileToResizedDataUrl(file);
      setPersonImage(resized);
      setResultImage(null);
    } catch {
      toast.error("Could not read that image");
    }
  };

  const handleTryOn = async () => {
    if (!personImage) {
      toast.error("Upload your photo first");
      return;
    }
    if (!productImageUrl) {
      toast.error("This product has no image to try on");
      return;
    }
    setLoading(true);
    setResultImage(null);
    try {
      const { data, error } = await supabase.functions.invoke("virtual-try-on", {
        body: { personImage, productImageUrl, productName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.imageUrl) throw new Error("No image returned");
      setResultImage(data.imageUrl);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Try-on failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!resultImage) return;
    const a = document.createElement("a");
    a.href = resultImage;
    a.download = `try-on-${productName.replace(/\s+/g, "-").toLowerCase()}.png`;
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="w-full">
          <Sparkles className="h-4 w-4 mr-2" />
          Virtual Try-On
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Virtual Try-On
          </DialogTitle>
          <DialogDescription>
            Upload a clear, full-body photo and see how “{productName}” looks on
            you. Your photo is used only to generate this preview.
          </DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* Your photo */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Your photo</p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full aspect-[3/4] rounded-xl border-2 border-dashed border-border hover:border-primary transition-colors overflow-hidden flex items-center justify-center bg-muted/30"
            >
              {personImage ? (
                <img
                  src={personImage}
                  alt="Your uploaded photo for virtual try-on"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
                  <Upload className="h-6 w-6" />
                  Upload photo
                </span>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
          </div>

          {/* Result */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Try-on preview</p>
            <div className="w-full aspect-[3/4] rounded-xl border border-border overflow-hidden flex items-center justify-center bg-muted/30">
              {loading ? (
                <span className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  Styling your look…
                </span>
              ) : resultImage ? (
                <img
                  src={resultImage}
                  alt={`Virtual try-on preview of ${productName}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-sm text-muted-foreground px-6 text-center">
                  Your AI try-on preview will appear here
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={handleTryOn} disabled={loading || !personImage} className="flex-1">
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : resultImage ? (
              <RefreshCw className="h-4 w-4 mr-2" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {resultImage ? "Try again" : "Generate try-on"}
          </Button>
          {resultImage && (
            <Button variant="outline" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Save
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          AI-generated preview — actual fit, colour and drape may vary.
        </p>
      </DialogContent>
    </Dialog>
  );
}
