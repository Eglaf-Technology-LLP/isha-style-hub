import { useState, useEffect, useMemo } from "react";
import { deliveryDateLabel, fetchCartDeliveryDate } from "@/components/CartShippingEstimate";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ShoppingBag,
  Truck,
  CreditCard,
  Banknote,
  Tag,
  X,
  Loader2,
  CheckCircle,
  LogIn,
  MapPin,
  CalendarClock,
  Lock,
  ShieldCheck,
  Package,
  type LucideIcon,
} from "lucide-react";
import { useCartStore, CartItem, cartLineKey } from "@/stores/cartStore";
import { useBuyNowStore } from "@/stores/buyNowStore";
import { openRazorpayCheckout } from "@/lib/razorpay";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { CustomisationDetails } from "@/components/CustomisationDetails";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSavedAddresses, SavedAddress } from "@/hooks/useSavedAddresses";
import { InlineSignInForm } from "@/components/auth/InlineSignInForm";
import { StateSelect } from "@/components/StateSelect";
import { normalizeState } from "@/lib/indianStates";
import { useCustomerShipping } from "@/hooks/useCustomerShipping";
import { usePlatformRates } from "@/hooks/usePlatformRates";
import { CheckoutShell } from "@/components/storefront/checkout/CheckoutShell";
import { SmartImage } from "@/components/storefront/SmartImage";
import { BrandPlaceholder } from "@/components/storefront/BrandPlaceholder";
import { cn } from "@/lib/utils";
import { FreeDeliveryBadge } from "@/components/storefront/FreeDeliveryBadge";
import { useSyncCartPrices } from "@/hooks/useSyncCartPrices";
import { usePincodeAutofill } from "@/lib/pincode";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Every price on this page used .toFixed(0) independently, which is fine
// for the common whole-rupee case but silently lies once a steep discount
// (or anything else) leaves a fractional remainder: subtotal ₹999 minus a
// 99.99% discount is really ₹998.90 off, ₹0.10 still due - rounding each
// figure to the nearest whole rupee on its own showed "Discount ₹999" and
// "Total ₹0" side by side, which don't even reconcile with each other and
// hide that anything is still owed. Whole-rupee amounts still render clean
// (no forced ".00"); only a genuine fractional amount shows its paise.
const formatMoney = (n: number): string => {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2);
};

// Razorpay rejects any order below ₹1 (their real, documented minimum) -
// a steep enough discount (e.g. a near-100% coupon) can legitimately bring
// the payable total below that floor. Without this, "Pay Online" silently
// fails with an unhelpful generic error since create-razorpay-order's own
// request to Razorpay gets rejected server-side. COD has no such floor and
// already handles a sub-₹1 total fine, so steer there instead of failing.
const MIN_ONLINE_PAYMENT_AMOUNT = 1;

interface Discount {
  id: string;
  code: string;
  name: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  min_order_amount: number;
}

interface VendorShippingInfo {
  id: string;
  name: string;
  shipping_flat_rate: number;
  free_shipping_threshold: number | null;
  commission_rate: number;
  cod_enabled: boolean;
  returns_enabled: boolean;
}

// Products with no vendor (legacy/platform-owned) fall back to this default
// instead of a real vendor's own shipping/commission settings.
const PLATFORM_SHIPPING = { flatRate: 99, threshold: 999 };
const PLATFORM_GROUP_KEY = "__platform__";

interface VendorOrderGroup {
  vendorId: string | null;
  vendorName: string | null;
  commissionRate: number;
  items: CartItem[];
  subtotal: number;
  shippingCost: number;
}

export default function Checkout() {
  const navigate = useNavigate();
  // "Buy Now" checks out only that one item and leaves the cart alone
  // (Developer Corrections Part 8, 18); otherwise it's the cart.
  const [searchParams] = useSearchParams();
  const cart = useCartStore();
  const buyNowItem = useBuyNowStore((s) => s.item);
  const clearBuyNow = useBuyNowStore((s) => s.clear);
  const buyNow = searchParams.get("buy") === "now" && !!buyNowItem;
  const items = useMemo(() => (buyNow && buyNowItem ? [buyNowItem] : cart.items), [buyNow, buyNowItem, cart.items]);
  const subtotal = items.reduce((sum, i) => sum + parseFloat(i.price.amount) * i.quantity, 0);
  const clearCart = buyNow ? clearBuyNow : cart.clearCart;
  const { user, loading: authLoading } = useAuth();
  const {
    addresses: savedAddresses,
    defaultAddress,
    addAddress,
  } = useSavedAddresses();

  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    email: "",
    phone: "",
  });

  const [shippingAddress, setShippingAddress] = useState({
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    pincode: "",
    country: "India",
  });
  // City and state from the PIN code; the customer can still change them.
  usePincodeAutofill(shippingAddress.pincode, shippingAddress, (patch) =>
    setShippingAddress((prev) => ({ ...prev, ...patch })),
  );

  // "new" means the fields below are a fresh entry; any other value is the
  // id of the saved_addresses row currently populating them.
  const [selectedAddressId, setSelectedAddressId] = useState<string>("new");
  const [addressPrefilled, setAddressPrefilled] = useState(false);

  // "emi" is a Razorpay payment that opens straight to EMI plans; orders
  // and payments still record it as "razorpay".
  const { shippingCharged } = useCustomerShipping();
  // Today's prices for what's in the cart (they may have changed since it was added).
  useSyncCartPrices(!buyNow);
  const platformRates = usePlatformRates();
  // Pay Online by default (Developer Corrections Part 8, 20).
  const [paymentChoice, setPaymentChoice] = useState<"cod" | "razorpay" | "emi">("razorpay");
  const paymentMethod: "cod" | "razorpay" = paymentChoice === "cod" ? "cod" : "razorpay";
  const [codOffProducts, setCodOffProducts] = useState<string[]>([]);
  const [emiMethods, setEmiMethods] = useState<{
    card: boolean;
    cardless: boolean;
    paylater: boolean;
    min_amount: number | null;
  } | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<Discount | null>(null);
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  // Prefill email once we know who's signed in, and default the address
  // picker to the user's saved default address the first time it loads -
  // both one-time, so later edits (including switching back to "new") aren't
  // clobbered by a re-render.
  useEffect(() => {
    if (user?.email) {
      setCustomerInfo((prev) => (prev.email ? prev : { ...prev, email: user.email! }));
    }
  }, [user]);

  const applySavedAddress = (address: SavedAddress) => {
    setCustomerInfo((prev) => ({ ...prev, name: address.full_name, phone: address.phone }));
    setShippingAddress((prev) => ({
      ...prev,
      address_line1: address.address_line_1,
      address_line2: address.address_line_2 || "",
      city: address.city,
      state: address.state,
      pincode: address.pincode,
    }));
    setSelectedAddressId(address.id);
  };

  useEffect(() => {
    if (addressPrefilled) return;
    if (defaultAddress) {
      applySavedAddress(defaultAddress);
      setAddressPrefilled(true);
    }
  }, [defaultAddress, addressPrefilled]);

  const handleAddressPick = (value: string) => {
    if (value === "new") {
      setCustomerInfo((prev) => ({ ...prev, name: "", phone: "" }));
      setShippingAddress((prev) => ({
        ...prev,
        address_line1: "",
        address_line2: "",
        city: "",
        state: "",
        pincode: "",
      }));
      setSelectedAddressId("new");
      return;
    }
    const address = savedAddresses.find((a) => a.id === value);
    if (address) applySavedAddress(address);
  };

  // Best-effort dedup so re-ordering with an unchanged address never spawns
  // a duplicate saved_addresses row, while any edited or first-time entry
  // does get saved for next time.
  const saveAddressIfNew = async () => {
    const norm = (s: string) => s.trim().toLowerCase();
    const matchesExisting = savedAddresses.some(
      (a) =>
        norm(a.full_name) === norm(customerInfo.name) &&
        norm(a.phone) === norm(customerInfo.phone) &&
        norm(a.address_line_1) === norm(shippingAddress.address_line1) &&
        norm(a.address_line_2 || "") === norm(shippingAddress.address_line2) &&
        norm(a.city) === norm(shippingAddress.city) &&
        normalizeState(a.state) === normalizeState(shippingAddress.state) &&
        norm(a.pincode) === norm(shippingAddress.pincode)
    );
    if (matchesExisting) return;

    await addAddress({
      label: "",
      full_name: customerInfo.name,
      phone: customerInfo.phone,
      address_line_1: shippingAddress.address_line1,
      address_line_2: shippingAddress.address_line2 || undefined,
      city: shippingAddress.city,
      state: normalizeState(shippingAddress.state),
      pincode: shippingAddress.pincode,
      is_default: savedAddresses.length === 0,
    });
  };

  // Each vendor sets their own shipping rate/threshold, so the cart is
  // grouped by vendor and shipping is computed per group. Items with no
  // vendor (legacy/platform-owned products) fall back to a flat default.
  const [vendorInfo, setVendorInfo] = useState<Record<string, VendorShippingInfo>>({});

  // Products whose listing has Cash on Delivery switched off.
  useEffect(() => {
    const productIds = [...new Set(items.map((i) => i.productId))];
    if (productIds.length === 0) {
      setCodOffProducts([]);
      return;
    }
    supabase
      .from("products")
      .select("id, name, cod_available")
      .in("id", productIds)
      .then(({ data, error }) => {
        if (error) {
          console.error("Error fetching Cash on Delivery availability:", error);
          return;
        }
        setCodOffProducts((data || []).filter((p) => p.cod_available === false).map((p) => p.name));
      });
  }, [items]);

  // EMI is offered only once it's switched on for our Razorpay account.
  useEffect(() => {
    if (!user) return;
    supabase.functions.invoke("razorpay-payment-methods").then(({ data }) => {
      if (data?.emi) setEmiMethods(data.emi);
    });
  }, [user]);

  useEffect(() => {
    const vendorIds = Array.from(
      new Set(items.map((i) => i.vendorId).filter((v): v is string => !!v))
    );
    if (vendorIds.length === 0) {
      setVendorInfo({});
      return;
    }
    supabase
      .from("vendors")
      .select("id, name, shipping_flat_rate, free_shipping_threshold, commission_rate, cod_enabled, returns_enabled")
      .in("id", vendorIds)
      .then(({ data, error }) => {
        if (error) {
          console.error("Error fetching vendor shipping info:", error);
          return;
        }
        const map: Record<string, VendorShippingInfo> = {};
        (data || []).forEach((v) => {
          map[v.id] = v;
        });
        setVendorInfo(map);
      });
  }, [items]);

  const vendorGroups = useMemo<VendorOrderGroup[]>(() => {
    const buckets = new Map<string, CartItem[]>();
    for (const item of items) {
      const key = item.vendorId ?? PLATFORM_GROUP_KEY;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(item);
    }

    return Array.from(buckets.entries()).map(([key, groupItems]) => {
      const groupSubtotal = groupItems.reduce(
        (sum, i) => sum + parseFloat(i.price.amount) * i.quantity,
        0
      );

      if (key === PLATFORM_GROUP_KEY) {
        const shipping =
          !shippingCharged || groupSubtotal >= PLATFORM_SHIPPING.threshold ? 0 : PLATFORM_SHIPPING.flatRate;
        return {
          vendorId: null,
          vendorName: null,
          commissionRate: 0,
          items: groupItems,
          subtotal: groupSubtotal,
          shippingCost: shipping,
        };
      }

      const info = vendorInfo[key];
      const flatRate = info?.shipping_flat_rate ?? PLATFORM_SHIPPING.flatRate;
      const threshold = info ? info.free_shipping_threshold : PLATFORM_SHIPPING.threshold;
      // Admin's shipping switch archived = no shipping charge for anyone.
      const shipping = !shippingCharged || (threshold !== null && groupSubtotal >= threshold) ? 0 : flatRate;

      return {
        vendorId: key,
        vendorName: info?.name ?? "Store",
        commissionRate: info?.commission_rate ?? Number(platformRates.current?.marketplace_commission_pct ?? 10),
        items: groupItems,
        subtotal: groupSubtotal,
        shippingCost: shipping,
      };
    });
  }, [items, vendorInfo, shippingCharged, platformRates.current]);

  const shippingCost = vendorGroups.reduce((sum, g) => sum + g.shippingCost, 0);

  // Whole-cart delivery date for the address's pincode: slowest boutique
  // (preparation + courier to the AllBoutiqs warehouse) + 1 working day at the
  // warehouse + courier to the customer. Saved on the order as the date shown.
  const [deliveryEta, setDeliveryEta] = useState<string | null>(null);
  const etaVendorItems = useMemo(() => {
    const map = new Map<string, { productId: string; quantity: number; customised?: boolean }[]>();
    for (const item of items) {
      if (!item.vendorId) continue;
      map.set(item.vendorId, [
        ...(map.get(item.vendorId) ?? []),
        { productId: item.productId, quantity: item.quantity, customised: !!item.customisation },
      ]);
    }
    return map;
  }, [items]);
  useEffect(() => {
    const pin = shippingAddress.pincode;
    if (!/^\d{6}$/.test(pin) || etaVendorItems.size === 0) {
      setDeliveryEta(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchCartDeliveryDate(pin, etaVendorItems).then((date) => {
        if (!cancelled) setDeliveryEta(date);
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [shippingAddress.pincode, etaVendorItems]);

  const calculateDiscount = () => {
    if (!appliedDiscount) return 0;
    if (appliedDiscount.discount_type === "percentage") {
      return (subtotal * appliedDiscount.discount_value) / 100;
    }
    return appliedDiscount.discount_value;
  };

  const discountAmount = calculateDiscount();
  const total = subtotal - discountAmount + shippingCost;
  const belowOnlineMinimum = total > 0 && total < MIN_ONLINE_PAYMENT_AMOUNT;

  // COD is a single payment method for the whole cart, not per-item - if
  // any boutique in the cart has turned it off, or any product's listing
  // doesn't allow it, it can't be offered for this checkout at all. Missing
  // info (not loaded yet) defaults to available rather than flashing the
  // option away and back. The database enforces the same rule on order lines.
  const codOffVendors = vendorGroups
    .filter((g) => g.vendorId && vendorInfo[g.vendorId]?.cod_enabled === false)
    .map((g) => g.vendorName ?? "A boutique");
  const codDisabledByVendor = codOffVendors.length > 0 || codOffProducts.length > 0;
  const codUnavailableReason = codDisabledByVendor
    ? [
        codOffProducts.length > 0 &&
          `Cash on Delivery isn't available for ${codOffProducts.map((n) => `"${n}"`).join(", ")}`,
        codOffVendors.length > 0 && `${codOffVendors.join(", ")} ${codOffVendors.length > 1 ? "don't" : "doesn't"} offer Cash on Delivery`,
      ]
        .filter(Boolean)
        .join(". ") + "."
    : null;

  // Card EMI has a minimum order value per bank plan; cardless EMI and Pay
  // Later are checked by Razorpay itself on the next step.
  const emiAvailable =
    !!emiMethods &&
    !belowOnlineMinimum &&
    (emiMethods.cardless ||
      emiMethods.paylater ||
      (emiMethods.card && (emiMethods.min_amount == null || total >= emiMethods.min_amount)));

  // A discount applied after "Pay Online" was already selected can drop the
  // total below Razorpay's minimum - switch back to COD automatically
  // rather than letting the customer hit the payment failure at submit time.
  useEffect(() => {
    if (belowOnlineMinimum && paymentMethod === "razorpay" && !codDisabledByVendor) {
      setPaymentChoice("cod");
    }
  }, [belowOnlineMinimum, paymentMethod, codDisabledByVendor]);

  // EMI no longer offered (e.g. a discount took the total below the EMI
  // minimum) - fall back to the regular online payment.
  useEffect(() => {
    if (paymentChoice === "emi" && !emiAvailable) setPaymentChoice("razorpay");
  }, [paymentChoice, emiAvailable]);

  // The inverse case - a vendor with COD off is in the cart, but COD is
  // selected. Move to online payment automatically.
  useEffect(() => {
    if (codDisabledByVendor && paymentMethod === "cod") {
      setPaymentChoice("razorpay");
    }
  }, [codDisabledByVendor, paymentMethod]);

  const validateDiscountCode = async () => {
    if (!discountCode.trim()) {
      toast.error("Please enter a discount code");
      return;
    }

    setIsValidatingDiscount(true);
    try {
      const { data, error } = await supabase
        .from("discounts")
        .select("*")
        .eq("code", discountCode.toUpperCase())
        .eq("is_active", true)
        .single();

      if (error || !data) {
        toast.error("Invalid discount code");
        return;
      }

      // Check expiry
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        toast.error("This discount code has expired");
        return;
      }

      // Check start date
      if (data.starts_at && new Date(data.starts_at) > new Date()) {
        toast.error("This discount code is not yet active");
        return;
      }

      // Check min order amount
      if (subtotal < (data.min_order_amount || 0)) {
        toast.error(`Minimum order of ₹${data.min_order_amount} required`);
        return;
      }

      // Check usage limit
      if (data.max_uses && data.used_count >= data.max_uses) {
        toast.error("This discount code has reached its usage limit");
        return;
      }

      setAppliedDiscount({
        id: data.id,
        code: data.code,
        name: data.name,
        discount_type: data.discount_type as "percentage" | "fixed_amount",
        discount_value: data.discount_value,
        min_order_amount: data.min_order_amount || 0,
      });
      setDiscountCode("");
      toast.success(`Discount "${data.name}" applied!`);
    } catch (error) {
      console.error("Error validating discount:", error);
      toast.error("Failed to validate discount code");
    } finally {
      setIsValidatingDiscount(false);
    }
  };

  const removeDiscount = () => {
    setAppliedDiscount(null);
    toast.success("Discount removed");
  };

  const validateForm = () => {
    if (!customerInfo.name.trim()) {
      toast.error("Please enter your name");
      return false;
    }
    if (!customerInfo.email.trim() || !customerInfo.email.includes("@")) {
      toast.error("Please enter a valid email");
      return false;
    }
    if (!customerInfo.phone.trim() || customerInfo.phone.length < 10) {
      toast.error("Please enter a valid phone number");
      return false;
    }
    if (!shippingAddress.address_line1.trim()) {
      toast.error("Please enter your address");
      return false;
    }
    if (!shippingAddress.city.trim()) {
      toast.error("Please enter your city");
      return false;
    }
    if (!normalizeState(shippingAddress.state)) {
      toast.error("Please select your state");
      return false;
    }
    if (!shippingAddress.pincode.trim() || shippingAddress.pincode.length !== 6) {
      toast.error("Please enter a valid 6-digit pincode");
      return false;
    }
    return true;
  };

  const sendConfirmationEmail = async (orderIdToConfirm: string) => {
    try {
      const emailResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-order-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            orderId: orderIdToConfirm,
            type: "confirmation",
          }),
        }
      );

      if (!emailResponse.ok) {
        console.error("Failed to send confirmation email");
      }
    } catch (emailError) {
      console.error("Email sending error:", emailError);
      // Don't fail the order if email fails
    }
  };

  // Separate from the customer's own confirmation email above - tells the
  // vendor(s) and admin a new order needs confirming. Same "never block
  // order placement on this" handling.
  const sendVendorOrderEmail = async (orderIdToNotify: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-vendor-order-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ orderId: orderIdToNotify }),
      });
      if (!response.ok) console.error("Failed to send vendor order email");
    } catch (emailError) {
      console.error("Vendor order email sending error:", emailError);
    }
  };

  // An online checkout the customer didn't pay for isn't an order: once
  // Razorpay confirms nothing came through, the server cancels it quietly and
  // puts the stock back. The cart is untouched, so they can simply try again.
  const releaseUnpaidCheckout = async (unpaidOrderId: string) => {
    const { data } = await invokeEdgeFunction<{ status: string }>("release-unpaid-orders", { order_id: unpaidOrderId });
    return data?.status ?? null;
  };

  const placeOrder = async () => {
    if (!user) {
      toast.error("Please sign in to place your order");
      return;
    }
    if (!validateForm()) return;
    if (items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    setIsPlacingOrder(true);
    // The name typed here becomes the account's name if it has none yet, so
    // nobody is asked for it twice (Part 8, 22). Doesn't hold up the order.
    if (user) {
      void supabase
        .from("profiles")
        .update({ full_name: customerInfo.name.trim() })
        .eq("user_id", user.id)
        .or("full_name.is.null,full_name.eq.")
        .then(({ error }) => error && console.error("Couldn't save the name to the account:", error.message));
    }
    // Set once an online order is saved, so a failure before payment can
    // release it.
    let unpaidOnlineOrderId: string | null = null;
    try {
      // Order id is still generated client-side (not read back after
      // insert) - simplest to keep one insert shape rather than a
      // SELECT-back path that isn't needed for anything else here.
      const newOrderId = crypto.randomUUID();

      // For online payment, create the Razorpay order *before* writing
      // anything of ours, so we can store its id on our own order row.
      let razorpayOrderId: string | null = null;
      let razorpayKeyId: string | null = null;
      if (paymentMethod === "razorpay") {
        if (belowOnlineMinimum) {
          toast.error(`Online payment needs at least ₹${MIN_ONLINE_PAYMENT_AMOUNT} - please choose Cash on Delivery instead`);
          setIsPlacingOrder(false);
          return;
        }
        const { data, error } = await supabase.functions.invoke("create-razorpay-order", {
          body: { receiptId: newOrderId, amount: total },
        });
        if (error || !data?.razorpayOrderId) {
          throw new Error("Could not start online payment. Please try again.");
        }
        razorpayOrderId = data.razorpayOrderId;
        razorpayKeyId = data.keyId;
      }

      // Create the order. payment_status only ever becomes "paid" via
      // verify-razorpay-payment, once a real signature is checked
      // server-side - never set directly by this client-side insert.
      const { error: orderError } = await supabase
        .from("orders")
        .insert({
          id: newOrderId,
          user_id: user.id,
          customer_name: customerInfo.name,
          customer_email: customerInfo.email,
          customer_phone: customerInfo.phone,
          // State saved in the dropdown's spelling - the GST invoice compares it.
          shipping_address: { ...shippingAddress, state: normalizeState(shippingAddress.state) },
          payment_method: paymentMethod,
          payment_status: "pending",
          order_status: "pending",
          subtotal: subtotal,
          shipping_cost: shippingCost,
          total: total,
          discount_code: appliedDiscount?.code ?? null,
          discount_amount: discountAmount,
          notes: notes || null,
          razorpay_order_id: razorpayOrderId,
          estimated_delivery_date: deliveryEta,
        });

      if (orderError) throw orderError;

      // One vendor_orders row per vendor in the cart, so each vendor's own
      // dashboard sees this sale and their payout ledger has a real record
      // to reconcile against. Ids are generated client-side for the same
      // reason as the order id above - nothing here needs to be read back.
      const vendorOrderIdByVendor: Record<string, string> = {};
      const vendorOrderRows = vendorGroups
        .filter((g) => g.vendorId)
        .map((g) => {
          const vendorOrderId = crypto.randomUUID();
          vendorOrderIdByVendor[g.vendorId!] = vendorOrderId;
          const commissionAmount = g.subtotal * (g.commissionRate / 100);
          return {
            id: vendorOrderId,
            order_id: newOrderId,
            vendor_id: g.vendorId!,
            subtotal: g.subtotal,
            shipping_cost: g.shippingCost,
            commission_rate: g.commissionRate,
            commission_amount: commissionAmount,
            net_payable: g.subtotal + g.shippingCost - commissionAmount,
            status: "pending",
          };
        });

      if (vendorOrderRows.length > 0) {
        const { error: vendorOrdersError } = await supabase
          .from("vendor_orders")
          .insert(vendorOrderRows);

        if (vendorOrdersError) throw vendorOrdersError;
      }

      // Snapshotted onto order_items below rather than joined live at
      // return-request time - a vendor changing this after the sale must
      // not retroactively change what the customer is entitled to return,
      // same reasoning price/title/size/color are already snapshotted
      // instead of read live from products.
      const { data: returnabilityRows, error: returnabilityErr } = await supabase
        .from("products")
        .select("id, is_returnable, sku")
        .in("id", [...new Set(items.map((item) => item.productId))]);
      if (returnabilityErr) throw returnabilityErr;
      const productMetaById = new Map((returnabilityRows || []).map((p) => [p.id, p]));

      // SKU is what actually disambiguates two listings that otherwise look
      // identical (same name, size, color, even same photos) - the vendor
      // asked for this explicitly: with several similar products live, there
      // was no way to tell which exact one a given order line refers to.
      // A real variant's own SKU (if the vendor set one) is more specific
      // than the parent product's, so it wins when both exist; a cart item
      // with no matched variant (synthetic "<productId>-default" id, not a
      // real uuid) falls straight back to the product-level SKU.
      const realVariantIds = items.map((item) => item.variantId).filter((id) => UUID_RE.test(id));
      const { data: variantSkuRows } =
        realVariantIds.length > 0
          ? await supabase.from("product_variants").select("id, sku").in("id", realVariantIds)
          : { data: [] as { id: string; sku: string | null }[] };
      const skuByVariantId = new Map((variantSkuRows || []).map((v) => [v.id, v.sku]));

      // Create order items, linked to their vendor and vendor order
      const orderItems = items.map((item) => ({
        order_id: newOrderId,
        product_id: item.productId,
        variant_id: item.variantId,
        product_title: item.productName,
        variant_title: item.variantTitle || null,
        size: item.selectedOptions.find((o) => o.name.toLowerCase() === "size")?.value || null,
        color: item.selectedOptions.find((o) => ["color", "colour"].includes(o.name.toLowerCase()))?.value || null,
        sku:
          (UUID_RE.test(item.variantId) ? skuByVariantId.get(item.variantId) : null) ||
          productMetaById.get(item.productId)?.sku ||
          null,
        quantity: item.quantity,
        price: parseFloat(item.price.amount),
        vendor_id: item.vendorId,
        vendor_order_id: item.vendorId ? vendorOrderIdByVendor[item.vendorId] ?? null : null,
        is_returnable: productMetaById.get(item.productId)?.is_returnable ?? true,
        // Re-priced from the product by the server; a customised piece
        // isn't returnable (enforce_order_item_customisation).
        customisation: item.customisation
          ? {
              options: item.customisation.options.map((o) => ({ id: o.id })),
              custom_size: item.customisation.custom_size
                ? { measurements: item.customisation.custom_size.measurements }
                : null,
              note: item.customisation.note,
              photo_path: item.customisation.photo_path,
            }
          : null,
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) {
        await supabase.rpc("cancel_pending_order", { _order_id: newOrderId });
        throw itemsError;
      }

      // Decrement real inventory per line item. Unlike increment_discount_usage
      // below, a failure here must stop the order rather than being logged and
      // ignored - letting checkout continue after a stock call fails would
      // mean charging for something that was never actually reserved.
      for (const item of items) {
        // Cart items without a real matched variant (product has no
        // variants, or came from a quick-add that never selected one) carry
        // a synthetic id like `${productId}-default` - not a uuid. Only pass
        // through a genuine variant id; adjust_stock treats null as "adjust
        // this product's own aggregate stock_quantity directly".
        const variantId = UUID_RE.test(item.variantId) ? item.variantId : null;

        const { error: stockError } = await supabase.rpc("adjust_stock", {
          _product_id: item.productId,
          _variant_id: variantId,
          _delta: -item.quantity,
          _movement_type: "sale",
          _reason: `Order ${newOrderId}`,
          _reference_order_id: newOrderId,
        } as any);

        if (stockError) {
          // orders has no client-writable UPDATE policy at all (by design -
          // see verify-razorpay-payment), so cancelling goes through the
          // same kind of narrowly-scoped RPC as the stock adjustment itself.
          await supabase.rpc("cancel_pending_order", { _order_id: newOrderId });
          throw new Error(
            stockError.message.includes("Insufficient stock")
              ? stockError.message
              : `${item.productName} is no longer available in the requested quantity.`
          );
        }
      }

      // Create payment record - "paid" is set later by verify-razorpay-payment
      const { error: paymentError } = await supabase
        .from("payments")
        .insert({
          order_id: newOrderId,
          amount: total,
          payment_method: paymentMethod,
          payment_status: "pending",
        });

      if (paymentError) throw paymentError;
      if (paymentMethod === "razorpay") unpaidOnlineOrderId = newOrderId;

      // Save this address for next time (skipped if it's an unedited reuse
      // of one already saved) - independent of payment method/outcome,
      // since the shipping details themselves are already locked in.
      await saveAddressIfNew();

      // Increment discount usage if applied
      if (appliedDiscount) {
        const { error: discountError } = await supabase.rpc("increment_discount_usage", {
          _discount_id: appliedDiscount.id,
        });
        if (discountError) {
          console.error("Error incrementing discount usage:", discountError);
        }
      }

      if (paymentMethod === "cod") {
        await sendConfirmationEmail(newOrderId);
        await sendVendorOrderEmail(newOrderId);
        clearCart();
        setOrderId(newOrderId);
        setOrderPlaced(true);
        toast.success("Order placed successfully!");
        setIsPlacingOrder(false);
        return;
      }

      // Online payment: the order above is saved as "pending" already, so
      // nothing is lost if the customer abandons the widget. Everything
      // past this point runs asynchronously in Razorpay's callbacks, not
      // in this try block, so isPlacingOrder is reset inside each branch
      // rather than in a finally here.
      await openRazorpayCheckout({
        key: razorpayKeyId!,
        amount: Math.round(total * 100),
        currency: "INR",
        order_id: razorpayOrderId!,
        name: "AllBoutiqs",
        description: `Order ${newOrderId.slice(0, 8)}`,
        prefill: {
          name: customerInfo.name,
          email: customerInfo.email,
          contact: customerInfo.phone,
        },
        theme: { color: "#ec1f63" },
        ...(paymentChoice === "emi" && emiMethods
          ? {
              config: {
                display: {
                  blocks: {
                    emi: {
                      name: "Pay in EMI",
                      instruments: [
                        ...(emiMethods.card ? [{ method: "emi" }] : []),
                        ...(emiMethods.cardless ? [{ method: "cardless_emi" }] : []),
                        ...(emiMethods.paylater ? [{ method: "paylater" }] : []),
                      ],
                    },
                  },
                  sequence: ["block.emi"],
                  preferences: { show_default_blocks: false },
                },
              },
            }
          : {}),
        handler: async (response) => {
          const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
            "verify-razorpay-payment",
            {
              body: {
                orderId: newOrderId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
            }
          );

          if (verifyError || !verifyData?.verified) {
            toast.error(
              "Payment could not be verified. If you were charged, contact support with your order reference."
            );
            setIsPlacingOrder(false);
            return;
          }

          await sendConfirmationEmail(newOrderId);
          await sendVendorOrderEmail(newOrderId);
          clearCart();
          setOrderId(newOrderId);
          setOrderPlaced(true);
          toast.success("Payment successful!");
          setIsPlacingOrder(false);
        },
        modal: {
          ondismiss: async () => {
            const status = await releaseUnpaidCheckout(newOrderId);
            if (status === "paid") {
              // Razorpay took the payment after all (the window closed first).
              await sendConfirmationEmail(newOrderId);
              await sendVendorOrderEmail(newOrderId);
              clearCart();
              setOrderId(newOrderId);
              setOrderPlaced(true);
              toast.success("Payment successful!");
            } else if (status === "processing") {
              toast.info("Your payment is still being confirmed by your bank. We'll place the order as soon as it goes through.");
            } else {
              toast.error("Payment not completed, so no order was placed. Your cart is saved - you can try again.");
            }
            setIsPlacingOrder(false);
          },
        },
      });
    } catch (error: any) {
      console.error("Error placing order:", error);
      // The payment window never opened - don't leave the saved order behind.
      if (unpaidOnlineOrderId) await releaseUnpaidCheckout(unpaidOnlineOrderId);
      toast.error(error.message || "Failed to place order");
      setIsPlacingOrder(false);
    }
  };

  if (orderPlaced) {
    return (
      <CheckoutShell step={2}>
        <div className="store-container py-16 md:py-24">
          <div className="mx-auto max-w-lg text-center">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-gold/40 bg-ivory">
              <CheckCircle className="h-9 w-9 text-gold" strokeWidth={1.5} />
            </span>
            <p className="eyebrow mt-8 text-gold">Thank you</p>
            <h1 className="mt-3 font-serif text-4xl leading-tight md:text-5xl">
              Your order is <em className="font-normal text-primary">placed</em>
            </h1>
            <p className="mt-4 text-muted-foreground">
              Thank you for your order. We'll send you a confirmation email shortly.
            </p>
            <p className="mt-6 inline-flex items-center gap-2 border border-border bg-ivory px-4 py-2 text-sm">
              Order ID <span className="font-mono font-medium">{orderId?.slice(0, 8)}</span>
            </p>
            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/orders"
                className="inline-flex h-12 items-center justify-center border border-foreground px-8 text-[11px] font-medium uppercase tracking-[0.22em] hover:bg-foreground hover:text-background"
              >
                Track your order
              </Link>
              <Link
                to="/"
                className="inline-flex h-12 items-center justify-center bg-primary px-8 text-[11px] font-medium uppercase tracking-[0.22em] text-primary-foreground hover:bg-maroon-deep"
              >
                Continue shopping
              </Link>
            </div>
          </div>
        </div>
      </CheckoutShell>
    );
  }

  if (authLoading) {
    return (
      <CheckoutShell step={1}>
        <div className="flex justify-center py-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </CheckoutShell>
    );
  }

  if (!user) {
    return (
      <CheckoutShell step={1}>
        <div className="store-container py-14 md:py-20">
          <div className="mx-auto max-w-md border border-border bg-ivory p-8 md:p-10">
            <div className="mb-8 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gold/40 bg-background">
                <LogIn className="h-6 w-6 text-gold" strokeWidth={1.5} />
              </span>
              <h1 className="mt-6 font-serif text-3xl leading-tight">Sign in to complete your order</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Create an account or sign in to check out - we'll save your
                details so you don't have to re-enter them next time.
              </p>
            </div>
            <InlineSignInForm />
            <button
              type="button"
              className="mt-3 h-12 w-full border border-foreground/20 text-[11px] font-medium uppercase tracking-[0.22em] hover:border-foreground"
              onClick={() => navigate("/")}
            >
              Continue shopping
            </button>
          </div>
        </div>
      </CheckoutShell>
    );
  }

  if (items.length === 0) {
    return (
      <CheckoutShell step={0}>
        <div className="store-container py-20 text-center md:py-28">
          <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-gold/40 bg-ivory">
            <ShoppingBag className="h-8 w-8 text-gold" strokeWidth={1.5} />
          </span>
          <h1 className="mt-8 font-serif text-4xl">Your cart is empty</h1>
          <p className="mx-auto mt-3 max-w-sm text-muted-foreground">
            Add a few pieces to your cart to check out.
          </p>
          <Link
            to="/category/all"
            className="mt-8 inline-flex h-12 items-center bg-primary px-10 text-[11px] font-medium uppercase tracking-[0.22em] text-primary-foreground hover:bg-maroon-deep"
          >
            Start shopping
          </Link>
        </div>
      </CheckoutShell>
    );
  }

  const itemCount = items.reduce((n, item) => n + item.quantity, 0);
  const placeOrderLabel = isPlacingOrder
    ? paymentMethod === "razorpay"
      ? "Processing payment…"
      : "Placing order…"
    : paymentMethod === "razorpay"
      ? `Pay ₹${formatMoney(total)}`
      : `Place order · ₹${formatMoney(total)}`;

  return (
    <CheckoutShell
      step={1}
      bottomBar={
        // Phones: total + place order, always in reach
        <div className="store-container flex items-center gap-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Total</p>
            <p className="font-serif text-xl leading-tight">₹{formatMoney(total)}</p>
          </div>
          <button
            type="button"
            onClick={placeOrder}
            disabled={isPlacingOrder}
            className="flex h-12 shrink-0 items-center gap-2 bg-primary px-6 text-[11px] font-medium uppercase tracking-[0.2em] text-primary-foreground disabled:opacity-70"
          >
            {isPlacingOrder && <Loader2 className="h-4 w-4 animate-spin" />}
            {isPlacingOrder ? "Please wait…" : paymentMethod === "razorpay" ? "Pay now" : "Place order"}
          </button>
        </div>
      }
    >
      <div className="store-container pb-16 pt-8 md:pt-12 lg:pb-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16 xl:gap-20">
          {/* Left Column - Forms */}
          <div className="min-w-0 space-y-12">
            {/* Customer Information */}
            <CheckoutSection number={1} title="Contact">
              <div className="space-y-5">
                <Field label="Full name" htmlFor="name" required>
                  <Input
                    id="name"
                    placeholder="Enter your full name"
                    autoComplete="name"
                    className={fieldClass}
                    value={customerInfo.name}
                    onChange={(e) =>
                      setCustomerInfo((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Email" htmlFor="email" required>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      autoComplete="email"
                      className={fieldClass}
                      value={customerInfo.email}
                      onChange={(e) =>
                        setCustomerInfo((prev) => ({ ...prev, email: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Phone number" htmlFor="phone" required>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="10-digit mobile number"
                      autoComplete="tel"
                      className={fieldClass}
                      value={customerInfo.phone}
                      onChange={(e) =>
                        setCustomerInfo((prev) => ({ ...prev, phone: e.target.value }))
                      }
                    />
                  </Field>
                </div>
              </div>
            </CheckoutSection>

            {/* Shipping Address */}
            <CheckoutSection number={2} title="Delivery address">
              {/* Saved Addresses */}
              {savedAddresses.length > 0 && (
                <RadioGroup value={selectedAddressId} onValueChange={handleAddressPick} className="mb-8 grid gap-3 sm:grid-cols-2">
                  {savedAddresses.map((address) => (
                    <Label
                      key={address.id}
                      htmlFor={`addr-${address.id}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 border p-4 font-normal transition-colors",
                        selectedAddressId === address.id ? "border-foreground bg-ivory" : "border-border hover:border-foreground/40",
                      )}
                    >
                      <RadioGroupItem value={address.id} id={`addr-${address.id}`} className="mt-0.5" />
                      <div className="min-w-0 text-sm">
                        <p className="font-medium">
                          {address.full_name}
                          {address.label && (
                            <span className="ml-2 border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                              {address.label}
                            </span>
                          )}
                        </p>
                        <p className="mt-1 leading-relaxed text-muted-foreground">
                          {address.address_line_1}, {address.city}, {address.state} - {address.pincode}
                        </p>
                      </div>
                    </Label>
                  ))}
                  <Label
                    htmlFor="addr-new"
                    className={cn(
                      "flex cursor-pointer items-center gap-3 border border-dashed p-4 font-normal transition-colors",
                      selectedAddressId === "new" ? "border-foreground bg-ivory" : "border-foreground/25 hover:border-foreground/50",
                    )}
                  >
                    <RadioGroupItem value="new" id="addr-new" />
                    <span className="inline-flex items-center gap-2 text-sm font-medium">
                      <MapPin className="h-4 w-4 text-gold" /> Deliver to a new address
                    </span>
                  </Label>
                </RadioGroup>
              )}

              <div className="space-y-5">
                <Field label="Address line 1" htmlFor="address1" required>
                  <Input
                    id="address1"
                    placeholder="House/Flat number, Street name"
                    autoComplete="address-line1"
                    className={fieldClass}
                    value={shippingAddress.address_line1}
                    onChange={(e) =>
                      setShippingAddress((prev) => ({
                        ...prev,
                        address_line1: e.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Address line 2" htmlFor="address2">
                  <Input
                    id="address2"
                    placeholder="Landmark, Area (Optional)"
                    autoComplete="address-line2"
                    className={fieldClass}
                    value={shippingAddress.address_line2}
                    onChange={(e) =>
                      setShippingAddress((prev) => ({
                        ...prev,
                        address_line2: e.target.value,
                      }))
                    }
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Pincode" htmlFor="pincode" required>
                    <Input
                      id="pincode"
                      placeholder="6-digit pincode"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      maxLength={6}
                      className={fieldClass}
                      value={shippingAddress.pincode}
                      onChange={(e) =>
                        setShippingAddress((prev) => ({
                          ...prev,
                          pincode: e.target.value.replace(/\D/g, ""),
                        }))
                      }
                    />
                  </Field>
                  <Field label="Country" htmlFor="country">
                    <Input
                      id="country"
                      className={fieldClass}
                      value={shippingAddress.country}
                      disabled
                    />
                  </Field>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="City" htmlFor="city" required>
                    <Input
                      id="city"
                      placeholder="City"
                      autoComplete="address-level2"
                      className={fieldClass}
                      value={shippingAddress.city}
                      onChange={(e) =>
                        setShippingAddress((prev) => ({ ...prev, city: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="State" htmlFor="state" required>
                    <StateSelect
                      id="state"
                      className={fieldClass}
                      value={shippingAddress.state}
                      onChange={(state) => setShippingAddress((prev) => ({ ...prev, state }))}
                    />
                  </Field>
                </div>
              </div>
            </CheckoutSection>

            {/* Payment Method */}
            <CheckoutSection number={3} title="Payment">
              <RadioGroup
                value={paymentChoice}
                onValueChange={(value) => setPaymentChoice(value as "cod" | "razorpay" | "emi")}
                className="space-y-3"
              >
                {!codDisabledByVendor && (
                  <PaymentOption
                    value="cod"
                    selected={paymentChoice === "cod"}
                    icon={Banknote}
                    title="Cash on Delivery"
                    text="Pay when your order arrives"
                  />
                )}
                {codUnavailableReason && (
                  <p className={cn("text-sm", belowOnlineMinimum ? "text-destructive" : "text-muted-foreground")}>
                    {codUnavailableReason}{" "}
                    {belowOnlineMinimum
                      ? `This order is also below the ₹${MIN_ONLINE_PAYMENT_AMOUNT} minimum for online payment - add another item to check out.`
                      : "Please pay online."}
                  </p>
                )}
                <PaymentOption
                  value="razorpay"
                  selected={paymentChoice === "razorpay"}
                  disabled={belowOnlineMinimum}
                  icon={CreditCard}
                  title="Pay online"
                  text={
                    belowOnlineMinimum
                      ? `Not available below ₹${MIN_ONLINE_PAYMENT_AMOUNT} - use Cash on Delivery`
                      : "Card, UPI or netbanking — pick your method at checkout"
                  }
                  extra={
                    !belowOnlineMinimum && (
                      <span className="hidden gap-1.5 sm:flex">
                        {["UPI", "Cards", "Netbanking"].map((m) => (
                          <span key={m} className="border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                            {m}
                          </span>
                        ))}
                      </span>
                    )
                  }
                />
                {emiAvailable && (
                  <PaymentOption
                    value="emi"
                    selected={paymentChoice === "emi"}
                    icon={CalendarClock}
                    title="Pay in EMI"
                    text={`${[
                      emiMethods?.card && "Credit/debit card EMI",
                      emiMethods?.cardless && "cardless EMI",
                      emiMethods?.paylater && "Pay Later",
                    ]
                      .filter(Boolean)
                      .join(", ")} - choose your plan and tenure on the next step`}
                  />
                )}
              </RadioGroup>
            </CheckoutSection>

            {/* Order Notes */}
            <CheckoutSection number={4} title="Order notes" hint="Optional">
              <Textarea
                placeholder="Any special instructions for your order..."
                className="rounded-none border-foreground/20 bg-background focus-visible:border-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </CheckoutSection>
          </div>

          {/* Right Column - Order Summary */}
          <aside className="min-w-0">
            <div className="border border-border bg-ivory lg:sticky lg:top-6">
              <div className="flex items-baseline justify-between border-b border-border px-6 py-5">
                <h2 className="font-serif text-2xl">Order summary</h2>
                <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {itemCount} {itemCount === 1 ? "piece" : "pieces"}
                </span>
              </div>

              <div className="space-y-6 p-6">
                {buyNow && cart.items.length > 0 && (
                  <p className="border border-gold/40 bg-background px-3 py-2 text-xs text-muted-foreground">
                    Buying only this item - the {cart.items.length} other {cart.items.length === 1 ? "item" : "items"} in your
                    cart {cart.items.length === 1 ? "stays" : "stay"} saved for later.
                  </p>
                )}
                {/* Cart Items */}
                <ul className="no-scrollbar max-h-80 space-y-5 overflow-y-auto">
                  {items.map((item) => (
                    <li key={cartLineKey(item)} className="flex gap-4">
                      <div className="relative h-24 w-[72px] shrink-0 overflow-hidden bg-background">
                        <SmartImage
                          src={item.productImage}
                          alt={item.productName}
                          width={160}
                          className="h-full w-full object-cover"
                          fallback={<BrandPlaceholder className="[&_img]:h-5" />}
                        />
                        <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[10px] text-background">
                          {item.quantity}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link to={`/product/${item.productId}`} className="line-clamp-2 text-sm hover:text-primary">
                          {item.productName}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.variantTitle && item.variantTitle !== "Default" ? `${item.variantTitle} · ` : ""}Qty: {item.quantity}
                        </p>
                        {item.customisation && (
                          <CustomisationDetails customisation={item.customisation} className="my-1.5" />
                        )}
                        <p className="mt-1 text-sm font-medium">
                          ₹{formatMoney(parseFloat(item.price.amount) * item.quantity)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Discount Code Section */}
                <div className="border-t border-border pt-6">
                  <p className="mb-3 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.2em]">
                    <Tag className="h-3.5 w-3.5 text-gold" />
                    Coupon or gift card
                  </p>

                  {appliedDiscount ? (
                    <div className="border border-primary/25 bg-background p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-medium text-primary">{appliedDiscount.code}</span>
                          <span className="bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-primary">
                            {appliedDiscount.discount_type === "percentage"
                              ? `${appliedDiscount.discount_value}% off`
                              : `₹${appliedDiscount.discount_value} off`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={removeDiscount}
                          className="p-1 text-muted-foreground hover:text-destructive"
                          aria-label="Remove coupon"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="mt-1.5 text-xs text-primary/80">
                        You're saving ₹{formatMoney(discountAmount)} on this order!
                      </p>
                    </div>
                  ) : (
                    <div className="flex h-12 border border-foreground/20 bg-background focus-within:border-foreground">
                      <input
                        aria-label="Coupon or gift card code"
                        placeholder="Enter code"
                        value={discountCode}
                        onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === "Enter" && validateDiscountCode()}
                        className="min-w-0 flex-1 bg-transparent px-4 text-sm uppercase tracking-[0.1em] outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground"
                      />
                      <button
                        type="button"
                        onClick={validateDiscountCode}
                        disabled={isValidatingDiscount || !discountCode.trim()}
                        className="px-5 text-[11px] font-medium uppercase tracking-[0.2em] text-primary disabled:text-muted-foreground"
                      >
                        {isValidatingDiscount ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Price Breakdown */}
                <dl className="space-y-2.5 border-t border-border pt-6 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Subtotal</dt>
                    <dd>₹{formatMoney(subtotal)}</dd>
                  </div>
                  {appliedDiscount && (
                    <div className="flex justify-between text-primary">
                      <dt>Discount</dt>
                      <dd>-₹{formatMoney(discountAmount)}</dd>
                    </div>
                  )}
                  {vendorGroups.map((group) => (
                    <div className="flex justify-between gap-4" key={group.vendorId ?? "platform"}>
                      <dt className="text-muted-foreground">
                        Shipping{group.vendorName ? ` — ${group.vendorName}` : ""}
                      </dt>
                      <dd className="shrink-0">
                        {group.shippingCost === 0 ? (
                          <FreeDeliveryBadge />
                        ) : (
                          `₹${group.shippingCost}`
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="flex items-baseline justify-between border-t border-foreground/80 pt-5">
                  <span className="text-[12px] font-medium uppercase tracking-[0.2em]">Total</span>
                  <span className="font-serif text-3xl">₹{formatMoney(total)}</span>
                </div>
                <p className="-mt-4 text-right text-xs text-muted-foreground">Inclusive of all taxes</p>

                {deliveryEta && (
                  <p className="flex items-center gap-2 border border-emerald-700/20 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                    <Truck className="h-4 w-4 shrink-0" />
                    Estimated delivery by {deliveryDateLabel(deliveryEta)}
                  </p>
                )}

                <button
                  type="button"
                  onClick={placeOrder}
                  disabled={isPlacingOrder}
                  className="flex h-14 w-full items-center justify-center gap-2 bg-primary text-[12px] font-medium uppercase tracking-[0.22em] text-primary-foreground transition-colors hover:bg-maroon-deep disabled:opacity-70"
                >
                  {isPlacingOrder && <Loader2 className="h-4 w-4 animate-spin" />}
                  {placeOrderLabel}
                </button>

                {vendorGroups.length === 1 && vendorGroups[0].shippingCost > 0 && (() => {
                  const info = vendorGroups[0].vendorId ? vendorInfo[vendorGroups[0].vendorId] : null;
                  const threshold = info ? info.free_shipping_threshold : PLATFORM_SHIPPING.threshold;
                  if (threshold === null) return null;
                  return (
                    <p className="text-center text-xs text-muted-foreground">
                      Add ₹{formatMoney(threshold - vendorGroups[0].subtotal)} more for Free Delivery
                    </p>
                  );
                })()}

                <ul className="grid grid-cols-3 gap-2 border-t border-border pt-5 text-center text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <li className="flex flex-col items-center gap-1.5">
                    <Lock className="h-4 w-4 text-gold" strokeWidth={1.5} />
                    Secure payment
                  </li>
                  <li className="flex flex-col items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-gold" strokeWidth={1.5} />
                    Verified boutiques
                  </li>
                  <li className="flex flex-col items-center gap-1.5">
                    <Package className="h-4 w-4 text-gold" strokeWidth={1.5} />
                    Quality-checked
                  </li>
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </div>

    </CheckoutShell>
  );
}

const fieldClass =
  "h-12 rounded-none border-foreground/20 bg-background focus:ring-0 focus:ring-offset-0 focus-visible:border-foreground focus-visible:ring-0 focus-visible:ring-offset-0";

function CheckoutSection({ number, title, hint, children }: { number: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-6 flex items-center gap-4 border-b border-border pb-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/50 font-serif text-sm text-gold">
          {number}
        </span>
        <h2 className="font-serif text-2xl md:text-[1.75rem]">{title}</h2>
        {hint && <span className="ml-auto text-xs uppercase tracking-[0.16em] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, htmlFor, required, children }: { label: string; htmlFor: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
        {required && <span className="text-primary"> *</span>}
      </Label>
      {children}
    </div>
  );
}

function PaymentOption({
  value,
  selected,
  disabled,
  icon: Icon,
  title,
  text,
  extra,
}: {
  value: string;
  selected: boolean;
  disabled?: boolean;
  icon: LucideIcon;
  title: string;
  text: string;
  extra?: React.ReactNode;
}) {
  return (
    <Label
      htmlFor={value}
      className={cn(
        "flex items-center gap-4 border p-4 font-normal transition-colors md:p-5",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        selected ? "border-foreground bg-ivory" : "border-border hover:border-foreground/40",
      )}
    >
      <RadioGroupItem value={value} id={value} disabled={disabled} />
      <Icon className="h-5 w-5 shrink-0 text-gold" strokeWidth={1.5} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{text}</span>
      </span>
      {extra}
    </Label>
  );
}
