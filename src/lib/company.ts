// AllBoutiqs' own legal and customer-care details, in one place (the same
// values are in supabase/functions/_shared/company.ts for emails/invoices).
export const COMPANY = {
  legalName: "AllBoutiqs Private Limited",
  gstin: "24ABGCA7307J1ZP",
  cin: "U47912GJ2026PTC183684",
  state: "Gujarat",
  jurisdiction: "Deesa, Gujarat",
  supportEmail: "support@allboutiqs.com",
  supportPhone: "+91 76004 84789",
  whatsapp: "+91 78019 40567",
  whatsappUrl: "https://wa.me/917801940567",
  location: "Deesa, Gujarat, India",
} as const;

export const telHref = (phone: string) => `tel:${phone.replace(/\s/g, "")}`;
