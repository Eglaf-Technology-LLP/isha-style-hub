import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface VariantSelectorProps {
  label: string;
  options: string[];
  selected: string | null;
  onSelect: (value: string) => void;
  type?: "size" | "color";
  colorMap?: Record<string, string>;
}

// Common color mapping for fashion products
const defaultColorMap: Record<string, string> = {
  black: "#000000",
  white: "#FFFFFF",
  red: "#EF4444",
  blue: "#3B82F6",
  green: "#22C55E",
  yellow: "#EAB308",
  orange: "#F97316",
  purple: "#A855F7",
  pink: "#EC4899",
  brown: "#92400E",
  gray: "#6B7280",
  grey: "#6B7280",
  navy: "#1E3A5A",
  beige: "#D4C5A9",
  cream: "#FFFDD0",
  maroon: "#800000",
  olive: "#808000",
  teal: "#008080",
  coral: "#FF7F50",
  gold: "#FFD700",
  silver: "#C0C0C0",
  burgundy: "#800020",
  lavender: "#E6E6FA",
  mint: "#98FF98",
  peach: "#FFDAB9",
  turquoise: "#40E0D0",
  khaki: "#C3B091",
  indigo: "#4B0082",
  violet: "#8F00FF",
  magenta: "#FF00FF",
  cyan: "#00FFFF",
  charcoal: "#36454F",
  ivory: "#FFFFF0",
  rose: "#FF007F",
  plum: "#DDA0DD",
  tan: "#D2B48C",
  rust: "#B7410E",
  wine: "#722F37",
  denim: "#1560BD",
  sky: "#87CEEB",
  blush: "#DE5D83",
  mustard: "#FFDB58",
  sage: "#9DC183",
  taupe: "#483C32",
  champagne: "#F7E7CE",
};

export function VariantSelector({
  label,
  options,
  selected,
  onSelect,
  type = "size",
  colorMap = defaultColorMap,
}: VariantSelectorProps) {
  if (options.length === 0) return null;

  const getColorValue = (colorName: string): string => {
    const lowerColor = colorName.toLowerCase().trim();
    return colorMap[lowerColor] || defaultColorMap[lowerColor] || "#9CA3AF";
  };

  const isLightColor = (hex: string): boolean => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="font-medium">{label}</label>
        {selected && (
          <span className="text-sm text-muted-foreground capitalize">
            {selected}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected === option;

          if (type === "color") {
            const colorValue = getColorValue(option);
            const isLight = isLightColor(colorValue);

            return (
              <button
                key={option}
                onClick={() => onSelect(option)}
                className={cn(
                  "relative w-10 h-10 rounded-full border-2 transition-all hover:scale-110",
                  isSelected
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border hover:border-primary/50"
                )}
                style={{ backgroundColor: colorValue }}
                title={option}
                aria-label={`Select ${option} color`}
              >
                {isSelected && (
                  <Check
                    className={cn(
                      "absolute inset-0 m-auto h-5 w-5",
                      isLight ? "text-foreground" : "text-white"
                    )}
                  />
                )}
              </button>
            );
          }

          // Size buttons
          return (
            <button
              key={option}
              onClick={() => onSelect(option)}
              className={cn(
                "min-w-[3rem] px-4 py-2 rounded-lg border-2 font-medium transition-all hover:border-primary/50",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted"
              )}
              aria-label={`Select size ${option}`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
