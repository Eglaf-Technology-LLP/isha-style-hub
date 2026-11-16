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
  // The registered office in Deesa - also where the Grievance Officer can be
  // written to (client corrections, 15 Nov 2026).
  officeAddress: "PL-19, Puniynagari, Near Smrudhipark, Disa Bazar, Deesa, Banaskantha-385535, Gujarat",
  // Grievance Officer (Consumer Protection (E-Commerce) Rules, 2020): shown
  // on the policy pages, every product page and the footer.
  grievanceOfficer: {
    name: "Dhvani Soni",
    email: "grievance@allboutiqs.com",
    phone: "+91 76004 84789",
  },
  // Shown as text only - no ISO logo, no link.
  isoCertificate: "ISO 9001:2015 certified · Certificate No. E20261156495",
} as const;

export const telHref = (phone: string) => `tel:${phone.replace(/\s/g, "")}`;
