// Indian states and union territories with their GST state codes (the
// first two digits of a GSTIN). Addresses store the name exactly as listed
// here so the invoice can tell same-state (CGST + SGST) from other-state
// (IGST) sales. Mirrors public.indian_states in the database.
export const INDIAN_STATES: { name: string; gstCode: string }[] = [
  { name: "Andaman and Nicobar Islands", gstCode: "35" },
  { name: "Andhra Pradesh", gstCode: "37" },
  { name: "Arunachal Pradesh", gstCode: "12" },
  { name: "Assam", gstCode: "18" },
  { name: "Bihar", gstCode: "10" },
  { name: "Chandigarh", gstCode: "04" },
  { name: "Chhattisgarh", gstCode: "22" },
  { name: "Dadra and Nagar Haveli and Daman and Diu", gstCode: "26" },
  { name: "Delhi", gstCode: "07" },
  { name: "Goa", gstCode: "30" },
  { name: "Gujarat", gstCode: "24" },
  { name: "Haryana", gstCode: "06" },
  { name: "Himachal Pradesh", gstCode: "02" },
  { name: "Jammu and Kashmir", gstCode: "01" },
  { name: "Jharkhand", gstCode: "20" },
  { name: "Karnataka", gstCode: "29" },
  { name: "Kerala", gstCode: "32" },
  { name: "Ladakh", gstCode: "38" },
  { name: "Lakshadweep", gstCode: "31" },
  { name: "Madhya Pradesh", gstCode: "23" },
  { name: "Maharashtra", gstCode: "27" },
  { name: "Manipur", gstCode: "14" },
  { name: "Meghalaya", gstCode: "17" },
  { name: "Mizoram", gstCode: "15" },
  { name: "Nagaland", gstCode: "13" },
  { name: "Odisha", gstCode: "21" },
  { name: "Puducherry", gstCode: "34" },
  { name: "Punjab", gstCode: "03" },
  { name: "Rajasthan", gstCode: "08" },
  { name: "Sikkim", gstCode: "11" },
  { name: "Tamil Nadu", gstCode: "33" },
  { name: "Telangana", gstCode: "36" },
  { name: "Tripura", gstCode: "16" },
  { name: "Uttar Pradesh", gstCode: "09" },
  { name: "Uttarakhand", gstCode: "05" },
  { name: "West Bengal", gstCode: "19" },
];

const key = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");

const ALIASES: Record<string, string> = {
  orissa: "Odisha",
  pondicherry: "Puducherry",
  newdelhi: "Delhi",
  nctofdelhi: "Delhi",
  uttaranchal: "Uttarakhand",
  andamanandnicobar: "Andaman and Nicobar Islands",
  dadraandnagarhaveli: "Dadra and Nagar Haveli and Daman and Diu",
  damananddiu: "Dadra and Nagar Haveli and Daman and Diu",
  jk: "Jammu and Kashmir",
  jandk: "Jammu and Kashmir",
};

// Map a free-text state from an older saved address to the dropdown's name
// ("gujrat" stays unmatched and must be re-picked; "orissa" -> "Odisha").
export function normalizeState(raw: string | null | undefined): string {
  if (!raw) return "";
  const k = key(raw);
  const exact = INDIAN_STATES.find((s) => key(s.name) === k);
  return exact?.name ?? ALIASES[k] ?? "";
}
