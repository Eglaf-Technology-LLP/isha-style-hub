import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LegalNote, LegalPage, LegalTable, type LegalSection } from "@/components/legal/LegalPage";
import { COMPANY, telHref } from "@/lib/company";
import { COURIER_RATE_CARD, LEGAL_PATHS, SELLER_TERMS_UPDATED, SELLER_TERMS_VERSION } from "@/lib/legal";

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

const Privacy = ({ children = "Privacy Policy" }: { children?: ReactNode }) => (
  <Link to={LEGAL_PATHS.privacy} className={link}>
    {children}
  </Link>
);

// The client's "Terms & Working Process" for boutiques and designer brands,
// Version 2.2 (November 2026), word for word. The section numbers are the
// Point numbers the text refers to, so keep the order.
const sections: LegalSection[] = [
  // ---------------------------------------------------------------- PART A
  {
    id: "about",
    part: "Part A – About AllBoutiqs and eligibility",
    title: "About AllBoutiqs",
    body: (
      <>
        <p>
          AllBoutiqs is a curated premium online marketplace for boutiques and designer brands. It connects selected
          boutiques with customers while keeping each boutique’s own identity visible.
        </p>
        <p>
          AllBoutiqs is a marketplace, not a boutique or clothing brand. We do not design, manufacture or sell our own
          clothing label, and we do not compete with the boutiques listed with us. AllBoutiqs and each boutique are
          independent businesses; nothing in these Terms creates a partnership, joint venture, agency, franchise or
          employment relationship.
        </p>
        <LegalNote title={COMPANY.legalName}>
          <p>AllBoutiqs is operated by {COMPANY.legalName}, a company incorporated in India.</p>
          <p>Registered office: {COMPANY.officeAddress}</p>
          <p>CIN: {COMPANY.cin}</p>
          <p>GSTIN: {COMPANY.gstin}</p>
        </LegalNote>
        <p>
          AllBoutiqs can update these Terms and its policies under Point 29. The version in your seller dashboard is
          always the current one.
        </p>
      </>
    ),
  },
  {
    id: "who-may-sell",
    title: "Who may sell on AllBoutiqs",
    body: (
      <>
        <p>
          Selected boutiques and designer brands may sell only products they design, stitch, make, own, or are legally
          authorised to sell. Sellers must describe products accurately, maintain required licences and comply with
          Indian law and AllBoutiqs’ quality standards.
        </p>
        <p>
          GST registration is an AllBoutiqs admission condition: every seller must hold a valid GSTIN before listing,
          even where the law would allow a small seller to supply through a marketplace without registration
          (Notification No. 34/2023–Central Tax, 31 July 2023).
        </p>
        <p>Not permitted:</p>
        <ul>
          <li>Wholesale-only suppliers and manufacturers selling common market designs</li>
          <li>Unauthorised resellers of other brands</li>
          <li>Counterfeit, replica, “first copy” or unauthorised “inspired by” products</li>
          <li>Use of another person’s designs, photographs, names, logos or trademarks without the necessary rights</li>
          <li>Prohibited or unlawful products</li>
        </ul>
        <p>
          AllBoutiqs may ask for authenticity documents, authorisation letters, licences, purchase invoices or other
          reasonable evidence before approving or continuing a listing.
        </p>
      </>
    ),
  },
  {
    id: "photos",
    title: "Product photos, videos and content",
    body: (
      <>
        <p>
          Every listing must show the actual product available for sale.{" "}
          <strong>Each product needs at least 3 original, real photographs on a clean, plain background</strong>: (1)
          the front, full look; (2) the back, turned slightly so the back and the side both show; and (3) a close-up of
          the workmanship, fabric or embroidery. You may add up to 6 photos and 1 video. Every extra colour of the same
          design needs its own front photo. Photos must carry no watermark, logo or mark of any brand or website.
        </p>
        <h3>Photos and files – by Google Drive only</h3>
        <p>
          Never paste pictures inside the Product Listing Excel, and you do not upload photos or videos on the website.
          Every boutique has its own AllBoutiqs Google Drive folder:
        </p>
        <ul>
          <li>
            <strong>1_Documents</strong> – your GST, PAN, bank and other documents
          </li>
          <li>
            <strong>2_Images</strong> – one sub-folder for each product, named with its SKU
          </li>
          <li>
            <strong>3_Videos</strong> – product videos
          </li>
          <li>
            <strong>4_Extra</strong> – your own Excel, catalogue, price list or links
          </li>
        </ul>
        <p>
          In the Excel you pick where the photos are: “✓ Uploaded in my AllBoutiqs folder” (best), “✓ Uploaded in my own
          Drive” (link in row 1, shared with “Anyone with the link”) or “✓ Sent another way” – only if our team has
          agreed (write how in the Note).
        </p>
        <h3>Editing and AI</h3>
        <p>
          For every main product row you choose one of: <strong>No AI – real photos only</strong>;{" "}
          <strong>AI only for background / light / crop</strong>; or <strong>AI model photo – extra</strong> (real
          photos also given). The product itself must always be real – an AI-made product is not allowed. An AI model
          photo is only an extra image: the listing keeps its 3 real photos, the AI image must match the real product
          exactly (colour, embroidery, neckline, drape, length and hem), it carries a small “AI-styled image” label, and
          no view may be created that has no real photo. AllBoutiqs checks every AI image against the real photos and
          publishes only an exact match. Minor colour variation caused by screen settings is not a mismatch, provided
          the photo was not edited to change the colour.
        </p>
        <p>
          You confirm that you own, or have the rights to use, all photos, videos, descriptions, designs, logos and
          trademarks you submit.
        </p>
        <h3>Video as the front view</h3>
        <p>
          You may request that your product video is shown as the front view of your product. AllBoutiqs selects the
          videos shown at the front, so a request is not a guarantee.
        </p>
      </>
    ),
  },
  {
    id: "founding",
    title: "Founding Boutiques and the Founding Period",
    body: (
      <>
        <p>
          Up to 50 boutiques and designer brands selected before launch are designated Founding Boutiques. Selection
          and announcement may happen in more than one round.
        </p>
        <p>
          AllBoutiqs launches officially on <strong>29 November 2026 at 11:30 AM</strong>. The Founding Period is two
          (2) calendar months, starting on the official launch date – from 29 November 2026 to 28 January 2027. It is
          the same period for every Founding Boutique: it starts on the launch date even if your products go live
          later, and it is not extended.
        </p>
        <p>During the Founding Period:</p>
        <ul>
          <li>
            <strong>Marketplace commission:</strong> 0% on orders placed during that period.
          </li>
          <li>
            <strong>Technology &amp; service fee:</strong> 2% of your product price + 18% GST on that 2% (2.36% in
            total).
          </li>
          <li>
            Other charges, if applicable, as set out in Point 5 — Payment Processing Service Fee, the fixed courier
            charge, and any Route transfer charge — and the taxes in Point 6: GST TCS (0.5%) and Income-tax TDS (0.1%).
          </li>
        </ul>
        <p>
          From the day after the Founding Period ends, the standard 10% commission applies to new orders. Boutiques
          onboarded after launch are not eligible for the Founding Period unless AllBoutiqs confirms otherwise in
          writing.
        </p>
      </>
    ),
  },

  // ---------------------------------------------------------------- PART B
  {
    id: "charges",
    part: "Part B – Charges, taxes and pricing",
    title: "Charges and deductions",
    body: (
      <>
        <LegalNote title="No joining fee · No listing fee · No monthly fee">
          <p>
            You pay nothing to join or to list your products. Charges apply only to orders – they are deducted from
            your weekly payout, never charged upfront – and every deduction is listed below and shown in your
            settlement statement. No hidden charges.
          </p>
        </LegalNote>
        <p>
          Marketplace commission and the technology &amp; service fee are calculated on your{" "}
          <strong>product price</strong> – your MRP without GST and without the courier charge (Point 7). Every
          deduction is shown in your settlement statement.
        </p>
        <LegalTable
          head={["Item", "Standard", "Founding Period"]}
          rows={[
            ["Marketplace commission", "10% of your product price", "0% (10% after the period)"],
            ["Technology & service fee", "2% of your product price", "2%"],
            [
              "GST on AllBoutiqs fees",
              "18% on commission + technology & service fee (every other AllBoutiqs fee below also carries 18% GST)",
              "18% on the technology & service fee",
            ],
            [
              "AllBoutiqs Payment Processing Service Fee — online (UPI, cards, net banking, wallets)",
              "2% of the amount paid by the customer + 18% GST on the fee only = 2.36%",
              "Same",
            ],
            [
              "AllBoutiqs Payment Processing Service Fee — EMI (if the customer pays by EMI)",
              "3% of the amount paid by the customer + 18% GST on the fee only = 3.54%",
              "Same",
            ],
            [
              "Cash on Delivery (COD) orders",
              "No Payment Processing Service Fee. The COD fee is paid by the customer at checkout",
              "Same",
            ],
            [
              "Standard EMI interest",
              "Charged by the customer’s bank to the customer; you bear only the EMI Payment Processing Service Fee",
              "Same",
            ],
            [
              "No-Cost / Low-Cost EMI (only if you allow)",
              "The agreed EMI interest amount (EMI subvention) is deducted from the amount payable to you",
              "Same",
            ],
            [
              "Courier charge (fixed, by category)",
              "₹350, ₹460 or ₹650 per order by product category (Point 7). It is already included in your MRP and is deducted from it on every order, COD or prepaid – it is never charged on top of your MRP. Your statement shows it as the courier charge + 18% GST; that GST comes back to you as input tax credit, where eligible. Returns, refused deliveries, RTO and products that fail the quality check: you pay only this one fixed courier charge; no commission, technology & service fee or Payment Processing Service Fee is taken on these orders",
              "Same",
            ],
            [
              "Razorpay Route transfer charge (only once Route is activated)",
              "Razorpay’s actual Route charge on each amount paid to you through Route – currently 0.25% + 18% GST on that 0.25% (0.295% in total). If Razorpay changes its charge, the actual Razorpay charge applies. Applies only from the date Route is activated. Manual bank payouts carry no transfer charge",
              "Same",
            ],
            ["GST TCS", "0.5% of the net taxable value, excluding GST, after adjustment for applicable returns", "Same"],
            [
              "Income-tax TDS",
              "0.1% of the gross sale value (Section 393, Income-tax Act, 2025). Where GST is shown separately on the invoice and TDS is deducted at the time of credit, the separately stated GST is excluded from the TDS base (CBDT Circular No. 20/2023, paragraph 3.3) – AllBoutiqs always does both, before any payout. If payment occurs before credit, TDS applies to the whole amount, including GST (Point 6)",
              "Same",
            ],
            [
              "Packaging",
              "Included in your MRP; never charged to the customer separately, unless otherwise permitted by AllBoutiqs",
              "Same",
            ],
            [
              "Delivery to the customer",
              "The courier charge is already included in your MRP (Point 7) and is never added on top. Any delivery charge to the customer is shown on the product page and at checkout before payment.",
              "Same",
            ],
          ]}
        />
        <p>
          <strong>What is Razorpay Route?</strong> Route is a Razorpay service that automatically sends your share of a
          prepaid customer payment straight to your bank account. AllBoutiqs does not use Route yet – today your weekly
          payouts are manual bank transfers, with no Route charge. AllBoutiqs will inform you when Route is activated;
          only from that date does the Route transfer charge apply, and only on amounts sent to you through Route.
        </p>
        <p>
          The Payment Processing Service Fee is AllBoutiqs’ own service charge for processing payments — not a
          reimbursement of a third party’s fee — and it applies even if AllBoutiqs’ payment partner waives or reduces
          its own fee. No amount is charged twice for the same service.
        </p>
        <p>
          All AllBoutiqs fees — commission, technology &amp; service fee, Payment Processing Service Fee, the fixed
          courier charge, and any Route transfer charge — are billed on a monthly AllBoutiqs Fee Invoice issued under
          the AllBoutiqs GSTIN, deducted from your payouts and shown line by line in your settlement statement. You can
          claim input tax credit on the GST charged, where eligible.
        </p>
      </>
    ),
  },
  {
    id: "taxes",
    title: "Taxes on your sales — GST TCS and Income-tax TDS",
    body: (
      <>
        <p>
          These are not AllBoutiqs charges. They are taxes the law requires every e-commerce marketplace to collect or
          deduct. AllBoutiqs deposits them with the government in your name. They come back to you as tax credit.
        </p>
        <p>
          <strong>
            In one line: GST TCS is calculated on the net sale value excluding GST, adjusted for returns. Income-tax
            TDS is calculated at 0.1% of the gross sale value (Income-tax Act 2025, section 393).
          </strong>{" "}
          Where GST is shown separately on the invoice and TDS is deducted at the time of credit, the separately stated
          GST is excluded from the TDS base (CBDT Circular No. 20/2023, paragraph 3.3). AllBoutiqs always shows GST
          separately and always deducts TDS when the sale amount is credited to your account, before any payout – so
          for you, TDS is on the sale value excluding GST. If payment ever occurred before credit, TDS would be
          calculated on the whole amount, including GST, as clarified in the same Circular.
        </p>
        <h3>Simple example</h3>
        <LegalTable
          head={["Invoice value", "Amount"]}
          numeric={[1]}
          rows={[
            ["Your MRP (product price ₹9,540 + courier charge ₹460 + 18% GST)", "₹11,800"],
            ["GST at 18% (inside the MRP)", "₹1,800"],
            ["Sale value (taxable value, excluding GST) – includes the fixed courier charge of ₹460", "₹10,000"],
            ["Customer pays", "₹11,800"],
            ["GST TCS – 0.5% of ₹10,000", "₹50.00"],
            ["Income-tax TDS – 0.1% of ₹10,000", "₹10.00"],
          ]}
        />
        <p>
          Exception (not the standard policy – the courier charge is inside your MRP, Point 7): only if AllBoutiqs ever
          permits a packing or delivery charge to be billed to the customer separately, that charge is added to the sale
          value, and TCS and TDS are calculated on the total, still excluding GST.
        </p>
        <h3>GST TCS — 0.5%</h3>
        <ul>
          <li>
            Under Section 52 of the CGST Act, 2017, AllBoutiqs collects 0.5% of the net value of taxable supplies made
            through AllBoutiqs: the taxable value excluding GST, after deducting returns in the same month.
          </li>
          <li>Within your state: 0.25% CGST + 0.25% SGST. Outside your state: 0.5% IGST.</li>
          <li>
            AllBoutiqs reports it monthly against your GSTIN. It appears in your GST electronic cash ledger and you can
            use it to pay your GST.
          </li>
          <li>Report every AllBoutiqs sale in your own GSTR-1 so that your sales match AllBoutiqs’ TCS statement.</li>
        </ul>
        <h3>Income-tax TDS — 0.1%</h3>
        <ul>
          <li>
            Under Section 393(1), Table Sl. No. 8(v), of the Income-tax Act, 2025, AllBoutiqs deducts 0.1% of the gross
            amount of the sale at the time the sale amount is credited to your account in AllBoutiqs’ books – this
            always happens before the amount is paid out to you. Because GST is shown separately on the invoice, GST is
            not included in the base (CBDT Circular No. 20/2023, paragraph 3.3, which continues to apply under Section
            536(2)(j) of the Income-tax Act, 2025). Example: ₹10.00 on a sale value of ₹10,000 (MRP ₹11,800 including
            18% GST). The courier charge included in your MRP is part of the invoice value (Point 7), so it forms part
            of the sale value and of the TCS and TDS base. Only if AllBoutiqs ever permits a delivery, packing or other
            charge to be billed to the customer separately on the invoice (an exception, not the standard policy), that
            charge becomes part of the gross amount and of the TDS base (CBDT Circular 20/2023, paragraph 3.2, Example
            1). A payment the customer makes directly to the boutique for an AllBoutiqs order is also counted, because
            the law treats it as paid by AllBoutiqs.
          </li>
          <li>
            It is deposited against your PAN, shown in your annual tax statement on the income-tax e-filing portal, and
            claimed as credit in your income-tax return. AllBoutiqs issues the prescribed TDS certificate.
          </li>
          <li>
            No TDS for a resident individual or HUF seller whose gross sales through AllBoutiqs in the tax year do not
            exceed ₹5,00,000 and who has furnished PAN or Aadhaar (Section 393(4), Table Sl. No. 11, Income-tax Act,
            2025). Companies, LLPs and firms are covered from the first order.
          </li>
          <li>If PAN or Aadhaar is not furnished, TDS is deducted at the higher rate required by law.</li>
        </ul>
        <h3>Other points</h3>
        <ul>
          <li>
            The former Income-tax TCS on sale of goods (Section 206C(1H)) no longer applies from 1 April 2025;
            AllBoutiqs does not deduct it.
          </li>
          <li>
            No other income-tax TDS or TCS is deducted from ordinary boutique sales, unless a separate provision of law
            applies to a particular transaction.
          </li>
          <li>
            The rates above are those in force on the date of this document. If the law changes, the rate in force on
            the transaction date applies automatically.
          </li>
          <li>
            You remain responsible for your own GST returns, income-tax return and books of account. AllBoutiqs
            provides settlement reports and tax certificates to help you reconcile.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "mrp",
    title: "MRP, courier charge and GST rate on your products",
    body: (
      <>
        <LegalNote title="Your MRP = product price + courier charge + GST">
          <p>
            Write one MRP for each piece – the full price the customer pays. To set it, take your product price (your
            packaging included), add the fixed courier charge for its category (table below), then add GST. The courier
            charge is collected inside your MRP and deducted from it – it is never charged on top of your MRP. The
            Product Listing Excel only shows this split; it adds nothing.
          </p>
        </LegalNote>
        <p>
          <strong>MRP is inclusive of all taxes; the customer is never charged above MRP.</strong> The courier charge is
          never added on top for the customer. The customer invoice shows one product line (the price without GST,
          which includes the courier charge) + GST. Any delivery charge to the customer is shown on the product page
          and at checkout before payment.
        </p>
        <p>
          An extra charge for customisation, for bigger sizes or for making a sold-out size to order is added to the
          price only when the customer chooses that option, and is shown to the customer before payment (Point 8).
        </p>
        <h3>Fixed courier charge – by product category</h3>
        <p>To keep it simple, AllBoutiqs has one fixed courier charge for each product category:</p>
        <LegalTable
          head={["Courier charge (included in your MRP)", "Product categories"]}
          rows={[
            ...COURIER_RATE_CARD.map((r) => [r.charge, r.categories]),
            [
              "Set by AllBoutiqs",
              "Any other category you type in yourself – our team fixes the charge before the product goes live",
            ],
          ]}
        />
        <p>
          <strong>
            Example: Anarkali Set – product price ₹9,540 + courier charge ₹460 = ₹10,000; + 18% GST ₹1,800 = MRP
            ₹11,800.
          </strong>
        </p>
        <p>
          Because the courier charge is already inside your MRP, it is deducted from your weekly settlement on every
          order, COD or prepaid (Point 5) – nothing is added on top. Your settlement statement shows it as the courier
          charge + 18% GST; that GST is billed on the AllBoutiqs Fee Invoice and comes back to you as input tax credit,
          where eligible. The Excel shows the courier charge for each product in the automatic “Courier ₹” box.
        </p>
        <p>
          If we revise the rate card, we will inform you in advance on your dashboard and by email, with the date the
          new rate starts.
        </p>
        <h3>GST rate – how your price sets the GST</h3>
        <p>
          GST rate on apparel (from 22 September 2025): apparel with a sale value (without GST, courier included) of up
          to ₹2,500 per piece attracts 5% GST; above ₹2,500 per piece, 18%. The old 12% rate no longer exists. In
          simple words:
        </p>
        <LegalNote>
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
        </LegalNote>
        <ul>
          <li>
            Where the GST rate entry sets a ₹2,500 limit — apparel under Notification 9/2025-CT(Rate), Sl. 388 (Chapter
            61, knitted) and Sl. 389 (Chapter 62, not knitted), and made-up textile articles and sets under Sl. 390
            (Chapter 63, subject to its exclusions) — the limit applies per piece, on the taxable value actually
            charged. The treatment of a set sold as one product must follow its applicable tariff classification and
            GST rate entry; the AllBoutiqs HSN list must reflect that classification. All other products follow their
            own HSN classification and GST rate.
          </li>
          <li>
            Dupatta (6-digit HSN under heading 6214, by fibre – for example 621410 silk, 621490 cotton): 5% up to
            ₹2,500 per piece, 18% above. The rate always follows the product’s actual HSN classification.
          </li>
          <li>
            HSN code (6 digits) and GST rate: the Product Listing Excel fills them in automatically from the category
            and fabric you choose. They are part of your listing, so checking them is your responsibility.{" "}
            <strong>
              If a code looks wrong, or your product does not fit the category or fabric in the list, do not confirm
              that row
            </strong>{" "}
            – contact our customer care at <Mail to={COMPANY.supportEmail} /> or on <WhatsApp />, and we will help you
            correct it before the product goes live.
          </li>
        </ul>
        <p>
          You are responsible for every detail of your listing, including the automatic values (HSN code, courier
          charge, selling price, GST and the price shown on the website) – see Point 8, “Your listing – your
          responsibility”. A product goes live only after you confirm it in the Product Listing Excel and AllBoutiqs
          approves it. AllBoutiqs may ask for corrections before listing.
        </p>
        <p>
          <strong>Legal Metrology declarations:</strong> Where the Legal Metrology (Packaged Commodities) Rules, 2011
          apply, the product and its listing must carry the required declarations: name and address of the
          manufacturer, packer or importer; country of origin; MRP inclusive of all taxes; size or dimensions; and
          consumer-care details. All declarations must be true and must match the product.
        </p>
        <p>
          Not permitted, in line with the Consumer Protection Act and the Guidelines for Prevention and Regulation of
          Dark Patterns, 2023: inflated or fake MRP; false urgency (“only 1 left”) that is not true; hidden charges
          added at checkout; fake, paid or self-written reviews; and prices structured to mislead customers compared
          with your own sales channels.
        </p>
      </>
    ),
  },

  // ---------------------------------------------------------------- PART C
  {
    id: "listings",
    part: "Part C – Listings, sizes and products",
    title: "Listings, stock and dispatch days",
    body: (
      <>
        <p>
          Keep every listing accurate: product name and description, photos, size chart, garment measurements, fabric,
          colour, number of pieces, MRP, stock, seller name and address, country of origin, GST rate and HSN, product
          options and dispatch days. The product sent must match the product shown.
        </p>
        <p>
          You list your products in the AllBoutiqs Product Listing Excel, which our team shares with you: one row per
          product, and one row for each other colour of the same design (for example 2A, 2B). Required boxes turn light
          red while empty; a wrong value turns dark red; the Status column tells you what is still missing.
        </p>
        <h3>When our team fills the Excel for you</h3>
        <p>
          If you give us your website or your own product Excel, our team may fill the Product Listing Excel for you.
          You then check it and send one confirmation by email (reply to <Mail to="hello@allboutiqs.com" />):{" "}
          <em>
            “I have checked the Excel and I confirm all products &lt;first SKU&gt; to &lt;last SKU&gt; with my answers
            above. All products in the photos are real and original. You may go live.”
          </em>{" "}
          AllBoutiqs then marks “I confirm” and the AI answer on each of those rows, with the date of your email. Your
          responsibility for the listing is the same as if you had filled it yourself.
        </p>
        <h3>Listing type, stock and sold out</h3>
        <ul>
          <li>
            <strong>Made to Order:</strong> you make it in the size ordered after the order is placed; it is never out
            of stock.
          </li>
          <li>
            <strong>Ready to Ship:</strong> you have it in stock – write the stock for each size. When a size sells out
            you choose, for each product: <strong>Make to order</strong> (with your extra ₹ and extra days) or{" "}
            <strong>Hide that size</strong>. A size you make to order is Return No and COD No, like every Made to Order
            product. If nothing is chosen, the size shows “Sold out” with “Notify me”.
          </li>
          <li>
            <strong>Colours:</strong> each colour of a design has its own row, SKU and front photo.
          </li>
          <li>
            <strong>Extra charge for bigger sizes:</strong> if bigger sizes cost more, pick the sizes (for example XL to
            3XL) and fill either a % or a ₹ amount – not both.
          </li>
        </ul>
        <p>
          <strong>Update your stock as soon as a product sells out</strong> – in your seller dashboard where this
          option is available, or by telling our team. A confirmed order that cannot be fulfilled because the product
          is unavailable counts as a boutique-initiated cancellation (Point 16).
        </p>
        <h3>Return &amp; refund and COD – please check every product</h3>
        <p>
          <strong>
            At the start, Return &amp; refund and COD may be on or off for your products, as set by AllBoutiqs. Please
            check each product: for Ready to Ship products you can switch them on or off at any time. Made to Order
            products are always Return No and COD No.
          </strong>{" "}
          You can change them in the Excel – for all products in the top setting of row 1, or product by product – or
          by writing to our team with the SKUs or “all”. The product page shows the setting clearly to the customer.
        </p>
        <h3>Dispatch days – your real days</h3>
        <p>
          For each product you give your real Dispatch days: the number of days until the product is packed and ready
          for courier pickup from your store – for Made to Order, the days to make and pack it; for Ready to Ship, the
          days to pack a piece you have in stock.{" "}
          <strong>Do not add any extra days: AllBoutiqs adds the customer delivery estimate itself.</strong> The
          customer sees a “Ships in” time based on your dispatch days plus up to 3 working days for AllBoutiqs warehouse
          quality check and processing. Delivery after shipping depends on the courier and is shown only as an
          estimate. You are responsible only for your own dispatch days. Products that repeatedly miss their dispatch
          days may be paused.
        </p>
        <h3>Customisation</h3>
        <p>
          If the customer can give their own measurements or change a specific part (for example sleeve, length or
          neck) for an extra charge, pick Customisation Yes and fill both the customisation charge (%) and the
          customisation extra days. Both are shown to the customer before payment. The time shown to the customer is
          your dispatch days + the customisation extra days.
        </p>
        <p>
          AllBoutiqs lists your products on the website from your Product Listing Excel. After that you can see them in
          your seller dashboard. AllBoutiqs may edit a product on your behalf only with your approval.
        </p>
        <h3>Your listing – your responsibility</h3>
        <p>
          You are responsible for every detail of your listing – the boxes you fill in the Product Listing Excel, the
          normal values used when you leave an optional box empty, and the automatic boxes (HSN, courier charge,
          selling price, GST and the price shown on the website).{" "}
          <strong>
            Check every box, make sure the Status column shows ✓, and only then pick “✓ I confirm – go live”
          </strong>{" "}
          (or “✓ I confirm – all complete products” in row 1, which confirms only the rows whose Status is ✓).
        </p>
        <p>
          If you notice any error or are unsure about any value, please contact our team before you confirm – or
          immediately, if you find it later – and we will help you correct it. Any change to a live product goes live
          only after AllBoutiqs review.
        </p>
        <p>
          <strong>
            However your listing is prepared – by you, by our team from your website or Excel, or with values filled
            automatically – you must check it before and after it goes live and inform us at once of any mistake. The
            listing remains entirely your responsibility.
          </strong>{" "}
          Any setting or value filled by default, including Return &amp; refund and COD, is also your responsibility to
          check.
        </p>
        <h3>Switching a product off</h3>
        <p>
          You can switch a product, or a single SKU, off or on from your seller dashboard where this option is
          available, or by asking our team.{" "}
          <strong>Every order already placed must be fulfilled within your committed time.</strong> Customers already
          at checkout may still complete payment for up to about 1 hour after a product is switched off; please fulfil
          those orders too. We recommend switching a product off about 1 hour before you wish to stop taking orders.
        </p>
      </>
    ),
  },
  {
    id: "sizes",
    title: "Sizes, measurements and fit",
    body: (
      <>
        <p>
          Accurate measurements are essential for reducing size and fit-related returns, so every product must provide
          clear and honest measurements.
        </p>
        <h3>Size chart</h3>
        <ul>
          <li>Every stitched product needs a size chart for each size offered, in inches (centimetres may be added).</li>
          <li>
            Give finished-garment measurements — the garment laid flat and measured — unless you clearly label them
            “body measurements”.
          </li>
          <li>
            Include as applicable: bust / chest, waist, hip, shoulder, sleeve length, armhole, top / kurta length,
            bottom length, inseam, lehenga or skirt flare. Measure flat, edge to edge, and double the figure where it
            goes all the way round (bust, waist, hip).
          </li>
          <li>
            S, M, L, XL or 36, 38, 40 must follow your own size chart. “Free size” must state the maximum bust, waist
            and hip it fits.
          </li>
          <li>Where a model is shown, you may state the model’s height and the size worn.</li>
          <li>State the fit (for example regular, relaxed or slim) and whether the fabric stretches.</li>
        </ul>
        <p>
          Made to Order sizes: the AllBoutiqs size chart for that category is used (body measurements, in inches); you
          pick the size range you make in the Excel (for example XS to XXL).
        </p>
        <h3>Product-specific measurements</h3>
        <ul>
          <li>
            Sarees — length and width in metres; whether a blouse piece is included and its length (for example 5.5 m +
            0.8 m blouse piece).
          </li>
          <li>
            Lehengas and sets — blouse stitched, semi-stitched or unstitched; lehenga length and waist range; dupatta
            length and width; number of pieces.
          </li>
          <li>Unstitched suits and fabric — length of each piece in metres.</li>
          <li>Semi-stitched items — the maximum size that can be made from the available margin.</li>
        </ul>
        <h3>Custom Fit measurements</h3>
        <ul>
          <li>
            The customer gives measurements through the AllBoutiqs measurement form. The confirmed measurements are
            locked as a version; any change creates a new version that the customer confirms.
          </li>
          <li>Every custom garment keeps a 1-inch seam margin.</li>
          <li>A measurement change requested after stitching has started is flagged for AllBoutiqs review.</li>
        </ul>
        <h3>Measurement tolerance</h3>
        <p>
          Handmade garments vary slightly. Unless the product page promises an exact measurement, a difference of up to
          ±1 inch (±2.5 cm) from the stated garment measurement, and up to ±2% of the stated length for sarees and
          fabric, is normal. A larger difference is a mismatch under Point 12. Consumer-law rights are not affected.
        </p>
        <h3>Measurement responsibility — important</h3>
        <ul>
          <li>
            <strong>Boutique error:</strong> the boutique is responsible for every measurement, size chart and
            measurement confirmation it supplies or approves. If a measurement supplied or confirmed by the boutique is
            wrong or incomplete, or the confirmed measurement is not followed in stitching, the boutique bears the
            resulting cost — alteration, remake, the one fixed courier charge, refund and re-fulfilment.
          </li>
          <li>
            <strong>AllBoutiqs error:</strong> if the boutique used the correct measurement but AllBoutiqs is shown, from
            its own records, to have recorded or passed it on incorrectly, AllBoutiqs bears the cost directly caused by
            its error.
          </li>
          <li>
            <strong>Customer error:</strong> if the customer gave a wrong measurement and the boutique stitched exactly
            to the measurement confirmed through AllBoutiqs, it is not a boutique error — unless the boutique failed to
            flag an obvious inconsistency it should reasonably have noticed.
          </li>
          <li>
            This rule is the same for every boutique and cannot be changed privately, except by written agreement with
            AllBoutiqs.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "made-to-measure",
    title: "Made-to-measure and customised orders",
    body: (
      <ul>
        <li>
          The customer gives measurements through the AllBoutiqs measurement form.{" "}
          <strong>
            You never contact the customer directly or ask for their phone, WhatsApp or address; any clarification goes
            through AllBoutiqs.
          </strong>
        </li>
        <li>
          Review the measurements before cutting.{" "}
          <strong>
            If one looks wrong or incomplete, tell AllBoutiqs within 24 hours of receiving the measurements and do not
            cut the fabric until it is confirmed
          </strong>
          ; your dispatch days restart once the measurement is confirmed.
        </li>
        <li>
          A garment made exactly to the confirmed measurements is non-returnable for fit or change of mind. A garment
          not made to the confirmed measurements is a mismatch under Point 12.
        </li>
        <li>Any free alteration you offer must be stated on the product page.</li>
        <li>
          The customer may submit measurements at the time of ordering or within 7 days. If they are not received
          within 7 days, the order is cancelled automatically and the customer is refunded as set out in the Customer
          Terms &amp; Conditions.
        </li>
        <li>
          A customised order can be cancelled by the customer within 24 hours of ordering only; stitching starts only
          after that window and once the measurements are confirmed.
        </li>
      </ul>
    ),
  },
  {
    id: "intellectual-property",
    title: "Original designs and intellectual property",
    body: (
      <p>
        You are responsible for ensuring that your products, designs, photos, videos, descriptions, logos and
        trademarks do not infringe anyone else’s rights. Where a genuine authenticity, intellectual-property or legal
        concern is identified, AllBoutiqs may suspend the listing, order, payment or account while it is reviewed and
        may ask for supporting documents.
      </p>
    ),
  },

  // ---------------------------------------------------------------- PART D
  {
    id: "cod-returns",
    part: "Part D – Orders, shipping and payments",
    title: "COD, returns and refunds",
    body: (
      <>
        <p>
          Return &amp; refund and COD follow the setting of each product (Point 8): at the start they may be on or off,
          as set by AllBoutiqs, and you can switch them on or off for Ready to Ship products at any time. Made to Order
          products are always Return No and COD No. The product page shows this clearly to the customer.
        </p>
        <p>
          <strong>Return Available:</strong> The customer may request a return within 24 hours of courier-confirmed
          delivery. The product must be unworn, unused, unwashed, unaltered and undamaged, with all original tags,
          packaging and the AllBoutiqs tamper-evident tag intact.
        </p>
        <p>
          <strong>Return Not Available:</strong> No change-of-mind return. Genuine damage, defect, wrong-product or
          mismatch complaints may still be raised within 24 hours of courier-confirmed delivery, subject to
          verification.
        </p>
        <p>
          <strong>Consumer rights:</strong> The 24-hour window is AllBoutiqs’ operational reporting window. A complaint
          about a defective, damaged, wrong, deficient or misdescribed product raised after 24 hours is still reviewed
          on its evidence, and nothing in these Terms limits any customer right or remedy under the Consumer Protection
          Act, 2019 or the Consumer Protection (E-Commerce) Rules, 2020.
        </p>
        <p>
          <strong>Customised products:</strong> Customised, made-to-measure and personalised orders can be cancelled
          only within 24 hours of ordering (Point 16) and cannot be returned for change of mind or fit. Rights for a
          defective, damaged, wrong or mismatched product are not affected.
        </p>
        <p>
          <strong>Mismatch and damage rule</strong> (applies to every product, including Return Not Available
          products): If the product delivered does not match the listing photos, description, size chart or
          specifications beyond the tolerance in Point 9, is not made to the confirmed measurements, or is defective,
          damaged or wrong,{" "}
          <strong>
            the customer is entitled to a return and full refund, and the refund is charged to the boutique, and the
            boutique pays only the one fixed courier charge as per the rate card
          </strong>
          , except where Point 9 places the cost on AllBoutiqs or the customer.
        </p>
        <LegalNote title="Product fails the warehouse quality check">
          <p>
            Every product is quality-checked at the AllBoutiqs warehouse before dispatch. A product found damaged,
            defective or different from the listing is not sent to the customer: it is returned to you, and you pay the
            one fixed courier charge as per the rate card for that return, deducted from your settlement. No
            commission, technology &amp; service fee or Payment Processing Service Fee is taken on that order. The order
            is cancelled or re-fulfilled.
          </p>
        </LegalNote>
        <p>
          <strong>Return inspection:</strong> Every permitted return is sent to the AllBoutiqs warehouse and inspected
          before any refund. A returned product must be unused, unwashed and unaltered, with original tags, packaging
          and the tamper-evident tag (where one was applied, and unless the defect itself makes that impossible); a
          return that fails inspection is sent back to the customer.
        </p>
        <p>
          <strong>Returns &amp; RTO courier cost:</strong> if an order is returned, refused at delivery or comes back to
          origin (RTO), you pay only the one fixed courier charge as per the rate card, deducted from your settlement.
          No commission, technology &amp; service fee or Payment Processing Service Fee is taken on these orders.
        </p>
        <p>
          <strong>Refund:</strong> processed to the customer within 7 working days after an approved inspection,
          subject to gateway and banking timelines.
        </p>
        <h3>Return protection and evidence</h3>
        <ul>
          <li>
            <strong>Keep a packing record for every order</strong> — a clear video or photos showing the product, its
            tags and the order ID as it is packed. Disputes about wrong, missing, damaged or swapped products are
            decided on evidence, and a packing record is the boutique’s strongest proof.
          </li>
          <li>
            A return that is used, washed, altered, damaged by the customer, missing items or a different product is
            rejected and the refund refused; the product is sent back to the customer.
          </li>
          <li>
            Returned products are sent back to you (return to vendor).{" "}
            <strong>You must accept every return-to-vendor delivery</strong>; refused deliveries are re-sent at your
            cost.
          </li>
          <li>
            If a returned product reaches you damaged, incomplete or different, raise it through seller support within
            48 hours of receiving it, with an unboxing video and photos. AllBoutiqs reviews it against its inspection
            records and the courier claim process. Claims raised after 48 hours, or without evidence, may not be
            accepted or settled. A settled claim is final.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "packaging-shipping",
    title: "Packaging, pickup, warehouse and shipping",
    body: (
      <>
        <p>
          All orders are shipped through the AllBoutiqs warehouse unless AllBoutiqs authorises otherwise in writing.{" "}
          <strong>You never ship directly to the customer.</strong>
        </p>
        <p>
          <strong>Pickup label:</strong> the label on your parcel addresses it only to the AllBoutiqs quality-check
          centre and carries no customer details. After the quality check, the warehouse repacks the parcel and ships it
          to the customer with a new label.
        </p>
        <p>
          <strong>What the quality check covers:</strong> product quality, match with the listing, and packaging.{" "}
          <strong>
            AllBoutiqs may check measurements during the quality check, but measurements remain entirely your
            responsibility – please re-check them before sending. A check by AllBoutiqs does not move this
            responsibility to AllBoutiqs
          </strong>{" "}
          (Point 9).
        </p>
        <p>
          Pack each product exactly as you would for your own premium customer: a rigid box or proper garment
          packaging, protected against damage, clean and presentable, with the invoice or packing slip inside. Your
          packaging stays as it is; the warehouse adds the AllBoutiqs outer wrap. Packaging that is unsafe or below
          standard may be rejected and returned at your cost.
        </p>
        <p>
          <strong>Tamper-evident tag:</strong> For every returnable product, the AllBoutiqs warehouse applies an
          AllBoutiqs tamper-evident tag before dispatch. The tag must stay intact while the product is with the
          customer. If it is removed, broken or altered, the product may not be eligible for a change-of-mind return,
          subject to applicable law.
        </p>
        <h3>Parcel weight and dimensions</h3>
        <ul>
          <li>
            When AllBoutiqs asks for them for the courier booking, give the correct packed weight in grams (including
            packaging) and the packed dimensions — length × breadth × height in centimetres. They are used for the
            courier booking; your courier charge stays fixed as per the rate card. For an unusually heavy or oversized
            parcel, an extra courier charge may apply as per its weight and size; AllBoutiqs will inform you before
            dispatch.
          </li>
          <li>Use packaging close to the product’s size, so the parcel travels safely.</li>
        </ul>
        <h3>Parcel photo before pickup</h3>
        <p>
          <strong>
            Before you mark “Handing Over to Courier”, send AllBoutiqs a clear photo of the sealed, packed parcel with
            the order ID visible – on <WhatsApp />, or in any other way our team confirms.
          </strong>{" "}
          AllBoutiqs uses this photo as evidence for pickup, transit and courier complaints.
        </p>
        <h3>Pickup timing</h3>
        <p>
          <strong>Mark “Handing Over to Courier” by 11:00 AM on a working day for same-day pickup.</strong> Later orders
          are picked up the next working day.
        </p>
        <p>
          For orders above ₹50,000, mark “Handing Over to Courier” by 9:00 AM for same-day pickup; later orders are
          picked up the next working day. AllBoutiqs creates the e-way bill and shares it with you; place a printed copy
          with the duplicate invoice in the “Documents Enclosed” pouch.
        </p>
        <h3>E-way bill on your behalf</h3>
        <p>
          Wherever the law requires an e-way bill (consignment value above ₹50,000 including GST), AllBoutiqs generates
          it on your behalf, using the details of your invoice, for each movement of the parcel (your location → our
          quality-check centre → the customer). The same applies to returns, wherever applicable. Our courier partner
          completes the transport details. The e-way bill number is printed on the courier label, and a copy travels
          with the parcel, as required by law.
        </p>
        <p>
          By accepting these Terms, you authorise AllBoutiqs to generate these e-way bills for you. For any question,
          our team is always happy to help at <Mail to={COMPANY.supportEmail} />.
        </p>
      </>
    ),
  },
  {
    id: "parcel-contents",
    title: "What may go inside the parcel",
    body: (
      <>
        <p>
          Only the ordered product, your normal product packaging, the invoice or packing slip from the seller
          dashboard, and any item AllBoutiqs expressly authorises.
        </p>
        <p>
          <strong>
            No business cards, phone or WhatsApp numbers, QR codes, coupon or offer cards, promotional flyers, external
            payment instructions or anything meant to move the customer away from AllBoutiqs.
          </strong>{" "}
          A parcel that raises a concern may be held while it is reviewed.
        </p>
      </>
    ),
  },
  {
    id: "settlement",
    title: "Payment and weekly settlement",
    body: (
      <>
        <p>
          <strong>Customers pay AllBoutiqs, never the boutique.</strong> You must not collect payment from the customer
          for an AllBoutiqs order.
        </p>
        <p>
          <strong>When an order is eligible:</strong> An order becomes eligible for payment after the 24-hour return
          window ends, when no valid return, refund, damage, defect, wrong-product, mismatch, fraud, payment, legal or
          compliance issue is pending, and any return inspection is complete.
        </p>
        <h3>Weekly payment — every Wednesday</h3>
        <ul>
          <li>
            <strong>Eligible payments are made every Wednesday to your registered bank account.</strong>
          </li>
          <li>Orders eligible by Tuesday 11:59 PM are paid that Wednesday.</li>
          <li>Orders eligible after Tuesday 11:59 PM are paid the next Wednesday.</li>
          <li>
            COD orders become eligible only after AllBoutiqs receives the COD amount from the courier; the same Tuesday
            11:59 PM cutoff then applies for the Wednesday payment.
          </li>
          <li>Payouts are made by bank transfer, and the bank reference number (UTR) is shown for each payout.</li>
        </ul>
        <p>
          <strong>Bank details:</strong> Keep your bank, IFSC, PAN and GST details correct and up to date. AllBoutiqs is
          not responsible for any delayed, failed or wrong payment — including payment made to another account — caused
          by incorrect, incomplete or outdated details you supplied.
        </p>
        <p>
          <strong>Change of bank account:</strong> if your bank account changes – for example, it is closed, blocked or
          was entered wrongly – <strong>inform us immediately</strong> by email at <Mail to={COMPANY.supportEmail} />{" "}
          and on <WhatsApp />. The new account is used only after it is verified, and the change may take some time,
          because some amounts may already be in processing to the old account. In an emergency, inform us at once.
        </p>
        <p>
          <strong>Refund after payment:</strong> If, after a settlement has been paid to you, any refund, adjustment,
          excess or mistaken payment, charge or other amount becomes due from you, AllBoutiqs deducts it from your next
          Wednesday settlement. If that is not enough, you pay the balance within 7 days from the date AllBoutiqs tells
          you the amount due.
        </p>
        <p>
          <strong>Settlement statement:</strong> Each statement shows, each on its own line: product sale value,
          commission, technology &amp; service fee, Payment Processing Service Fee, fixed courier charge, Route transfer
          charge (if any), GST on AllBoutiqs fees, EMI subvention (if you allow it), GST TCS, Income-tax TDS, returns,
          refunds, cancellations, other authorised deductions and the final amount paid. The dashboard statement is the
          controlling calculation. The settlement statement is not a tax invoice. AllBoutiqs issues a monthly Fee
          Invoice for its fees (Point 5), so you can claim input tax credit where eligible. Statements can be
          downloaded as PDF or Excel from the dashboard. Any query about a statement can be raised through support and
          is reviewed against the order records.
        </p>
        <p>
          <strong>Return after the Fee Invoice:</strong> if a return is approved after that month’s Fee Invoice has
          been issued, AllBoutiqs gives back the commission, technology &amp; service fee and Payment Processing Service
          Fee of that order by a seller fee credit note. The fixed courier charge is not given back. You must reverse
          the input tax credit shown on that credit note.
        </p>
      </>
    ),
  },
  {
    id: "cancellations",
    title: "Cancellations and fulfilment performance",
    body: (
      <>
        <p>
          <strong>24-hour cancellation window:</strong> Customers can cancel any order within 24 hours of ordering.
          These 24 hours run continuously, including Sundays and holidays. At checkout the customer sees:{" "}
          <em>“Free cancellation within 24 hours – full refund to your AllBoutiqs Wallet.”</em> After 24 hours, the
          customer cannot cancel the order.
        </p>
        <ul>
          <li>
            <strong>Ready to Ship:</strong> you may prepare and pack the parcel, but hand it to the courier only after
            the 24 hours end.
          </li>
          <li>
            <strong>Made to Order:</strong> you may plan the work and prepare in the background (for example, arrange
            the fabric and plan the work), but start cutting or stitching only after the 24 hours end.
          </li>
        </ul>
        <p>
          <strong>
            Any preparation before the 24 hours end is your own choice and at your own cost. If the customer cancels
            within the 24 hours, no amount is payable to you for that order.
          </strong>
        </p>
        <p>
          Example: if you receive an order on Sunday at 3:00 PM, the window closes on Monday at 3:00 PM. After that you
          can hand it to the courier, or start cutting or stitching.
        </p>
        <p>
          <strong>Cancellation by AllBoutiqs after the parcel reaches the warehouse:</strong> because the customer’s
          window closes before you dispatch, a customer cannot cancel once the parcel is on its way. If AllBoutiqs
          itself cancels an order after the parcel has reached the warehouse, for a reason that is not your fault,
          AllBoutiqs pays the courier to return the product to you.
        </p>
        <p>
          <strong>
            If you cannot fulfil a confirmed order, inform AllBoutiqs immediately and in any case within 24 hours of
            confirmation.
          </strong>
        </p>
        <p>
          Three boutique-initiated cancellations trigger a performance review and may lead to listing restrictions,
          suspension or delisting. There is no fixed late-handover penalty at launch; AllBoutiqs may cancel a late order
          and recover the actual logistics cost caused by the delay.
        </p>
      </>
    ),
  },
  {
    id: "transit-rto",
    title: "Transit loss, damage and RTO",
    body: (
      <p>
        Once a correctly packed product is accepted by the AllBoutiqs courier and pickup is recorded, transit loss or
        damage is handled through the AllBoutiqs and courier claim process. The boutique remains responsible where the
        issue results from inadequate packaging, a wrong or defective product, incorrect weight or dimensions,
        prohibited contents or another seller-caused issue. For refused deliveries, RTO and returns, you pay only the
        one fixed courier charge as per the rate card, deducted from your settlement (Point 5); no commission,
        technology &amp; service fee or Payment Processing Service Fee is taken on these orders.
      </p>
    ),
  },

  // ---------------------------------------------------------------- PART E
  {
    id: "content-use",
    part: "Part E – Content, data and compliance",
    title: "Content use and boutique credit",
    body: (
      <>
        <p>
          You grant AllBoutiqs a non-exclusive, royalty-free licence, for as long as you sell on AllBoutiqs, to host,
          reproduce, resize, format and use the photos, videos and descriptions you supply for product listings and to
          market AllBoutiqs on its website and app, social media, advertising, campaigns and catalogues. Ownership of
          your original content stays with you. Where applicable, AllBoutiqs may credit your boutique or tag your
          Instagram. You confirm you have all rights and consents needed for this use, including from any model shown.
        </p>
        <p>
          You may withdraw permission for future marketing use by writing to us; material already published, printed or
          shared may not be recallable.
        </p>
      </>
    ),
  },
  {
    id: "customer-data",
    title: "Customer data, privacy and confidentiality",
    body: (
      <>
        <p>
          <strong>
            Customer details you receive may be used only to fulfil that order and meet legal or tax obligations.
          </strong>{" "}
          You may not use them for your own marketing, add customers to your lists, contact them about anything
          unrelated to the order, share them, or move the sale outside AllBoutiqs. Both AllBoutiqs and the boutique keep
          customer information confidential and secure under the Digital Personal Data Protection Act, 2023 and its
          Rules as they apply.
        </p>
        <p>
          Settlement statements, commercial terms, dashboard information and other non-public AllBoutiqs information are
          confidential, except disclosure to your professional advisers or where the law requires.
        </p>
        <p>
          <strong>Privacy View:</strong> your dashboard shows each order’s ID, product, size, price, status, city and
          state. The customer’s name and address appear only on your invoice copy, where the law requires them; the
          customer’s phone number and email are never shared with you.
        </p>
        <p>
          <strong>Customer interest:</strong> you can see how many customers showed interest in your products (wishlist,
          cart, enquiries), but never their contact details.
        </p>
        <p>
          How AllBoutiqs handles your own personal data is explained in the AllBoutiqs <Privacy />, a separate document
          on allboutiqs.com.
        </p>
      </>
    ),
  },
  {
    id: "documents-security",
    title: "Documents, compliance and account security",
    body: (
      <>
        <p>
          Before your first listing AllBoutiqs may require: GST registration certificate; PAN; cancelled cheque or bank
          proof; identity proof of the authorised person; entity documents; signed or digital acceptance of these
          Terms; and, where relevant, brand authorisation, certificates, licences and trademark or design documents.
          Keep these in the 1_Documents folder of your AllBoutiqs Google Drive folder (Point 3).
        </p>
        <p>
          <strong>Seller information shown to customers:</strong> Under the Consumer Protection (E-Commerce) Rules,
          2020, as amended, AllBoutiqs must display certain seller details. You must provide for display, and keep
          current: your legal business name, GSTIN, MSME/Udyam number (if any), business address, website and email (if
          any), customer-care number and email, Grievance Officer name, designation and contact, the country of origin
          of each product, and the return, refund, warranty and delivery information for each product. Inform
          AllBoutiqs immediately of any change. Your ratings and aggregated customer feedback may also be shown.
        </p>
        <p>
          <strong>Grievance Officer:</strong> the person designated by your boutique to receive and handle customer
          complaints and grievances. The owner may also be designated as the Grievance Officer.
        </p>
        <p>Each boutique must provide its customer-care contact and Grievance Officer details and keep them current.</p>
        <h3>Seller dashboard and account security</h3>
        <ul>
          <li>
            Your seller dashboard login, password and OTP are your responsibility. Keep them safe and do not share them
            with anyone you do not trust.
          </li>
          <li>
            <strong>
              Any action or change made from your account – by you, by your staff, or by anyone using your password or
              OTP, including by mistake or misuse – is treated as done by your boutique.
            </strong>{" "}
            AllBoutiqs is not responsible for it.
          </li>
          <li>
            If you think your login has been misused, inform us immediately at <Mail to={COMPANY.supportEmail} /> or
            on <WhatsApp />.
          </li>
        </ul>
        <p>
          <strong>Official communication:</strong> AllBoutiqs communicates with you through its official channels: the
          allboutiqs.com website, @allboutiqs.com email, and its published WhatsApp and phone numbers. AllBoutiqs can
          change, add or select any of these channels.
        </p>
      </>
    ),
  },
  {
    id: "promotions-ranking",
    title: "Promotions, ranking and visibility",
    body: (
      <>
        <p>
          Participation in AllBoutiqs sales and campaigns is voluntary. No boutique-funded offer is applied without your
          consent in the dashboard or in writing. Offers funded by AllBoutiqs do not reduce your settlement.
        </p>
        <p>
          <strong>Reviews must be genuine.</strong> You must not write, buy, exchange or arrange reviews or ratings,
          post as a customer, offer gifts or offers in return for positive reviews, or try to remove or suppress genuine
          negative reviews. Breach may lead to removal of the reviews and suspension.
        </p>
        <p>
          Products are ranked using marketplace factors such as relevance, listing completeness, availability,
          fulfilment performance, quality, returns, and customer ratings and feedback. The main ranking parameters are
          published on allboutiqs.com in descending order of importance, with their relative importance. Sponsored or
          promoted placements are clearly identified. Where AllBoutiqs gives differentiated treatment to sellers in the
          same category, it is disclosed as required by the E-Commerce Rules.
        </p>
      </>
    ),
  },
  {
    id: "quality-suspension",
    title: "Marketplace quality, monitoring and suspension",
    body: (
      <>
        <p>
          AllBoutiqs may review seller information, listings, photos, measurements, pricing, inventory, dispatch
          performance, cancellations, returns, complaints, authenticity, packaging, declared weights, reviews and
          customer-data use.
        </p>
        <p>
          Correctable issues are raised with you first. Immediate suspension or delisting may follow serious issues:
          counterfeit or copied products, fake documents, fraud, repeated misrepresentation, fake reviews, misuse of
          customer data, diverting customers off-platform, prohibited parcel inserts, repeated fulfilment failures or
          breach of law.
        </p>
        <h3>Badges and tags</h3>
        <p>
          Any badge or tag that AllBoutiqs gives a boutique or product – for example Trusted, Verified or Featured – is
          given at AllBoutiqs’ discretion and can be removed at any time for misleading information, misbehaviour,
          irregularity or repeated breaches of these Terms.
        </p>
        <h3>Inactive boutiques</h3>
        <p>
          If a boutique does not reply to AllBoutiqs, does not respond to orders or messages, or stays inactive,
          AllBoutiqs may pause its products or remove them from live, in a proper and professional way, so that
          customers are not affected. The products can go live again once the boutique is active and the pending points
          are resolved.
        </p>
      </>
    ),
  },

  // ---------------------------------------------------------------- PART F
  {
    id: "complaints",
    part: "Part F – Complaints, set-off and invoices",
    title: "Customer complaints and disputes",
    body: (
      <>
        <p>
          AllBoutiqs coordinates customer support.{" "}
          <strong>
            You must respond to an AllBoutiqs complaint or query immediately, and in any case within a maximum of 2
            working days.
          </strong>{" "}
          Decisions on defective, wrong, damaged, wrong-size or mismatched products rely on warehouse inspection,
          measurement records, photos and videos, listing and order data, packaging evidence and courier records.
        </p>
        <p>
          AllBoutiqs aims to acknowledge every customer complaint within 24 hours and to resolve it within 7 days, as
          required by the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, as
          amended by G.S.R. 120(E) dated 10 February 2026. Your 2-working-day reply time above helps AllBoutiqs meet
          this. Every complaint gets a ticket number so the customer can track it, and you must give AllBoutiqs any
          information or evidence it asks for promptly. The AllBoutiqs Grievance Officer’s name and contact are
          published on allboutiqs.com and in the seller dashboard. Each boutique maintains its own legally required
          grievance details.
        </p>
      </>
    ),
  },
  {
    id: "set-off",
    title: "Set-off",
    body: (
      <p>
        A refund, excess payment or other amount recoverable from the boutique under these Terms may be deducted from
        that order or a later settlement. Each such deduction is shown in your settlement statement, and you may dispute
        it through support with supporting documents.
      </p>
    ),
  },
  {
    id: "invoices",
    title: "Invoice and tax responsibility",
    body: (
      <>
        <p>
          AllBoutiqs generates the tax invoice for each AllBoutiqs sale through the seller dashboard, on your behalf, in
          your legal name and GSTIN, using a separate invoice series for your AllBoutiqs sales for each financial year.
          Do not use this series for sales outside AllBoutiqs. An issued invoice is never deleted; any correction is
          made by a credit note, and downloading a copy again never creates a new invoice number.
        </p>
        <p>
          <strong>Your authorisation:</strong> by accepting these Terms, you authorise {COMPANY.legalName}, as the
          e-commerce operator, to issue your tax invoices and credit notes electronically on your behalf. They are
          computer-generated and need no signature.
        </p>
        <p>
          You are responsible for the accuracy of the information you supply for the invoice: legal name, address,
          GSTIN, PAN, HSN, GST rate and product details. You also remain responsible for your own GST returns,
          income-tax return, books of account, input tax credit and reconciliation of TCS and TDS credits.
        </p>
        <h3>How the invoice is created</h3>
        <ul>
          <li>
            One order is created for each boutique: if a customer buys from several boutiques together, each boutique
            gets its own order and invoice.
          </li>
          <li>
            The tax invoice is created automatically, with GST, as soon as the order is placed. If the order is
            cancelled, a credit note is issued against it.
          </li>
          <li>
            Where an e-way bill is required, AllBoutiqs generates it from the same invoice for each movement of the
            parcel, and for returns wherever applicable (Point 13).
          </li>
          <li>
            Three copies: Original inside the parcel for the customer, Duplicate for the transporter, Triplicate kept in
            your dashboard.
          </li>
          <li>
            For an unregistered customer with a taxable value of ₹50,000 or more, the invoice carries the customer’s
            name, address, delivery address and State with its code; below ₹50,000, these are added only if the
            customer asks.
          </li>
          <li>
            Where the consignment value (including GST) is above ₹50,000, dispatch is held until the e-way bill is
            recorded, including any update needed during transport (for example, if the vehicle changes or the journey
            takes longer).
          </li>
          <li>
            If a product fails the AllBoutiqs quality check, dispatch stops and the reason and photos are recorded. The
            invoice is then reviewed for cancellation or a credit note — it is never cancelled automatically. A credit
            note is issued only where the GST law allows it, and a delivery challan covers the return of the goods to
            you (courier charge: Point 12).
          </li>
          <li>
            Keep your invoices, dispatch records and packing records for 72 months from the due date of the annual GST
            return for that year — longer if any appeal or proceeding is pending (CGST Act, Section 36).
          </li>
        </ul>
      </>
    ),
  },

  // ---------------------------------------------------------------- PART G
  {
    id: "indemnity",
    part: "Part G – Legal terms",
    title: "Seller responsibility and indemnity",
    body: (
      <p>
        You agree to indemnify AllBoutiqs against third-party claims, including customer and consumer-court claims, and
        against losses, penalties and costs (including reasonable legal costs) arising from counterfeit or unauthorised
        products, IP infringement, misleading product information, defective products, incorrect tax or invoice
        information, misuse of customer data, breach of these Terms or of applicable law, or any other seller-caused
        violation, to the extent permitted by law. The indemnity does not cover loss caused by AllBoutiqs’ own breach,
        negligence or misconduct.
      </p>
    ),
  },
  {
    id: "term-exit",
    title: "Term, exit and notice",
    body: (
      <>
        <p>
          You may stop selling on AllBoutiqs by giving 30 days’ written notice to AllBoutiqs. AllBoutiqs may end your
          account by written notice, and may suspend or terminate immediately for serious breach, fraud, counterfeit
          products, unlawful activity, material IP infringement or repeated customer harm.
        </p>
        <p>
          Existing orders, returns, refunds and settlements are completed before exit. Confidentiality, customer-data,
          indemnity and settlement obligations continue after exit.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    title: "Liability and force majeure",
    body: (
      <>
        <p>
          AllBoutiqs and the boutique are each responsible for their own obligations. To the extent permitted by law,
          AllBoutiqs’ liability to a boutique for an affected order is limited to the settlement amount due for that
          order, and AllBoutiqs is not liable for indirect loss or loss of profit or business. This limit does not
          reduce settlement amounts properly due to you, and does not apply to fraud, wilful misconduct or any liability
          that cannot be limited by law.
        </p>
        <p>
          <strong>Errors:</strong> The platform is run by people and technology, so errors can happen. Report any error
          to our support team; we will correct it as soon as possible.
        </p>
        <p>
          Neither side is responsible for a delay or failure caused by events beyond its reasonable control, including
          courier disruption, natural events, government action, payment-network or internet outages, strikes, war or
          civil disturbance.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to these Terms and policies",
    body: (
      <>
        <p>
          AllBoutiqs can change these Terms, its Privacy Policy, the customer Terms &amp; Conditions, and its return,
          payment, logistics, commission, technology and other marketplace policies. AllBoutiqs notifies every change in
          the seller dashboard and by email before it takes effect, stating the effective date. The current version is
          always available on the seller dashboard.
        </p>
        <p>
          A change applies only to orders placed on or after its effective date; orders placed earlier stay on the terms
          in force when they were placed, except where the law requires otherwise. Continuing to list or sell after a
          change means acceptance.
        </p>
      </>
    ),
  },
  {
    id: "acceptance-law",
    title: "Acceptance and governing law",
    body: (
      <>
        <p>
          These Terms are the principal commercial and operational terms for AllBoutiqs boutiques and replace earlier
          summaries and informal explanations. You accept them by ticking “I agree to the Terms &amp; Working Process
          and have read the Privacy Policy” and clicking “Accept” on the seller dashboard. The box is never pre-ticked,
          and its links open the current Terms and the AllBoutiqs <Privacy />. Reading the Privacy Policy is an
          acknowledgement only, not consent to any extra purpose. AllBoutiqs records the version, date and time of your
          acceptance; when a new version is published, you will be asked to accept it again before your next listing.
          Listing or selling after a change to these Terms also means acceptance (Point 29). Acceptance in this
          electronic form is valid under the Information Technology Act, 2000.
        </p>
        <p>
          If any part is invalid, the rest remains in force; a delay in enforcing a right is not a waiver. Governed by
          the laws of India; courts of competent jurisdiction at {COMPANY.jurisdiction} have jurisdiction, subject to
          applicable law.
        </p>
      </>
    ),
  },

  // ---------------------------------------------------------------- PART H
  {
    id: "worked-example",
    part: "Part H – Example, checklist and changes",
    title: "Worked example — MRP ₹11,800",
    body: (
      <>
        <p>
          Illustrative only. One Anarkali Set sold at its MRP of ₹11,800. GST is 18% because the price including
          courier, before GST, is ₹10,000 – above ₹2,500 – so ₹1,800 of the MRP is GST. The fixed courier charge for an
          Anarkali Set is ₹460, so your product price is ₹10,000 − ₹460 = ₹9,540. The customer pays ₹11,800. Seller
          subject to TDS.
        </p>
        <LegalTable
          head={["Deduction", "Standard — online", "Standard — EMI", "Founding — online", "Founding — EMI"]}
          numeric={[1, 2, 3, 4]}
          rows={[
            ["Marketplace commission 10% of ₹9,540", "₹954.00", "₹954.00", "₹0.00", "₹0.00"],
            ["Technology & service fee 2% of ₹9,540", "₹190.80", "₹190.80", "₹190.80", "₹190.80"],
            ["GST 18% on commission + technology & service fee", "₹206.06", "₹206.06", "₹34.34", "₹34.34"],
            [
              "Payment Processing Service Fee incl. GST (2.36% / 3.54% of ₹11,800)",
              "₹278.48",
              "₹417.72",
              "₹278.48",
              "₹417.72",
            ],
            ["Courier charge ₹460 + 18% GST (already included in your MRP)", "₹542.80", "₹542.80", "₹542.80", "₹542.80"],
            ["GST TCS 0.5% of ₹10,000", "₹50.00", "₹50.00", "₹50.00", "₹50.00"],
            ["Income-tax TDS 0.1% of ₹10,000 (GST excluded)", "₹10.00", "₹10.00", "₹10.00", "₹10.00"],
            [
              <strong key="t">Total deductions</strong>,
              <strong key="a">₹2,232.14</strong>,
              <strong key="b">₹2,371.38</strong>,
              <strong key="c">₹1,106.42</strong>,
              <strong key="d">₹1,245.66</strong>,
            ],
            [
              <strong key="t">Amount paid to you</strong>,
              <strong key="a">₹9,567.86</strong>,
              <strong key="b">₹9,428.62</strong>,
              <strong key="c">₹10,693.58</strong>,
              <strong key="d">₹10,554.34</strong>,
            ],
          ]}
        />
        <p>
          From the amount paid to you, you pay your own GST of ₹1,800 in your GST return. The ₹50.00 TCS is already in
          your GST cash ledger, the GST on AllBoutiqs fees and on the courier charge is available as input tax credit
          where eligible, and the ₹10.00 TDS is credited against your PAN. For a garment whose price including courier,
          before GST, is ₹2,500 or less (MRP up to ₹2,625), GST is 5% instead of 18%.
        </p>
      </>
    ),
  },
  {
    id: "checklist",
    title: "Checklist before a product goes live",
    body: (
      <ul>
        <li>Legal name, address, PAN and GSTIN are correct.</li>
        <li>
          Category and fabric chosen correctly, so the 6-digit HSN code, the GST rate (5% / 18% for apparel) and the
          courier charge are right – if not, contact our customer care before you confirm.
        </li>
        <li>
          MRP written for one piece – product price + courier charge for the category + GST; selling price is genuine;
          no inflated MRP.
        </li>
        <li>
          GST slab checked – price including courier, before GST, up to ₹2,500 = 5% (MRP up to ₹2,625); from ₹2,501 =
          18%; a lower MRP usually brings more orders.
        </li>
        <li>
          Every box in the Product Listing Excel checked, including the automatic boxes (HSN, courier, selling price,
          GST, price on the website); Status shows ✓ before you pick “✓ I confirm – go live”.
        </li>
        <li>
          At least 3 real product photos (front, back, close-up) and 1 front photo for each extra colour, in your Google
          Drive folder (2_Images, one sub-folder per SKU); no watermark; AI answer chosen; nothing that misrepresents
          the product.
        </li>
        <li>Real Dispatch days given for every product – no extra days added.</li>
        <li>
          Listing type (Made to Order or Ready to Ship), stock for each size and the “When sold out” choice set;
          customisation charge % and extra days filled if Customisation is Yes; bigger-size extra charge filled as % or
          ₹, not both.
        </li>
        <li>
          Return &amp; refund and COD checked for every product – they may be on or off at the start; you can switch
          them for Ready to Ship only.
        </li>
        <li>Manufacturer / packer details and country of origin supplied where required.</li>
        <li>No fake or paid reviews.</li>
        <li>
          Size chart in inches: finished-garment measurements, or clearly labelled body measurements (AllBoutiqs chart
          for Made to Order).
        </li>
        <li>Model height and size worn may be stated, where a model is shown (optional).</li>
        <li>Saree / fabric lengths, lehenga and dupatta dimensions and number of pieces stated.</li>
        <li>Packed weight and parcel dimensions given correctly when AllBoutiqs asks for them.</li>
        <li>
          GSTIN, MSME/Udyam (if any), website and email (if any), and return, refund, warranty and delivery details
          supplied for display.
        </li>
        <li>Made-to-measure terms clear.</li>
        <li>No third-party brand, design, photo or trademark used without rights.</li>
        <li>No contact or payment material in the parcel.</li>
        <li>Packing video or photos kept for every order.</li>
        <li>
          Grievance Officer, customer-care and bank details supplied; bank account name matches your registered
          business.
        </li>
      </ul>
    ),
  },
  {
    id: "what-changed",
    title: "What changed since Version 2.0",
    body: (
      <>
        <p>
          This Version 2.2 (November 2026) replaces Version 2.0 (October 2026), the last version shared with you. The
          main changes:
        </p>
        <h3>Listing, price and photos</h3>
        <ul>
          <li>
            <strong>Points 1, 7, 8:</strong> you list in the AllBoutiqs Product Listing Excel and write one MRP –
            product price (packaging included) + the fixed courier charge for the category + GST. The courier charge is
            deducted from inside your MRP, never on top.
          </li>
          <li>
            <strong>Point 7:</strong> fixed courier charge by category – ₹350, ₹460 or ₹650 – included in your MRP and
            never added on top for the customer; rate-card changes are informed in advance with the start date.
          </li>
          <li>
            <strong>Point 7:</strong> GST slab – price including courier, before GST, up to ₹2,500 = 5% (MRP up to
            ₹2,625), from ₹2,501 = 18%, with a tip to keep the MRP lower; sarees 5% at any price; 6-digit HSN and GST
            rate filled automatically and checked by you.
          </li>
          <li>
            <strong>Point 3:</strong> at least 3 real photos (front, back slightly turned, close-up), up to 6 photos and
            1 video, 1 front photo per extra colour; no watermark; photos and files only by Google Drive (1_Documents,
            2_Images per SKU, 3_Videos, 4_Extra); you may request your video as the front view.
          </li>
          <li>
            <strong>Point 3:</strong> AI answer for every product; an AI model photo only as an extra image that matches
            the real product exactly.
          </li>
          <li>
            <strong>Point 8:</strong> when our team fills your Excel, one email confirmation; you are responsible for
            every box, including the automatic ones; Status ✓ and “✓ I confirm – go live” before a product goes live;
            switching a product off.
          </li>
          <li>
            <strong>Point 8:</strong> Made to Order or Ready to Ship; Made to Order is never out of stock; Ready to Ship
            sold out – make to order or hide the size, else “Sold out” with “Notify me”; extra charge for bigger sizes;
            customisation charge % and extra days.
          </li>
          <li>
            <strong>Point 8:</strong> real dispatch days – no extra days; AllBoutiqs adds the customer delivery
            estimate.
          </li>
          <li>
            <strong>Points 8 and 12:</strong> Return &amp; refund and COD may be on or off at the start – please check
            every product; you can switch them on or off for Ready to Ship products; Made to Order is always No.
          </li>
          <li>
            <strong>Point 8:</strong> however your listing is prepared – by you, by our team or automatically – you
            must check it before and after it goes live; the listing, including every default value, remains your
            responsibility.
          </li>
          <li>
            <strong>Points 9 and 10:</strong> Made to Order uses the AllBoutiqs size chart; Custom Fit measurements are
            locked as a version with a 1-inch seam margin; measurements within 7 days or the order is cancelled; a
            customised order can be cancelled only within 24 hours.
          </li>
        </ul>
        <h3>Charges, taxes and payouts</h3>
        <ul>
          <li>
            <strong>Point 5:</strong> no joining, listing or monthly fee – charges only on orders. Commission and
            technology &amp; service fee are on your product price (MRP without GST and without the courier charge).
          </li>
          <li>
            <strong>Point 5:</strong> AllBoutiqs Payment Processing Service Fee – 2% (EMI 3%) of the amount paid + 18%
            GST on the fee; none on COD orders (the customer pays the COD fee).
          </li>
          <li>
            <strong>Point 5:</strong> Razorpay Route charge only once Route is activated; all AllBoutiqs fees on one
            monthly Fee Invoice.
          </li>
          <li>
            <strong>Points 5, 12, 17:</strong> returns, refused deliveries, RTO and products that fail the quality check
            – only the one fixed courier charge; no commission or fees.
          </li>
          <li>
            <strong>Point 6:</strong> Income-tax TDS 0.1% on the sale value excluding GST (CBDT Circular 20/2023); the
            courier charge inside your price is part of the TCS and TDS base.
          </li>
          <li>
            <strong>Point 15:</strong> payouts every Wednesday by bank transfer with UTR; statements line by line, as
            PDF or Excel; seller fee credit note for a return after the Fee Invoice; change of bank account only after
            verification.
          </li>
        </ul>
        <h3>Orders, shipping and invoices</h3>
        <ul>
          <li>
            <strong>Point 16:</strong> customers can cancel within 24 hours (“Free cancellation within 24 hours – full
            refund to your AllBoutiqs Wallet”); you may prepare and pack, but hand over to the courier or start cutting
            or stitching only after the 24 hours end; if AllBoutiqs cancels after the parcel reaches the warehouse, for a
            reason that is not your fault, AllBoutiqs pays the return courier.
          </li>
          <li>
            <strong>
              Point 13: before you mark “Handing Over to Courier”, send AllBoutiqs a photo of the sealed, packed parcel
              with the order ID visible.
            </strong>
          </li>
          <li>
            <strong>Point 13:</strong> pickup label only to the AllBoutiqs quality-check centre; the check covers
            quality, listing match and packaging – AllBoutiqs may also check measurements, but they remain your
            responsibility; an extra courier charge may apply for an unusually heavy or oversized parcel; pickup by
            11:00 AM (9:00 AM above ₹50,000); AllBoutiqs makes the e-way bill on your behalf for each movement of the
            parcel (your location → quality-check centre → customer), and for returns wherever applicable.
          </li>
          <li>
            <strong>Point 25:</strong> invoice created with GST as soon as the order is placed (credit note if
            cancelled; e-way bill from the same invoice) in your name, separate series, three copies; issued
            electronically by AllBoutiqs on your behalf, no signature; records kept 72 months.
          </li>
          <li>
            <strong>Point 12:</strong> the 24-hour window is a reporting window; customers’ legal rights are never
            limited.
          </li>
        </ul>
        <h3>Account, data and legal</h3>
        <ul>
          <li>
            <strong>Point 19:</strong> Privacy View – you never see the customer’s phone or email; customer interest
            shown without contacts.
          </li>
          <li>
            <strong>Point 20:</strong> seller details shown to customers; documents in your 1_Documents folder; seller
            dashboard and account security – login, password and OTP are your responsibility.
          </li>
          <li>
            <strong>Points 21 and 22:</strong> ranking parameters published; badges and tags can be removed; products of
            an inactive boutique may be paused or removed from live.
          </li>
          <li>
            <strong>Point 23:</strong> customer complaints – AllBoutiqs aims to acknowledge within 24 hours and resolve
            within 7 days.
          </li>
          <li>
            <strong>Points 26–30:</strong> indemnity, liability, changes and acceptance clarified; errors clause; one
            acceptance tick, recorded with version, date and time.
          </li>
          <li>
            <strong>Point 4:</strong> official launch 29 November 2026, 11:30 AM; Founding Period 29 November 2026 to 28
            January 2027.
          </li>
          <li>
            <strong>Contact:</strong> <WhatsApp />, call {COMPANY.callPhone}, {COMPANY.supportEmail}.
          </li>
        </ul>
      </>
    ),
  },
];

const steps: { title: string; text: string }[] = [
  {
    title: "Listing",
    text: "You list products in the AllBoutiqs Product Listing Excel – your MRP (product price + courier charge + GST), sizes and stock, product details, dispatch days, and actual product photos shared by Google Drive.",
  },
  {
    title: "Order",
    text: "The customer places the order and pays AllBoutiqs — online, or Cash on Delivery where COD is on for that product.",
  },
  {
    title: "Pack & pickup",
    text: "You may prepare and pack the order in your own retail-quality packaging at once, but hand it to the AllBoutiqs courier only after the customer’s 24-hour cancellation window ends, within your dispatch days.",
  },
  {
    title: "Warehouse & quality check",
    text: "The AllBoutiqs warehouse checks product quality, listing match and packaging, then applies the AllBoutiqs outer wrap.",
  },
  {
    title: "Delivery",
    text: "AllBoutiqs delivers to the customer through its logistics partners. Any delivery charge to the customer is shown on the product page and at checkout before payment.",
  },
  {
    title: "Returns & inspection",
    text: "Returns follow the Return & refund setting of each product (please check it for every product) and applicable law. Every product is checked at the AllBoutiqs warehouse before dispatch, and every permitted return is inspected there before any refund is approved.",
  },
  {
    title: "Settlement",
    text: "Eligible payments are made every Wednesday to your registered bank account. Orders eligible by Tuesday 11:59 PM are paid that Wednesday; later ones move to the next Wednesday. COD orders are also paid on Wednesday: once AllBoutiqs receives the COD amount from the courier, the same Tuesday 11:59 PM cutoff applies. The charges in Point 5 and the taxes in Point 6 — GST TCS of 0.5% and Income-tax TDS of 0.1% — are deducted, where applicable.",
  },
];

export default function SellerTerms() {
  return (
    <LegalPage
      eyebrow="For selected boutiques & designer brands"
      title="Terms & Working Process"
      version={SELLER_TERMS_VERSION}
      updated={SELLER_TERMS_UPDATED}
      intro={
        <>
          <p>
            These Terms &amp; Working Process set out the commercial and operational rules for listing, orders, sizes
            and measurements, packaging, warehouse quality checks, delivery, returns, taxes, charges and settlement for
            every boutique and designer brand selling on AllBoutiqs, including Founding Boutiques.
          </p>
          <p className="text-sm text-muted-foreground">
            Issued by {COMPANY.legalName} · CIN {COMPANY.cin} · GSTIN {COMPANY.gstin} · Registered office:{" "}
            {COMPANY.officeAddress}
          </p>
          <LegalNote title="How AllBoutiqs works">
            <ol className="list-decimal space-y-3 pl-5 marker:text-gold">
              {steps.map((s) => (
                <li key={s.title} className="pl-1">
                  <strong className="font-medium text-foreground">{s.title}</strong> – {s.text}
                </li>
              ))}
            </ol>
          </LegalNote>
        </>
      }
      sections={sections}
      outro={
        <LegalNote title="Need assistance?">
          <p>If you need help or have a question about the process, our team is happy to assist.</p>
          <ul className="space-y-1">
            <li>
              Email <Mail to={COMPANY.supportEmail} />
            </li>
            <li>
              <WhatsApp />
            </li>
            <li>
              Call{" "}
              <a href={telHref(COMPANY.callPhone)} className={link}>
                {COMPANY.callPhone}
              </a>
            </li>
          </ul>
          <p className="text-sm text-muted-foreground">Team AllBoutiqs · India’s Premium Boutique Marketplace</p>
        </LegalNote>
      }
    />
  );
}
