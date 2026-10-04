import { Lock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ImageDropzone } from "@/components/ImageDropzone";
import { uploadProductOriginal, useSignedOriginalUrls } from "@/lib/productOriginals";

interface AiOriginalPhotosFieldProps {
  ownerFolder: string;
  value: string[];
  onChange: (paths: string[]) => void;
}

export function AiOriginalPhotosField({ ownerFolder, value, onChange }: AiOriginalPhotosFieldProps) {
  const signedUrls = useSignedOriginalUrls(value);

  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/50 p-3">
      <div>
        <Label className="text-sm font-medium">
          Original product photo <span className="text-destructive">*</span>
        </Label>
        <p className="text-xs text-muted-foreground flex items-start gap-1">
          <Lock className="h-3 w-3 mt-0.5 shrink-0" />
          Upload at least one real, unedited photo of the actual product. It's only seen by the
          AllBoutiqs team to verify the AI imagery - never shown to customers.
        </p>
      </div>
      <ImageDropzone
        folder="vendor-uploads"
        value={value}
        onChange={onChange}
        uploadFile={(file) => uploadProductOriginal(file, ownerFolder)}
        previewUrl={(path) => signedUrls[path]}
      />
    </div>
  );
}
