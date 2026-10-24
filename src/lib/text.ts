// "kaftAN" -> "Kaftan", "hasmukh store" -> "Hasmukh Store" (Developer
// Corrections Part 8, 30 and 36): first letter of every word capital, the
// rest small. Short all-capital words stay as typed (XL, 3XL, LLP, A&B), and
// hyphenated words are done part by part (v-neck -> V-Neck).
export function titleCase(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) =>
      word
        .split("-")
        .map((part) => {
          if (!part) return part;
          if (part.length <= 4 && /[A-Z]/.test(part) && /^[A-Z0-9&.']+$/.test(part)) return part;
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join("-"),
    )
    .join(" ");
}
