import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingBag,
  Truck,
  CreditCard,
  Banknote,
  Tag,
  X,
  Loader2,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";
import { useCartStore, CartItem } from "@/stores/cartStore";
import { openRazorpayCheckout } from "@/lib/razorpay";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";

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
  const { items, getTotalPrice, clearCart } = useCartStore();
  const subtotal = getTotalPrice();

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

  const [paymentMethod, setPaymentMethod] = useState<"cod" | "razorpay">("cod");
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<Discount | null>(null);
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  // Each vendor sets their own shipping rate/threshold, so the cart is
  // grouped by vendor and shipping is computed per group. Items with no
  // vendor (legacy/platform-owned products) fall back to a flat default.
  const [vendorInfo, setVendorInfo] = useState<Record<string, VendorShippingInfo>>({});

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
      .select("id, name, shipping_flat_rate, free_shipping_threshold, commission_rate")
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
        const shipping = groupSubtotal >= PLATFORM_SHIPPING.threshold ? 0 : PLATFORM_SHIPPING.flatRate;
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
      const shipping = threshold !== null && groupSubtotal >= threshold ? 0 : flatRate;

      return {
        vendorId: key,
        vendorName: info?.name ?? "Store",
        commissionRate: info?.commission_rate ?? 10,
        items: groupItems,
        subtotal: groupSubtotal,
        shippingCost: shipping,
      };
    });
  }, [items, vendorInfo]);

  const shippingCost = vendorGroups.reduce((sum, g) => sum + g.shippingCost, 0);

  const calculateDiscount = () => {
    if (!appliedDiscount) return 0;
    if (appliedDiscount.discount_type === "percentage") {
      return (subtotal * appliedDiscount.discount_value) / 100;
    }
    return appliedDiscount.discount_value;
  };

  const discountAmount = calculateDiscount();
  const total = subtotal - discountAmount + shippingCost;

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
    if (!shippingAddress.state.trim()) {
      toast.error("Please enter your state");
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

  const placeOrder = async () => {
    if (!validateForm()) return;
    if (items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    setIsPlacingOrder(true);
    try {
      // Get current user if logged in
      const { data: { user } } = await supabase.auth.getUser();

      // Generate the order id client-side: guests have no session for
      // Postgres RLS to scope a SELECT-back to, so we can't safely grant
      // anon broad read access on orders just to fetch the row we
      // inserted (that would expose every guest's name/email/phone to
      // anyone). We already know every field we're inserting, so there's
      // nothing worth reading back - just supply the id ourselves.
      const newOrderId = crypto.randomUUID();

      // For online payment, create the Razorpay order *before* writing
      // anything of ours, so we can store its id on our own order row.
      let razorpayOrderId: string | null = null;
      let razorpayKeyId: string | null = null;
      if (paymentMethod === "razorpay") {
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
          user_id: user?.id || null,
          customer_name: customerInfo.name,
          customer_email: customerInfo.email,
          customer_phone: customerInfo.phone,
          shipping_address: shippingAddress,
          payment_method: paymentMethod,
          payment_status: "pending",
          order_status: "pending",
          subtotal: subtotal,
          shipping_cost: shippingCost,
          total: total,
          notes: notes || null,
          razorpay_order_id: razorpayOrderId,
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

      // Create order items, linked to their vendor and vendor order
      const orderItems = items.map((item) => ({
        order_id: newOrderId,
        product_id: item.productId,
        variant_id: item.variantId,
        product_title: item.productName,
        variant_title: item.variantTitle || null,
        size: item.selectedOptions.find((o) => o.name.toLowerCase() === "size")?.value || null,
        color: item.selectedOptions.find((o) => o.name.toLowerCase() === "color")?.value || null,
        quantity: item.quantity,
        price: parseFloat(item.price.amount),
        vendor_id: item.vendorId,
        vendor_order_id: item.vendorId ? vendorOrderIdByVendor[item.vendorId] ?? null : null,
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) throw itemsError;

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
        name: "Isha Fashion Hub",
        description: `Order ${newOrderId.slice(0, 8)}`,
        prefill: {
          name: customerInfo.name,
          email: customerInfo.email,
          contact: customerInfo.phone,
        },
        theme: { color: "#ec1f63" },
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
          clearCart();
          setOrderId(newOrderId);
          setOrderPlaced(true);
          toast.success("Payment successful!");
          setIsPlacingOrder(false);
        },
        modal: {
          ondismiss: () => {
            toast.error("Payment cancelled. Your order is saved - you can try paying again.");
            setIsPlacingOrder(false);
          },
        },
      });
    } catch (error: any) {
      console.error("Error placing order:", error);
      toast.error(error.message || "Failed to place order");
      setIsPlacingOrder(false);
    }
  };

  if (orderPlaced) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-16">
          <div className="max-w-md mx-auto text-center">
            <CheckCircle className="h-20 w-20 text-green-500 mx-auto mb-6" />
            <h1 className="text-3xl font-serif font-bold mb-4">Order Placed!</h1>
            <p className="text-muted-foreground mb-2">
              Thank you for your order. We'll send you a confirmation email shortly.
            </p>
            <p className="text-sm text-muted-foreground mb-8">
              Order ID: <span className="font-mono font-medium">{orderId?.slice(0, 8)}</span>
            </p>
            <div className="flex flex-col gap-3">
              <Link to="/">
                <Button className="w-full">Continue Shopping</Button>
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-16">
          <div className="max-w-md mx-auto text-center">
            <ShoppingBag className="h-20 w-20 text-muted-foreground mx-auto mb-6" />
            <h1 className="text-3xl font-serif font-bold mb-4">Your cart is empty</h1>
            <p className="text-muted-foreground mb-8">
              Add some items to your cart to checkout.
            </p>
            <Link to="/">
              <Button>Start Shopping</Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="h-4 w-4" />
          Continue Shopping
        </Link>

        <h1 className="text-3xl md:text-4xl font-serif font-bold mb-8">Checkout</h1>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Forms */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5" />
                  Customer Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    placeholder="Enter your full name"
                    value={customerInfo.name}
                    onChange={(e) =>
                      setCustomerInfo((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={customerInfo.email}
                      onChange={(e) =>
                        setCustomerInfo((prev) => ({ ...prev, email: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="10-digit mobile number"
                      value={customerInfo.phone}
                      onChange={(e) =>
                        setCustomerInfo((prev) => ({ ...prev, phone: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Shipping Address */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Shipping Address
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="address1">Address Line 1 *</Label>
                  <Input
                    id="address1"
                    placeholder="House/Flat number, Street name"
                    value={shippingAddress.address_line1}
                    onChange={(e) =>
                      setShippingAddress((prev) => ({
                        ...prev,
                        address_line1: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address2">Address Line 2</Label>
                  <Input
                    id="address2"
                    placeholder="Landmark, Area (Optional)"
                    value={shippingAddress.address_line2}
                    onChange={(e) =>
                      setShippingAddress((prev) => ({
                        ...prev,
                        address_line2: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      placeholder="City"
                      value={shippingAddress.city}
                      onChange={(e) =>
                        setShippingAddress((prev) => ({ ...prev, city: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State *</Label>
                    <Input
                      id="state"
                      placeholder="State"
                      value={shippingAddress.state}
                      onChange={(e) =>
                        setShippingAddress((prev) => ({ ...prev, state: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pincode">Pincode *</Label>
                    <Input
                      id="pincode"
                      placeholder="6-digit pincode"
                      maxLength={6}
                      value={shippingAddress.pincode}
                      onChange={(e) =>
                        setShippingAddress((prev) => ({
                          ...prev,
                          pincode: e.target.value.replace(/\D/g, ""),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={shippingAddress.country}
                      disabled
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Method */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Method
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(value) => setPaymentMethod(value as "cod" | "razorpay")}
                  className="space-y-3"
                >
                  <div className="flex items-center space-x-3 p-4 border border-border rounded-lg cursor-pointer hover:bg-muted/50">
                    <RadioGroupItem value="cod" id="cod" />
                    <Label
                      htmlFor="cod"
                      className="flex items-center gap-3 cursor-pointer flex-1"
                    >
                      <Banknote className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">Cash on Delivery</p>
                        <p className="text-sm text-muted-foreground">
                          Pay when your order arrives
                        </p>
                      </div>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3 p-4 border border-border rounded-lg cursor-pointer hover:bg-muted/50">
                    <RadioGroupItem value="razorpay" id="razorpay" />
                    <Label
                      htmlFor="razorpay"
                      className="flex items-center gap-3 cursor-pointer flex-1"
                    >
                      <CreditCard className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">Pay Online</p>
                        <p className="text-sm text-muted-foreground">
                          Card, UPI or netbanking &mdash; pick your method at checkout
                        </p>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            {/* Order Notes */}
            <Card>
              <CardHeader>
                <CardTitle>Order Notes (Optional)</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Any special instructions for your order..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Order Summary */}
          <div className="space-y-6">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Cart Items */}
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {items.map((item) => (
                    <div key={item.variantId} className="flex gap-3">
                      <div className="w-16 h-16 bg-muted rounded-md overflow-hidden flex-shrink-0">
                        {item.productImage && (
                          <img
                            src={item.productImage}
                            alt={item.productName}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">
                          {item.productName}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Qty: {item.quantity}
                        </p>
                        <p className="text-sm font-semibold">
                          ₹{(parseFloat(item.price.amount) * item.quantity).toFixed(0)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* Discount Code Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-medium">Apply Coupon or Gift Card</Label>
                  </div>
                  
                  {appliedDiscount ? (
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4 text-primary" />
                          <div>
                            <span className="font-semibold text-primary">
                              {appliedDiscount.code}
                            </span>
                            <Badge variant="secondary" className="ml-2 text-xs">
                              {appliedDiscount.discount_type === "percentage"
                                ? `${appliedDiscount.discount_value}% OFF`
                                : `₹${appliedDiscount.discount_value} OFF`}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={removeDiscount}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-primary/70 mt-1">
                        You're saving ₹{discountAmount.toFixed(0)} on this order!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter discount code"
                          value={discountCode}
                          onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                          onKeyDown={(e) => e.key === "Enter" && validateDiscountCode()}
                          className="flex-1"
                        />
                        <Button
                          variant="secondary"
                          onClick={validateDiscountCode}
                          disabled={isValidatingDiscount || !discountCode.trim()}
                        >
                          {isValidatingDiscount ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Apply"
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Have a coupon code or gift card? Enter it above to save on your order.
                      </p>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Price Breakdown */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>₹{subtotal.toFixed(0)}</span>
                  </div>
                  {appliedDiscount && (
                    <div className="flex justify-between text-primary">
                      <span>Discount</span>
                      <span>-₹{discountAmount.toFixed(0)}</span>
                    </div>
                  )}
                  {vendorGroups.map((group) => (
                    <div className="flex justify-between" key={group.vendorId ?? "platform"}>
                      <span className="text-muted-foreground">
                        Shipping{group.vendorName ? ` — ${group.vendorName}` : ""}
                      </span>
                      <span>
                        {group.shippingCost === 0 ? (
                          <span className="text-primary font-medium">FREE</span>
                        ) : (
                          `₹${group.shippingCost}`
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-primary">₹{total.toFixed(0)}</span>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={placeOrder}
                  disabled={isPlacingOrder}
                >
                  {isPlacingOrder ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {paymentMethod === "razorpay" ? "Processing payment..." : "Placing Order..."}
                    </>
                  ) : paymentMethod === "razorpay" ? (
                    `Pay ₹${total.toFixed(0)}`
                  ) : (
                    `Place Order • ₹${total.toFixed(0)}`
                  )}
                </Button>

                {vendorGroups.length === 1 && vendorGroups[0].shippingCost > 0 && (() => {
                  const info = vendorGroups[0].vendorId ? vendorInfo[vendorGroups[0].vendorId] : null;
                  const threshold = info ? info.free_shipping_threshold : PLATFORM_SHIPPING.threshold;
                  if (threshold === null) return null;
                  return (
                    <p className="text-xs text-center text-muted-foreground">
                      Add ₹{(threshold - vendorGroups[0].subtotal).toFixed(0)} more for free shipping
                    </p>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
