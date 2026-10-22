import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { useCustomerShipping } from "@/hooks/useCustomerShipping";
import { announcementMessages } from "@/content/storefront";
import { COMPANY } from "@/lib/company";

// Thin deep-maroon strip above the header: customer care on the left,
// rotating offers/promises in the middle, quick links on the right.
export function AnnouncementBar() {
  const { shippingCharged } = useCustomerShipping();
  const messages = announcementMessages(shippingCharged);
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1) % messages.length), 4500);
    return () => window.clearInterval(t);
  }, [messages.length]);

  return (
    <div className="bg-maroon-deep text-ivory">
      <div className="store-container flex h-9 items-center justify-between gap-4 text-[11px] tracking-[0.12em]">
        <a
          href={COMPANY.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden items-center gap-1.5 text-ivory/80 hover:text-ivory lg:flex"
        >
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp us · {COMPANY.whatsapp}
        </a>
        <p key={i} className="flex-1 animate-fade-in truncate text-center uppercase lg:flex-none">
          {messages[i]}
        </p>
        <div className="hidden items-center gap-5 text-ivory/80 lg:flex">
          <Link to="/orders" className="hover:text-ivory">
            Track order
          </Link>
          <Link to="/sell-with-us" className="hover:text-ivory">
            Sell on AllBoutiqs
          </Link>
        </div>
      </div>
    </div>
  );
}
