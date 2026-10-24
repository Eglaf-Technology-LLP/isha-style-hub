import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ArrowRight, Lock, Minus, Plus, ShieldCheck, ShoppingBag, X } from "lucide-react";
import { cartLineKey, useCartStore } from "@/stores/cartStore";
import { useUiStore } from "@/stores/uiStore";
import { customisationPrice, customisationSummary, inr } from "@/lib/customisation";
import { CartShippingEstimate } from "@/components/CartShippingEstimate";
import { useStoreCategories } from "@/hooks/useStorefront";
import { SmartImage } from "@/components/storefront/SmartImage";
import { BrandPlaceholder } from "@/components/storefront/BrandPlaceholder";
import { formatINR } from "@/lib/format";
import { useSyncCartPrices } from "@/hooks/useSyncCartPrices";

export function CartDrawer() {
  const { bagOpen: isOpen, setBagOpen: setIsOpen } = useUiStore();
  const navigate = useNavigate();
  const { items, updateQuantity, removeItem, getTotalItems, getTotalPrice } = useCartStore();
  const { data: categories = [] } = useStoreCategories();
  useSyncCartPrices(isOpen);

  const totalItems = getTotalItems();
  const totalPrice = getTotalPrice();

  const handleCheckout = () => {
    setIsOpen(false);
    navigate("/checkout");
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Cart, ${totalItems} items`}>
          <ShoppingBag className="h-5 w-5" />
          {totalItems > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {totalItems}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent className="flex h-full w-full flex-col gap-0 bg-ivory p-0 sm:max-w-[440px]">
        <SheetHeader className="flex-shrink-0 border-b border-border px-6 py-5 text-left">
          <SheetTitle className="font-serif text-2xl font-normal">
            Your cart {totalItems > 0 && <span className="text-base text-muted-foreground">({totalItems})</span>}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {totalItems === 0 ? "Your cart is empty" : `${totalItems} item${totalItems !== 1 ? "s" : ""} in your cart`}
          </SheetDescription>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-gold/40">
              <ShoppingBag className="h-8 w-8 text-gold" />
            </div>
            <p className="font-serif text-2xl">Your cart is empty</p>
            <p className="mt-2 text-sm text-muted-foreground">Discover pieces from India's finest boutiques.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-2">
              {categories.slice(0, 4).map((c) => (
                <Link
                  key={c.id}
                  to={`/category/${c.slug}`}
                  onClick={() => setIsOpen(false)}
                  className="border border-foreground/15 px-4 py-2 text-xs uppercase tracking-[0.15em] hover:border-primary hover:text-primary"
                >
                  {c.name}
                </Link>
              ))}
            </div>
            <Button className="mt-8 h-12 rounded-none px-10 text-xs uppercase tracking-[0.2em]" onClick={() => { setIsOpen(false); navigate("/category/all"); }}>
              Start shopping
            </Button>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-6">
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={cartLineKey(item)} className="flex gap-4 py-5">
                    <Link
                      to={`/product/${item.productId}`}
                      onClick={() => setIsOpen(false)}
                      className="relative aspect-[3/4] w-24 flex-shrink-0 overflow-hidden bg-background"
                    >
                      <SmartImage
                        src={item.productImage}
                        alt={item.productName}
                        width={240}
                        className="absolute inset-0 h-full w-full object-cover"
                        fallback={<BrandPlaceholder />}
                      />
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/product/${item.productId}`}
                          onClick={() => setIsOpen(false)}
                          className="line-clamp-2 text-[15px] leading-snug hover:text-primary"
                        >
                          {item.productName}
                        </Link>
                        <button
                          type="button"
                          onClick={() => removeItem(cartLineKey(item))}
                          className="-mr-1 p-1 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${item.productName}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {item.selectedOptions.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.selectedOptions.map((o) => `${o.name}: ${o.value}`).join(" · ")}
                        </p>
                      )}
                      {item.customisation && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          <span className="mr-1 bg-gold/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-foreground">Customised</span>
                          {customisationSummary(item.customisation)} (+{inr(customisationPrice(item.customisation))})
                        </p>
                      )}
                      <div className="mt-auto flex items-center justify-between pt-3">
                        <div className="flex items-center border border-foreground/15">
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center hover:bg-background"
                            onClick={() => updateQuantity(cartLineKey(item), item.quantity - 1)}
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-8 text-center text-sm">{item.quantity}</span>
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center hover:bg-background"
                            onClick={() => updateQuantity(cartLineKey(item), item.quantity + 1)}
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="text-[15px] font-medium">{formatINR(parseFloat(item.price.amount) * item.quantity)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex-shrink-0 space-y-4 border-t border-border bg-background/60 px-6 py-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm uppercase tracking-[0.15em] text-muted-foreground">Subtotal</span>
                <span className="font-serif text-2xl">{formatINR(totalPrice)}</span>
              </div>
              <CartShippingEstimate items={items} />
              <Button onClick={handleCheckout} className="h-12 w-full rounded-none text-xs uppercase tracking-[0.2em]" size="lg">
                <Lock className="mr-2 h-3.5 w-3.5" /> Checkout securely
              </Button>
              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-gold" /> Every piece is quality-checked before it ships
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="mx-auto flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
              >
                Continue shopping <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
