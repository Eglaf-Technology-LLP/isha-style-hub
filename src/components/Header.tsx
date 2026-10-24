import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { STAFF_ONLY_MODE } from "@/lib/staffMode";
import logo from "@/assets/logo.png";
import { ArrowRight, BadgeCheck, ChevronRight, Heart, Home, Menu, MessageCircle, Package, Search, Store, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { CartDrawer } from "./CartDrawer";
import { NotificationBell } from "./NotificationBell";
import { supabase } from "@/integrations/supabase/client";
import { useVendor } from "@/hooks/useVendor";
import { useAdmin } from "@/hooks/useAdmin";
import { categoryCover, StoreCategory, useMenuCategories, useStoreBoutiques, useStoreProducts } from "@/hooks/useStorefront";
import { useUiStore } from "@/stores/uiStore";
import { AnnouncementBar } from "@/components/storefront/AnnouncementBar";
import { SearchPanel } from "@/components/storefront/SearchPanel";
import { SmartImage } from "@/components/storefront/SmartImage";
import { BrandPlaceholder } from "@/components/storefront/BrandPlaceholder";
import { COMPANY } from "@/lib/company";
import { userContact } from "@/lib/authIdentifier";
import { useHomePath } from "@/hooks/useHomePath";
import { SignInSecurityDialog } from "@/components/auth/SignInSecurity";
import { cn } from "@/lib/utils";
import type { User as SupabaseUser } from "@supabase/supabase-js";

type MenuKey = string | null;

// variant "seller": the slim header for someone registering as a seller -
// logo, seller help and their account only (no search, shop menus, bag or
// wishlist).
export function Header({ variant = "store" }: { variant?: "store" | "seller" }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const closeTimer = useRef<number>();
  const location = useLocation();
  const { vendor } = useVendor();
  const { isAdmin } = useAdmin();
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const homePath = useHomePath();

  const { data: categories } = useMenuCategories();
  const { data: boutiques = [] } = useStoreBoutiques();
  const { data: products = [] } = useStoreProducts();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close menus on navigation.
  useEffect(() => {
    setOpenMenu(null);
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  // Boutiques selling in each category, for the category mega menus.
  const boutiquesByCategory = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const p of products) {
      if (!p.category_id || !p.vendor_id) continue;
      if (!map.has(p.category_id)) map.set(p.category_id, new Set());
      map.get(p.category_id)!.add(p.vendor_id);
    }
    return map;
  }, [products]);
  const hasSale = products.some((p) => p.compare_at_price && p.compare_at_price > p.price);
  const liveBoutiques = boutiques.filter((b) => products.some((p) => p.vendor_id === b.id));

  if (variant === "seller") {
    return (
      <header className="sticky top-0 z-50 border-b border-border bg-ivory/95 backdrop-blur-md">
        <div className="store-container flex h-16 items-center justify-between gap-3 md:h-[72px]">
          <div className="flex min-w-0 items-center gap-3">
            <Link to={homePath} aria-label="AllBoutiqs - home" className="shrink-0">
              <img src={logo} alt="AllBoutiqs" className="-my-3 h-[76px] w-auto object-contain" />
            </Link>
            <span aria-hidden className="hidden h-6 w-px bg-border sm:block" />
            <span className="hidden text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground sm:block">
              Seller registration
            </span>
          </div>
          <div className="flex items-center gap-1">
            <a
              href={COMPANY.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Seller help on WhatsApp"
              className="inline-flex h-10 items-center gap-2 px-2 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/80 transition-colors hover:text-primary sm:px-3"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Seller help</span>
            </a>
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Account">
                    <User className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{userContact(user)}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setSecurityOpen(true)}>Password &amp; sign-in</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSignOut}>Sign Out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <SignInSecurityDialog open={securityOpen} onOpenChange={setSecurityOpen} />
      </header>
    );
  }

  // Staff see only their own area (STAFF_ONLY_MODE): no shop links.
  if (STAFF_ONLY_MODE && user && (isAdmin || vendor)) {
    const home = isAdmin ? "/admin" : "/vendor";
    return (
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Link to={home} aria-label="AllBoutiqs - home">
                <img src={logo} alt="AllBoutiqs" className="h-12 w-auto object-contain" />
              </Link>
              <Button variant="ghost" size="sm" asChild>
                <Link to={home} className="gap-1.5">
                  <Home className="h-4 w-4" /> Home
                </Link>
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Account">
                    <User className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{userContact(user)}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {vendor && (
                    <DropdownMenuItem asChild>
                      <Link to="/vendor">Vendor Dashboard</Link>
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin">Admin Panel</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => setSecurityOpen(true)}>Password &amp; sign-in</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>Sign Out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        <SignInSecurityDialog open={securityOpen} onOpenChange={setSecurityOpen} />
      </header>
    );
  }

  const openSoon = (key: MenuKey) => {
    window.clearTimeout(closeTimer.current);
    setOpenMenu(key);
  };
  const closeSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpenMenu(null), 140);
  };

  const navLink = (key: string, label: string, to: string, opts: { mega?: boolean; highlight?: boolean } = {}) => {
    const active = location.pathname + location.search === to || (to !== "/" && location.pathname === to);
    return (
      <li
        key={key}
        onMouseEnter={() => (opts.mega ? openSoon(key) : openSoon(null))}
        className="h-full"
      >
        <Link
          to={to}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex h-full items-center text-[12px] font-medium uppercase tracking-[0.18em] transition-colors",
            opts.highlight ? "text-primary" : "text-foreground/85 hover:text-primary",
          )}
        >
          <span className={cn("link-draw pb-0.5", openMenu === key && "bg-[length:100%_1px]")}>{label}</span>
        </Link>
      </li>
    );
  };

  const megaCategory = categories.find((c) => `cat:${c.id}` === openMenu) ?? null;

  return (
    <>
      <AnnouncementBar />
      <header
        className={cn(
          "sticky top-0 z-50 border-b bg-ivory/95 backdrop-blur-md transition-shadow",
          scrolled ? "border-border shadow-[0_6px_24px_-18px_hsl(var(--ink)/0.5)]" : "border-transparent",
        )}
        onMouseLeave={closeSoon}
      >
        <div className="store-container">
          {/* Top row */}
          <div className={cn("grid grid-cols-[1fr_auto_1fr] items-center transition-[height] duration-300", scrolled ? "h-16" : "h-[72px] lg:h-20")}>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu" onClick={() => setMobileMenuOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Search" onClick={() => setSearchOpen(true)}>
                <Search className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Home" asChild>
                <Link to="/">
                  <Home className="h-5 w-5" />
                </Link>
              </Button>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="hidden h-10 w-64 items-center gap-2.5 border border-foreground/15 bg-background/60 px-3.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 lg:flex xl:w-72"
              >
                <Search className="h-4 w-4" />
                Search sarees, lehengas, boutiques
              </button>
            </div>

            <Link to="/" aria-label="AllBoutiqs home" className="justify-self-center">
              {/* The logo file has generous empty space around the mark, so it's
                  drawn larger than the row and pulled in with negative margins. */}
              <img
                src={logo}
                alt="AllBoutiqs"
                className={cn(
                  "w-auto object-contain transition-[height,margin] duration-300",
                  scrolled ? "-my-3 h-[76px]" : "-my-4 h-[84px] lg:-my-5 lg:h-[104px]",
                )}
              />
            </Link>

            <div className="flex items-center justify-end gap-0.5">
              {user && <NotificationBell />}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Account" className="hidden sm:inline-flex">
                    <User className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {user ? (
                    <>
                      <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{userContact(user)}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link to="/account">My Account</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/orders">My Orders</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/wishlist">My Wishlist</Link>
                      </DropdownMenuItem>
                      {vendor && (
                        <DropdownMenuItem asChild>
                          <Link to="/vendor">Vendor Dashboard</Link>
                        </DropdownMenuItem>
                      )}
                      {isAdmin && (
                        <DropdownMenuItem asChild>
                          <Link to="/admin">Admin Panel</Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleSignOut}>Sign Out</DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem asChild>
                        <Link to="/account">Sign In / Sign Up</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/orders">Track an Order</Link>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Link to="/wishlist" aria-label="Wishlist" className="hidden sm:block">
                <Button variant="ghost" size="icon" tabIndex={-1}>
                  <Heart className="h-5 w-5" />
                </Button>
              </Link>
              <CartDrawer />
            </div>
          </div>

          {/* Navigation (desktop) */}
          <nav className="hidden lg:block" aria-label="Main">
            <ul className="flex h-11 items-center justify-center gap-9">
              {navLink("home", "Home", "/")}
              {navLink("new", "New In", "/category/all?sort=newest")}
              {categories.slice(0, 7).map((c) => navLink(`cat:${c.id}`, c.name, `/category/${c.slug}`, { mega: true }))}
              {liveBoutiques.length > 0 && navLink("boutiques", "Boutiques", "/boutiques", { mega: true })}
              {hasSale && navLink("sale", "Sale", "/category/all?sale=1", { highlight: true })}
            </ul>
          </nav>
        </div>

        {/* Mega menu */}
        {openMenu && (megaCategory || openMenu === "boutiques") && (
          <div
            className="absolute inset-x-0 top-full hidden border-t border-border bg-ivory shadow-[0_24px_40px_-30px_hsl(var(--ink)/0.45)] animate-fade-in lg:block"
            onMouseEnter={() => openSoon(openMenu)}
            onMouseLeave={closeSoon}
          >
            <div className="store-container py-9">
              {megaCategory ? (
                <CategoryMega
                  category={megaCategory}
                  categories={categories}
                  boutiques={liveBoutiques.filter((b) => boutiquesByCategory.get(megaCategory.id)?.has(b.id))}
                  cover={megaCategory.image_url || categoryCover(megaCategory.id, products)}
                />
              ) : (
                <BoutiqueMega boutiques={liveBoutiques} />
              )}
            </div>
          </div>
        )}
      </header>

      <SearchPanel />

      {/* Mobile menu */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="flex w-[88vw] max-w-sm flex-col gap-0 overflow-y-auto bg-ivory p-0">
          <SheetHeader className="border-b border-border px-5 py-4 text-left">
            <SheetTitle>
              <img src={logo} alt="AllBoutiqs" className="h-10 w-auto" />
            </SheetTitle>
          </SheetHeader>
          <nav className="flex-1 px-5 py-5" aria-label="Mobile">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setSearchOpen(true);
              }}
              className="mb-6 flex h-11 w-full items-center gap-2.5 border border-foreground/15 px-3.5 text-sm text-muted-foreground"
            >
              <Search className="h-4 w-4" /> Search
            </button>
            <p className="eyebrow mb-3 text-gold">Shop</p>
            <ul className="divide-y divide-border border-y border-border">
              <MobileLink to="/" label="Home" />
              <MobileLink to="/category/all?sort=newest" label="New In" />
              {categories.map((c) => (
                <MobileLink key={c.id} to={`/category/${c.slug}`} label={c.name} />
              ))}
              <MobileLink to="/category/all" label="Shop all" />
              {hasSale && <MobileLink to="/category/all?sale=1" label="Sale" highlight />}
            </ul>
            {liveBoutiques.length > 0 && (
              <>
                <p className="eyebrow mb-3 mt-7 text-gold">Boutiques</p>
                <ul className="divide-y divide-border border-y border-border">
                  {liveBoutiques.slice(0, 6).map((b) => (
                    <MobileLink key={b.id} to={`/store/${b.slug}`} label={b.name} />
                  ))}
                  <MobileLink to="/boutiques" label="All boutiques" />
                </ul>
              </>
            )}
            <p className="eyebrow mb-3 mt-7 text-gold">Your account</p>
            <ul className="space-y-3 text-[15px]">
              <li>
                <Link to="/account" className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" /> {user ? "My account" : "Sign in / Sign up"}
                </Link>
              </li>
              <li>
                <Link to="/orders" className="flex items-center gap-3">
                  <Package className="h-4 w-4 text-muted-foreground" /> My orders
                </Link>
              </li>
              <li>
                <Link to="/wishlist" className="flex items-center gap-3">
                  <Heart className="h-4 w-4 text-muted-foreground" /> Wishlist
                </Link>
              </li>
              <li>
                <a href={COMPANY.whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
                  <MessageCircle className="h-4 w-4 text-muted-foreground" /> WhatsApp us
                </a>
              </li>
              {user && (
                <li>
                  <button type="button" onClick={handleSignOut} className="text-muted-foreground">
                    Sign out
                  </button>
                </li>
              )}
            </ul>
          </nav>
          <Link to="/sell-with-us" className="m-5 flex items-center justify-between bg-maroon-deep px-4 py-3.5 text-sm text-ivory">
            <span className="flex items-center gap-2">
              <Store className="h-4 w-4" /> Sell on AllBoutiqs
            </span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </SheetContent>
      </Sheet>
    </>
  );
}

function MobileLink({ to, label, highlight }: { to: string; label: string; highlight?: boolean }) {
  return (
    <li>
      <Link to={to} className={cn("flex items-center justify-between py-3.5 text-[15px]", highlight && "text-primary")}>
        {label}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>
    </li>
  );
}

function MegaColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-4 text-gold">{title}</p>
      <ul className="space-y-2.5 text-[15px]">{children}</ul>
    </div>
  );
}

function MegaLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link to={to} className="link-draw text-foreground/85 hover:text-primary">
        {children}
      </Link>
    </li>
  );
}

function CategoryMega({
  category,
  categories,
  boutiques,
  cover,
}: {
  category: StoreCategory;
  categories: StoreCategory[];
  boutiques: { id: string; name: string }[];
  cover: string | null;
}) {
  const base = `/category/${category.slug}`;
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_300px] gap-10">
      <MegaColumn title={`Shop ${category.name}`}>
        <MegaLink to={base}>All {category.name}</MegaLink>
        <MegaLink to={`${base}?sort=newest`}>New arrivals</MegaLink>
        <MegaLink to={`${base}?max=1999`}>Under ₹1,999</MegaLink>
        <MegaLink to={`${base}?sale=1`}>On sale</MegaLink>
        <MegaLink to={`${base}?availability=ready`}>Ready to ship</MegaLink>
        <MegaLink to={`${base}?availability=made-to-order`}>Made to order</MegaLink>
      </MegaColumn>
      <MegaColumn title="By boutique">
        {boutiques.length === 0 ? (
          <li className="text-sm text-muted-foreground">Boutiques coming soon</li>
        ) : (
          boutiques.slice(0, 7).map((b) => (
            <MegaLink key={b.id} to={`${base}?boutique=${b.id}`}>
              {b.name}
            </MegaLink>
          ))
        )}
      </MegaColumn>
      <MegaColumn title="More categories">
        {categories
          .filter((c) => c.id !== category.id)
          .map((c) => (
            <MegaLink key={c.id} to={`/category/${c.slug}`}>
              {c.name}
            </MegaLink>
          ))}
        <MegaLink to="/category/all">Shop everything</MegaLink>
      </MegaColumn>
      <Link to={base} className="group relative block aspect-[4/5] overflow-hidden bg-ivory">
        <SmartImage
          src={cover}
          alt={category.name}
          width={600}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          fallback={<BrandPlaceholder label={category.name} tone="dark" />}
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent p-5 text-ivory">
          <p className="eyebrow text-ivory/80">Discover</p>
          <p className="font-serif text-2xl">{category.name}</p>
        </div>
      </Link>
    </div>
  );
}

function BoutiqueMega({
  boutiques,
}: {
  boutiques: { id: string; name: string; slug: string; logo_url: string | null; is_verified: boolean }[];
}) {
  return (
    <div className="grid grid-cols-[1fr_300px] gap-10">
      <div>
        <div className="mb-5 flex items-center justify-between">
          <p className="eyebrow text-gold">Shop by boutique</p>
          <Link to="/boutiques" className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] hover:text-primary">
            <span className="link-draw">All boutiques</span> <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <ul className="grid grid-cols-3 gap-x-8 gap-y-4">
          {boutiques.slice(0, 12).map((b) => (
            <li key={b.id}>
              <Link to={`/store/${b.slug}`} className="group flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
                  {b.logo_url ? (
                    <img src={b.logo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-serif text-lg text-primary">{b.name.charAt(0).toUpperCase()}</span>
                  )}
                </span>
                <span className="text-[15px] group-hover:text-primary">{b.name}</span>
                {b.is_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-gold" aria-label="Verified" />}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <Link to="/sell-with-us" className="group relative flex flex-col justify-end overflow-hidden bg-maroon-deep p-6 pattern-jaal-dark text-ivory">
        <p className="eyebrow mb-2 text-gold">For boutiques</p>
        <p className="font-serif text-2xl leading-tight">Bring your boutique to all of India</p>
        <span className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em]">
          Sell on AllBoutiqs <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
        </span>
      </Link>
    </div>
  );
}
