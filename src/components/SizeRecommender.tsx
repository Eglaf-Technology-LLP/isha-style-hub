import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SizeRecommenderProps {
  productId: string;
  availableSizes: string[];
  onSizeRecommended?: (size: string) => void;
}

interface Recommendation {
  recommendedSize: string;
  confidence: "low" | "medium" | "high";
  reasoning: string;
  alternativeSize?: string | null;
}

export function SizeRecommender({
  productId,
  availableSizes,
  onSizeRecommended,
}: SizeRecommenderProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Recommendation | null>(null);

  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<string>("");
  const [bodyType, setBodyType] = useState<string>("");
  const [fitPreference, setFitPreference] = useState<string>("regular");
  const [usualSize, setUsualSize] = useState("");

  const handleSubmit = async () => {
    if (!height || !weight) {
      toast.error("Please enter at least your height and weight");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-size-recommender", {
        body: {
          productId,
          availableSizes,
          height_cm: Number(height),
          weight_kg: Number(weight),
          age: age ? Number(age) : undefined,
          gender: gender || undefined,
          bodyType: bodyType || undefined,
          fitPreference,
          usualSize: usualSize || undefined,
        },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      setResult(data as Recommendation);
    } catch (err) {
      console.error(err);
      toast.error((err as Error).message || "Could not get a size recommendation");
    } finally {
      setLoading(false);
    }
  };

  const applySize = (size: string) => {
    onSizeRecommended?.(size);
    setOpen(false);
    toast.success(`Selected size ${size}`);
  };

  if (availableSizes.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Find my size with AI
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Size Recommender
          </DialogTitle>
          <DialogDescription>
            Tell us a bit about you and our AI will suggest the best fit.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="height">Height (cm)*</Label>
                <Input id="height" type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="170" />
              </div>
              <div>
                <Label htmlFor="weight">Weight (kg)*</Label>
                <Input id="weight" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="65" />
              </div>
              <div>
                <Label htmlFor="age">Age</Label>
                <Input id="age" type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="28" />
              </div>
              <div>
                <Label>Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Body type</Label>
                <Select value={bodyType} onValueChange={setBodyType}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slim">Slim</SelectItem>
                    <SelectItem value="athletic">Athletic</SelectItem>
                    <SelectItem value="average">Average</SelectItem>
                    <SelectItem value="curvy">Curvy</SelectItem>
                    <SelectItem value="plus">Plus</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fit preference</Label>
                <Select value={fitPreference} onValueChange={setFitPreference}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tight">Tight</SelectItem>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="loose">Loose</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="usualSize">Size you usually wear</Label>
              <Input id="usualSize" value={usualSize} onChange={(e) => setUsualSize(e.target.value)} placeholder="e.g. M or 32" />
            </div>

            <DialogFooter>
              <Button onClick={handleSubmit} disabled={loading} className="w-full">
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing...</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" />Get my size</>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Recommended size</p>
              <p className="text-4xl font-bold text-primary">{result.recommendedSize}</p>
              <Badge variant="secondary" className="mt-2 capitalize">
                {result.confidence} confidence
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground italic">{result.reasoning}</p>
            {result.alternativeSize && (
              <p className="text-xs text-muted-foreground">
                Alternative: <span className="font-medium">{result.alternativeSize}</span>
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setResult(null)}>
                Retake quiz
              </Button>
              <Button className="flex-1" onClick={() => applySize(result.recommendedSize)}>
                Use size {result.recommendedSize}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
