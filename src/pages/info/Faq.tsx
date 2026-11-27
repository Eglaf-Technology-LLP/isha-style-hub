import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { COMPANY, telHref } from "@/lib/company";
import { COURIER_RATE_CARD, FAQ_VERSION, LEGAL_PATHS } from "@/lib/legal";

const link = "text-primary underline-offset-4 hover:underline";

const Mail = ({ to }: { to: string }) => (
  <a href={`mailto:${to}`} className={link}>
    {to}
  </a>
);

const WhatsApp = () => (
  <>
    WhatsApp{" "}
    <a href={COMPANY.whatsappUrl} target="_blank" rel="noopener noreferrer" className={link}>
      {COMPANY.whatsapp}
    </a>{" "}
    (WhatsApp only)
  </>
);

const Page = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className={link}>
    {children}
  </Link>
);

// One question and its answer.
const QA = ({ q, children }: { q: string; children: ReactNode }) => (
  <div className="space-y-2">
    <h3>{q}</h3>
    {children}
  </div>
);

// The client's FAQ for customers and boutiques, Version 1.0 (November 2026),
// word for word: one section per topic, Part A and Part B as in the PDF.
const sections: LegalSection[] = [
  // ------------------------------------------------- PART A – FOR CUSTOMERS
  {
    id: "about",
    part: "Part A – For customers",
    title: "About AllBoutiqs",
    body: (
      <>
        <QA q="What is AllBoutiqs?">
          <p>
            AllBoutiqs is an online marketplace for selected premium boutiques and designer brands. Every product is
            sold by the boutique shown on the product page. We run the website, take your payment, check every order at
            our office before it is sent to you, and handle delivery, returns, refunds and complaints.
          </p>
        </QA>
        <QA q="Who issues my invoice?">
          <p>
            The boutique is the seller, so the tax invoice is in the boutique’s name, marked “Sold through AllBoutiqs
            Marketplace”. You get a PDF copy in your account and a printed copy inside the parcel.
          </p>
        </QA>
      </>
    ),
  },
  {
    id: "orders-payment",
    title: "Orders and payment",
    body: (
      <>
        <QA q="How can I pay?">
          <p>
            By UPI, debit or credit card, net banking, wallets, EMI or Cash on Delivery, as shown at checkout.
            AllBoutiqs does not store your full card details.
          </p>
        </QA>
        <QA q="Do prices include GST and delivery?">
          <p>
            All prices include GST. The delivery charge, if any, is shown on the product page and at checkout before
            you pay. If you choose Cash on Delivery, the COD fee is also shown at checkout before you order.
          </p>
        </QA>
        <QA q="I ordered from two boutiques. Why are there two orders?">
          <p>Products from each boutique become a separate order and may arrive in separate parcels.</p>
        </QA>
        <QA q="What are Ready to Ship, Standard Size and Custom Fit?">
          <ul>
            <li>
              <strong>Ready to Ship</strong> – already made and in stock.
            </li>
            <li>
              <strong>Standard Size</strong> – made in your size after you order, from the sizes the boutique offers.
            </li>
            <li>
              <strong>Custom Fit</strong> – made to your own measurements.
            </li>
          </ul>
          <p>The product page shows the extra price and extra days for any option before you pay.</p>
        </QA>
        <QA q="How do I give my measurements for Custom Fit?">
          <p>
            In the AllBoutiqs measurement form, with a video and body diagram to help you – when you order or within 7
            days. If we do not receive them within 7 days, the order is cancelled and you choose your refund: the full
            amount to your AllBoutiqs Wallet, or to your original payment method minus a 5% cancellation fee (GST
            included). Custom Fit orders must be paid online.
          </p>
        </QA>
      </>
    ),
  },
  {
    id: "cod",
    title: "Cash on Delivery (COD)",
    body: (
      <>
        <QA q="Is Cash on Delivery available?">
          <p>
            Yes, for Ready to Ship products where the product page shows it, for eligible PIN codes and order values. It
            is not available for Custom Fit products or for products made after your order.
          </p>
        </QA>
        <QA q="Is there a COD fee?">
          <p>
            Yes – 3% of the order value + 18% GST, shown at checkout before you order. There is no COD fee if a COD
            order is cancelled. Once a COD order is delivered, the COD fee is not refunded, even if the order is
            returned later – except when the product is damaged, defective or wrong; then the COD fee is also refunded.
          </p>
        </QA>
        <QA q="How do I get a refund on a COD order?">
          <p>
            COD orders follow the same rules as prepaid orders. The refund is paid to your bank account or UPI ID, never
            in cash.
          </p>
        </QA>
      </>
    ),
  },
  {
    id: "delivery",
    title: "Delivery",
    body: (
      <>
        <QA q="When will my order arrive?">
          <p>
            Each product page shows “Ships by” and “Delivery by” dates for your PIN code. They include the boutique’s
            making or packing time, up to 3 working days for our quality check, and courier time. These dates are
            estimates.
          </p>
        </QA>
        <QA q="What should I check when the parcel arrives?">
          <p>
            Check that the outer packaging is sealed. Do not accept a parcel that is open or clearly damaged, and tell us
            at once. For high-value orders, we suggest recording a short unboxing video.
          </p>
        </QA>
      </>
    ),
  },
  {
    id: "cancellations",
    title: "Cancellations",
    body: (
      <>
        <QA q="Can I cancel my order?">
          <p>
            Yes – <strong>free cancellation within 24 hours</strong> of placing it, with a full refund to your
            AllBoutiqs Wallet, wherever cancellation is available for that product. The 24 hours run continuously,
            including Sundays and holidays. After 24 hours, the order cannot be cancelled.
          </p>
        </QA>
        <QA q="What refund do I get if I cancel?">
          <ul>
            <li>
              <strong>Prepaid order:</strong> 100% to your AllBoutiqs Wallet, or to your original payment method minus
              a 5% cancellation fee (GST included).
            </li>
            <li>
              <strong>COD order:</strong> no payment was taken, so there is nothing to refund and no charge.
            </li>
            <li>
              <strong>Cancelled by the boutique or AllBoutiqs:</strong> 100% refund, to your original payment method or
              Wallet, as you prefer.
            </li>
          </ul>
          <p>Cancellation refunds are processed within 7 working days.</p>
        </QA>
      </>
    ),
  },
  {
    id: "returns-refunds",
    title: "Returns and refunds",
    body: (
      <>
        <QA q="Can I return a product?">
          <p>
            Only products marked “Return Available”. Request the return within 24 hours of delivery (as confirmed by
            the courier). The product must be unworn, unused, unwashed, unaltered and undamaged, with all tags,
            packaging and the AllBoutiqs tamper-evident tag intact. We do not offer exchanges – return the product and
            place a new order.
          </p>
        </QA>
        <QA q="My product is damaged, defective, wrong or different from the listing. What do I do?">
          <p>
            Tell us within 24 hours of delivery, with photos or video. You get a full refund even if the product is
            “Return Not Available”, and the return pickup is free.
          </p>
        </QA>
        <QA q="Can I return a customised product?">
          <p>
            Custom Fit products, Standard Size products made after your order and products with options cannot be
            returned for change of mind or size – only if they are damaged, defective, wrong or different from the
            listing. If a custom product does not fit because the measurements you gave were wrong, it cannot be
            returned.
          </p>
        </QA>
        <QA q="When will I get my return refund?">
          <p>
            Within 7 working days after the returned product is inspected at our office – to your original payment
            method, or to your AllBoutiqs Wallet if you choose. Your bank may take a few extra days to show the credit.
          </p>
        </QA>
        <QA q="What is the AllBoutiqs Wallet?">
          <p>
            Your Wallet balance can be used any time to shop on AllBoutiqs. It cannot be withdrawn as cash or
            transferred, and no interest is paid on it.
          </p>
        </QA>
      </>
    ),
  },
  {
    id: "privacy-help",
    title: "Privacy and help",
    body: (
      <>
        <QA q="Does the boutique get my phone number or email?">
          <p>
            No. Your phone number and email are never shared with the boutique. Your name and address appear only on the
            boutique’s copy of the tax invoice, where the law requires it.
          </p>
        </QA>
        <QA q="Will I get promotional messages?">
          <p>
            Order and delivery updates are always sent. Tick the offers box to also get our offers and new arrivals. If
            you ever receive a message you do not want, reply STOP or write to us, and we will stop it.
          </p>
        </QA>
        <QA q="How do I contact you or make a complaint?">
          <p>
            Customer support: <Mail to={COMPANY.supportEmail} /> · <WhatsApp />.
          </p>
          <p>
            Grievance Officer: {COMPANY.grievanceOfficer.name} · <Mail to={COMPANY.grievanceOfficer.email} /> ·{" "}
            <WhatsApp />. Every complaint gets a ticket number. We aim to acknowledge it within 24 hours and to resolve
            it within 7 days.
          </p>
        </QA>
      </>
    ),
  },

  // ------------------------------- PART B – FOR BOUTIQUES & DESIGNER BRANDS
  {
    id: "joining",
    part: "Part B – For boutiques & designer brands",
    title: "Joining",
    body: (
      <>
        <QA q="Who can sell on AllBoutiqs?">
          <p>
            Selected boutiques and designer brands, for products they design, stitch, make, own or are legally
            authorised to sell. A valid GSTIN is required. Wholesale-only suppliers, unauthorised resellers and
            counterfeit or “first copy” products are not allowed.
          </p>
        </QA>
        <QA q="Is there a fee to join or to list products?">
          <p>
            <strong>No.</strong> There is no joining fee, no listing fee and no monthly fee. Charges apply only to
            orders – they are deducted from your weekly payout, never charged upfront.
          </p>
        </QA>
        <QA q="What do I need before my first listing?">
          <p>
            GST registration certificate, PAN, cancelled cheque or bank proof, identity proof of the authorised person,
            entity documents, and acceptance of the Terms &amp; Working Process. Keep them in the 1_Documents folder of
            your AllBoutiqs Google Drive folder. You also give your customer-care contact and Grievance Officer details.
          </p>
        </QA>
        <QA q="When does AllBoutiqs launch, and what is the Founding Period?">
          <p>
            AllBoutiqs launches on <strong>29 November 2026 at 11:30 AM</strong>. Up to 50 boutiques and brands
            selected before launch are Founding Boutiques. For two calendar months from the launch date – 29 November
            2026 to 28 January 2027 – they pay 0% marketplace commission; the technology &amp; service fee (2% + GST)
            and the other charges still apply.
          </p>
        </QA>
      </>
    ),
  },
  {
    id: "listing",
    title: "Listing your products",
    body: (
      <>
        <QA q="How do I list my products?">
          <p>
            Our team shares the AllBoutiqs Product Listing Excel with you. Fill one row per product, and one row for
            each other colour of the same design (for example 2A, 2B). When the Status column shows ✓, pick “✓ I
            confirm – go live” (or “✓ I confirm – all complete products” in row 1). A product goes live after
            AllBoutiqs approves it.
          </p>
        </QA>
        <QA q="Can your team fill the Excel for me?">
          <p>
            Yes – from your website or your own product Excel. You check it and send one confirmation by email to{" "}
            <Mail to="hello@allboutiqs.com" />: “I have checked the Excel and I confirm all products &lt;first SKU&gt;
            to &lt;last SKU&gt; with my answers above. All products in the photos are real and original. You may go
            live.” Whether you fill the Excel or our team fills it for you, your Excel and your live products always
            remain your responsibility. Please check them, and if you find any mistake, contact our support team at
            once.
          </p>
        </QA>
        <QA q="What price do I write?">
          <p>
            <strong>Your MRP</strong> – the full price the customer pays for one piece: your product price (packaging
            included) + the fixed courier charge for its category + GST. Example: Anarkali Set ₹9,540 + courier ₹460 =
            ₹10,000; + 18% GST = MRP ₹11,800. The Excel only shows this split; it adds nothing. The courier charge is
            never added on top for the customer.
          </p>
        </QA>
        <QA q="What is the courier charge?">
          <p>
            One fixed charge per order by product category:{" "}
            {COURIER_RATE_CARD.map((r) => (
              <span key={r.charge}>
                <strong>{r.charge}</strong> – {r.categories};{" "}
              </span>
            ))}
            any other category – fixed by our team before the product goes live. It is already included in your MRP
            and is deducted from it on every order, COD or prepaid – never charged on top. Your statement shows it as
            the courier charge + 18% GST; that GST comes back to you as input tax credit, where eligible.
          </p>
        </QA>
        <QA q="Which GST rate applies to my product?">
          <p>
            <strong>GST rule (Government of India, from 22 September 2025):</strong> if your product price{" "}
            <strong>including the courier charge</strong>, before GST, is{" "}
            <strong>₹2,500 or less per piece, GST is 5%</strong> – whatever the category in our list. If it is{" "}
            <strong>more than ₹2,500 per piece, GST is 18%</strong>. Sarees sold as fabric are 5% at any price.
            (Source: Notification No. 9/2025–Central Tax (Rate), effective 22 September 2025 – apparel Sl. 388 and 389,
            made-up textile articles and sets Sl. 390.)
          </p>
          <p>
            <strong>Tip</strong> – your price including the courier charge, before GST, decides the GST rate. Up to
            ₹2,500 → 5% GST: ₹2,500 + 5% = MRP ₹2,625. From ₹2,501 → 18% GST: ₹2,501 + 18% = MRP ₹2,951.18. You receive
            about the same, but the customer pays about ₹326 more. A lower MRP usually brings more orders.
          </p>
        </QA>
        <QA q="Who fills in the HSN code and GST rate?">
          <p>
            The Excel fills in the 6-digit HSN code and the GST rate automatically from the category and fabric you
            choose. Checking them is your responsibility – if a code looks wrong, contact our customer care before you
            confirm.
          </p>
        </QA>
        <QA q="How do I share photos and videos?">
          <p>
            By Google Drive – never inside the Excel, and not on the website; any other way only if our team has agreed.
            Your AllBoutiqs folder has 1_Documents, 2_Images (one sub-folder per SKU), 3_Videos and 4_Extra (your own
            Excel, catalogue or links). Each product needs at least 3 real photos (front, back slightly turned,
            close-up), up to 6 photos and 1 video; each extra colour needs 1 front photo. No watermark or other brand
            mark. Editing may improve the presentation, but must never change the product; an AI model photo is allowed
            only as an extra image that matches the real product exactly.
          </p>
        </QA>
        <QA q="What dispatch days do I give?">
          <p>
            Your real days until the product is packed and ready for courier pickup from your store – do not add extra
            days. AllBoutiqs adds the customer delivery estimate itself.
          </p>
        </QA>
        <QA q="What happens when a size sells out?">
          <p>
            Made to Order products never go out of stock. For Ready to Ship, you choose for each product: Make to order
            (with your extra ₹ and extra days) or Hide that size. A size you make to order is Return No and COD No, like
            every Made to Order product. If nothing is chosen, the size shows “Sold out” with “Notify me”.
          </p>
        </QA>
        <QA q="Are returns and COD on for my products?">
          <p>
            At the start, Return &amp; refund and COD may be on or off for your products, as set by AllBoutiqs. Please
            check each product: for Ready to Ship products you can switch them on or off at any time. Made to Order
            products are always Return No and COD No. You can change them in the Excel (for all products in row 1, or
            product by product) or by writing to our team with the SKUs or “all”. Any setting or value filled by
            default is also your responsibility to check.
          </p>
        </QA>
        <QA q="Can customers customise my product?">
          <p>
            Yes, if you pick Customisation Yes – then fill both the customisation charge (%) and the extra days. Both
            are shown to the customer before payment.
          </p>
        </QA>
        <QA q="Who is responsible for my seller dashboard login?">
          <p>
            You are. Keep your login, password and OTP safe and do not share them with anyone you do not trust. Any
            action or change made from your account – by you, your staff or anyone using your password or OTP, even by
            mistake or misuse – is treated as done by your boutique. If you think your login has been misused, inform
            us immediately.
          </p>
        </QA>
        <QA q="Can a badge be removed, or my products be paused?">
          <p>
            Yes. A badge or tag such as Trusted, Verified or Featured can be removed at any time for misleading
            information, misbehaviour, irregularity or repeated rule breaks. If a boutique does not reply, does not
            respond to orders or messages, or stays inactive, AllBoutiqs may pause its products or remove them from
            live, in a proper and professional way.
          </p>
        </QA>
        <QA q="Can I change a product after it is live?">
          <p>
            Yes – update stock or sizes, or switch a product off, in your seller dashboard where the option is
            available, or tell our team. Changes go live after AllBoutiqs review. Orders already placed must still be
            fulfilled.
          </p>
        </QA>
      </>
    ),
  },
  {
    id: "charges-taxes",
    title: "Charges and taxes",
    body: (
      <>
        <QA q="What does AllBoutiqs charge?">
          <ul>
            <li>Marketplace commission: 10% of your product price (0% in the Founding Period).</li>
            <li>Technology &amp; service fee: 2% of your product price.</li>
            <li>18% GST on these fees.</li>
            <li>
              Payment Processing Service Fee: 2% of the amount paid online (3% for EMI) + 18% GST on the fee only – none
              on COD orders.
            </li>
            <li>Fixed courier charge per order by category (already included in your MRP).</li>
          </ul>
          <p>
            Your product price is your MRP without GST and without the courier charge. Every deduction is shown in your
            settlement statement, and AllBoutiqs issues a monthly Fee Invoice so you can claim input tax credit where
            eligible.
          </p>
        </QA>
        <QA q="What do I pay on returns, refused deliveries, RTO and a failed quality check?">
          <p>
            Only the one fixed courier charge as per the rate card – no commission, technology &amp; service fee or
            Payment Processing Service Fee. If the product was damaged, defective, wrong or did not match the listing,
            the refund is charged to you, and you still pay only the one fixed courier charge – nothing more. If
            AllBoutiqs itself cancels an order after the parcel reaches our warehouse, for a reason that is not your
            fault, AllBoutiqs pays the courier back to you.
          </p>
        </QA>
        <QA q="What are GST TCS and Income-tax TDS?">
          <p>
            Taxes the law requires every marketplace to collect or deduct – not AllBoutiqs charges. GST TCS is 0.5% of
            the net sale value excluding GST, and appears in your GST electronic cash ledger. Income-tax TDS is 0.1% of
            the sale value excluding GST – AllBoutiqs shows GST separately and deducts TDS when the sale is credited to
            your account, which always happens before your payout – and is credited against your PAN. No TDS is
            deducted for an individual or HUF seller whose sales through AllBoutiqs in the tax year do not exceed ₹5
            lakh and who has given PAN or Aadhaar.
          </p>
        </QA>
      </>
    ),
  },
  {
    id: "orders-shipping-payouts",
    title: "Orders, shipping and payouts",
    body: (
      <>
        <QA q="When do I dispatch an order or start making it?">
          <p>
            The customer can cancel within 24 hours of ordering. These 24 hours run continuously, including Sundays and
            holidays. <strong>Ready to Ship:</strong> you may prepare and pack the parcel, but hand it to the courier
            only after the 24 hours end. <strong>Made to Order:</strong> you may plan the work and prepare in the
            background (for example, arrange the fabric and plan the work), but start cutting or stitching only after
            the 24 hours end. Any preparation before the 24 hours end is your own choice and at your own cost; if the
            customer cancels within the 24 hours, no amount is payable to you for that order. Then hand it to the
            AllBoutiqs courier within your dispatch days.
          </p>
        </QA>
        <QA q="How does shipping work?">
          <p>
            Pack the product in your own retail-quality packaging and mark “Handing Over to Courier” by 11:00 AM (9:00
            AM for orders above ₹50,000) for same-day pickup. The tax invoice is created with GST as soon as the order
            is placed (a credit note is issued if it is cancelled). The courier brings the parcel to our quality-check
            centre, where we check quality, listing match and packaging, add the AllBoutiqs outer wrap and ship it to
            the customer. AllBoutiqs may also check measurements, but they remain entirely your responsibility –
            please re-check them before sending. Wherever the law requires an e-way bill (consignment value above
            ₹50,000 including GST), AllBoutiqs generates it on your behalf, using the details of your invoice, for each
            movement of the parcel (your location → our quality-check centre → the customer); the same applies to
            returns, wherever applicable. For an unusually heavy or oversized parcel, an extra courier charge may
            apply; we will inform you before dispatch.
          </p>
        </QA>
        <QA q="Do I need to send a photo of the parcel?">
          <p>
            <strong>
              Yes. Before you mark “Handing Over to Courier”, send us a clear photo of the sealed, packed parcel with
              the order ID visible – on <WhatsApp />, or in any other way our team confirms.
            </strong>{" "}
            It is used as evidence for pickup, transit and courier complaints.
          </p>
        </QA>
        <QA q="Can I contact the customer or add my own cards?">
          <p>
            No. All communication goes through AllBoutiqs, and the customer’s phone and email are never shared. Do not
            put business cards, phone or WhatsApp numbers, QR codes, flyers or payment details in the parcel.
          </p>
        </QA>
        <QA q="When do I get paid?">
          <p>
            Every Wednesday, by bank transfer with the UTR shown. An order becomes eligible after the 24-hour return
            window ends and no claim is pending; orders eligible by Tuesday 11:59 PM are paid that Wednesday. COD
            orders become eligible once AllBoutiqs receives the COD amount from the courier.
          </p>
        </QA>
        <QA q="How do I change my bank account?">
          <p>
            Inform us immediately by email at <Mail to={COMPANY.supportEmail} /> and on <WhatsApp /> – for example if
            your account is closed, blocked or was entered wrongly. The new account is used only after it is verified,
            and the change may take some time, because some amounts may already be in processing. In an emergency,
            inform us at once.
          </p>
        </QA>
        <QA q="What if a refund happens after I have been paid?">
          <p>
            It is deducted from your next Wednesday payout. If that is not enough, you pay the balance within 7 days of
            our notice.
          </p>
        </QA>
      </>
    ),
  },
  {
    id: "help",
    title: "Help",
    body: (
      <>
        <QA q="How do I reach AllBoutiqs?">
          <p>
            <Mail to={COMPANY.supportEmail} /> · <WhatsApp /> · Call{" "}
            <a href={telHref(COMPANY.callPhone)} className={link}>
              {COMPANY.callPhone}
            </a>
            . Please reply to any customer complaint we share with you within 2 working days.
          </p>
        </QA>
        <QA q="Where are the full rules?">
          <p>
            In the latest AllBoutiqs <Page to={LEGAL_PATHS.sellerTerms}>Terms &amp; Working Process</Page> and{" "}
            <Page to={LEGAL_PATHS.privacy}>Privacy Policy</Page>, in your seller dashboard and on allboutiqs.com.
          </p>
        </QA>
      </>
    ),
  },
];

export default function Faq() {
  return (
    <LegalPage
      eyebrow="Help"
      title="Frequently asked questions"
      version={FAQ_VERSION}
      updated={null}
      numbered={false}
      intro={
        <>
          <p>Quick answers for customers (Part A) and for boutiques and designer brands (Part B).</p>
          <p className="text-sm text-muted-foreground">
            Issued by {COMPANY.legalName} · CIN {COMPANY.cin} · GSTIN {COMPANY.gstin} · Effective from the official
            AllBoutiqs launch date · Registered office: {COMPANY.officeAddress}
          </p>
        </>
      }
      sections={sections}
      outro={
        <p className="border-t border-border pt-6 text-sm text-muted-foreground">
          Version {FAQ_VERSION} · November 2026 · This FAQ is a short guide. If anything here differs from the{" "}
          <Page to={LEGAL_PATHS.terms}>Customer Terms &amp; Conditions</Page>, the{" "}
          <Page to={LEGAL_PATHS.returns}>Return &amp; Refund Policy</Page>, the{" "}
          <Page to={LEGAL_PATHS.sellerTerms}>Terms &amp; Working Process</Page> or the{" "}
          <Page to={LEGAL_PATHS.privacy}>Privacy Policy</Page>, those documents apply.
        </p>
      }
    />
  );
}
