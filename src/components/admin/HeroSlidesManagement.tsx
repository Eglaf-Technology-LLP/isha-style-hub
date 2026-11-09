import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Copy,
  ExternalLink,
  Loader2,
  Monitor,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SingleImageDropzone } from "@/components/ImageDropzone";
import { HeroSlideView } from "@/components/storefront/home/HeroCarousel";
import { HeroSlideInput, HeroSlideRow, isLiveNow, toHeroSlide, useAdminHeroSlides } from "@/hooks/useHeroSlides";
import { useStoreCategories } from "@/hooks/useStorefront";
import { cn } from "@/lib/utils";
import { BANNER_SCHEDULE_ENABLED } from "@/lib/hiddenFeatures";

// Admin > Home Banner: the full-width carousel at the top of the home page.
// Any number of slides; each with its own text, buttons, photos (desktop and
// phone), video, layout and schedule. Shoppers see live slides in list order.

interface FormState {
  eyebrow: string;
  title: string;
  title_accent: string;
  subtitle: string;
  cta_label: string;
  cta_href: string;
  secondary_cta_label: string;
  secondary_cta_href: string;
  image_url: string | null;
  mobile_image_url: string | null;
  video_url: string;
  align: "left" | "center";
  show_overlay: boolean;
  is_active: boolean;
  starts_at: string; // datetime-local value
  ends_at: string;
}

const EMPTY: FormState = {
  eyebrow: "",
  title: "",
  title_accent: "",
  subtitle: "",
  cta_label: "",
  cta_href: "",
  secondary_cta_label: "",
  secondary_cta_href: "",
  image_url: null,
  mobile_image_url: null,
  video_url: "",
  align: "left",
  show_overlay: true,
  is_active: true,
  starts_at: "",
  ends_at: "",
};

// ISO <-> the browser's datetime-local value, in the admin's own time zone.
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

const fromRow = (r: HeroSlideRow): FormState => ({
  eyebrow: r.eyebrow ?? "",
  title: r.title ?? "",
  title_accent: r.title_accent ?? "",
  subtitle: r.subtitle ?? "",
  cta_label: r.cta_label ?? "",
  cta_href: r.cta_href ?? "",
  secondary_cta_label: r.secondary_cta_label ?? "",
  secondary_cta_href: r.secondary_cta_href ?? "",
  image_url: r.image_url,
  mobile_image_url: r.mobile_image_url,
  video_url: r.video_url ?? "",
  align: r.align === "center" ? "center" : "left",
  show_overlay: r.show_overlay,
  is_active: r.is_active,
  starts_at: toLocalInput(r.starts_at),
  ends_at: toLocalInput(r.ends_at),
});

const nn = (v: string | null) => (v && v.trim() ? v.trim() : null);

const toInput = (f: FormState): HeroSlideInput => ({
  eyebrow: nn(f.eyebrow),
  title: nn(f.title),
  title_accent: nn(f.title_accent),
  subtitle: nn(f.subtitle),
  cta_label: nn(f.cta_label),
  cta_href: nn(f.cta_href),
  secondary_cta_label: nn(f.secondary_cta_label),
  secondary_cta_href: nn(f.secondary_cta_href),
  image_url: nn(f.image_url),
  mobile_image_url: nn(f.mobile_image_url),
  video_url: nn(f.video_url),
  align: f.align,
  show_overlay: f.show_overlay,
  is_active: f.is_active,
  // With the schedule hidden, saving clears any dates: the on/off switch
  // alone decides.
  starts_at: BANNER_SCHEDULE_ENABLED ? fromLocalInput(f.starts_at) : null,
  ends_at: BANNER_SCHEDULE_ENABLED ? fromLocalInput(f.ends_at) : null,
});

const validLink = (href: string) => /^\/(?!\/)/.test(href) || /^https?:\/\/\S+$/i.test(href);

// Same rules as the table's checks, said in plain words before saving.
function validate(f: FormState): string | null {
  if (!nn(f.title) && !nn(f.image_url) && !nn(f.video_url)) return "Add a title, a desktop photo or a video";
  if (nn(f.cta_label) && !nn(f.cta_href)) return "Add a link for the main button";
  if (!!nn(f.secondary_cta_label) !== !!nn(f.secondary_cta_href)) return "The second button needs both its text and its link";
  for (const href of [f.cta_href, f.secondary_cta_href]) {
    if (nn(href) && !validLink(href.trim())) return `"${href}" isn't a link - start with / for a shop page or https:// for another site`;
  }
  if (nn(f.video_url) && !/^https:\/\/\S+$/i.test(f.video_url.trim())) return "The video must be an https:// link to an .mp4 file";
  if (BANNER_SCHEDULE_ENABLED && f.starts_at && f.ends_at && new Date(f.ends_at) <= new Date(f.starts_at)) return "\"Show until\" must be after \"Show from\"";
  return null;
}

type Status = { label: string; tone: "live" | "off" | "soon" | "ended" };
function statusOf(r: HeroSlideRow): Status {
  if (!r.is_active) return { label: "Hidden", tone: "off" };
  if (r.ends_at && new Date(r.ends_at).getTime() <= Date.now()) return { label: "Ended", tone: "ended" };
  if (r.starts_at && new Date(r.starts_at).getTime() > Date.now()) return { label: "Scheduled", tone: "soon" };
  return { label: "Live", tone: "live" };
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export function HeroSlidesManagement() {
  const { data: slides = [], isLoading, error, save, remove, setActive, reorder } = useAdminHeroSlides();
  const [editing, setEditing] = useState<{ id?: string; form: FormState } | null>(null);
  const [deleting, setDeleting] = useState<HeroSlideRow | null>(null);
  const [busy, setBusy] = useState(false);

  const liveCount = slides.filter((s) => isLiveNow(s)).length;

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Something went wrong - please try again");
    } finally {
      setBusy(false);
    }
  };

  const move = (i: number, dir: -1 | 1) => {
    const ids = slides.map((s) => s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => reorder(ids));
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
        <div>
          <CardTitle>Home page banner</CardTitle>
          <CardDescription>
            The full-width slides at the top of the home page. Shoppers see the live ones, in this order. {liveCount} live of{" "}
            {slides.length}.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="/" target="_blank" rel="noopener noreferrer" className="gap-2">
              <ExternalLink className="h-4 w-4" /> View home page
            </a>
          </Button>
          <Button onClick={() => setEditing({ form: { ...EMPTY } })} className="gap-2">
            <Plus className="h-4 w-4" /> Add slide
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="py-6 text-sm text-destructive">Couldn't load the slides: {(error as Error).message}</p>
        ) : slides.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No slides yet - the home page shows no banner. Add the first one.
          </div>
        ) : (
          <ul className="divide-y rounded-lg border">
            {slides.map((s, i) => {
              const st = statusOf(s);
              const thumb = s.image_url || s.mobile_image_url;
              return (
                <li key={s.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-6 text-center text-sm text-muted-foreground">{i + 1}</span>
                    <div className="h-14 w-24 shrink-0 overflow-hidden rounded border bg-maroon-deep">
                      {thumb ? (
                        <img src={thumb} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full pattern-jaal-dark" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {[s.title, s.title_accent].filter(Boolean).join(" ") || <span className="italic text-muted-foreground">Picture only</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[s.eyebrow, s.video_url ? "video" : null, s.cta_href].filter(Boolean).join(" · ")}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge
                          variant={st.tone === "live" ? "default" : "secondary"}
                          className={cn(st.tone === "soon" && "bg-amber-100 text-amber-900", st.tone === "ended" && "bg-muted text-muted-foreground")}
                        >
                          {st.label}
                        </Badge>
                        {(s.starts_at || s.ends_at) && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarClock className="h-3 w-3" />
                            {s.starts_at ? fmt(s.starts_at) : "now"} - {s.ends_at ? fmt(s.ends_at) : "no end"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 self-end sm:self-auto">
                    <Button variant="ghost" size="icon" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" disabled={busy || i === slides.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-2 px-2" title={s.is_active ? "Shown on the site" : "Hidden from the site"}>
                      <Switch
                        checked={s.is_active}
                        disabled={busy}
                        onCheckedChange={(v) => run(() => setActive(s.id, v), v ? "Slide switched on" : "Slide hidden")}
                        aria-label="Show on site"
                      />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setEditing({ id: s.id, form: fromRow(s) })} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      onClick={() => setEditing({ form: { ...fromRow(s), is_active: false } })}
                      aria-label="Duplicate"
                      title="Copy into a new, hidden slide"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" disabled={busy} onClick={() => setDeleting(s)} aria-label="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {editing && (
        <SlideEditor
          key={editing.id ?? "new"}
          initial={editing.form}
          isNew={!editing.id}
          onClose={() => setEditing(null)}
          onSave={async (form) => {
            await save(toInput(form), editing.id);
            toast.success(editing.id ? "Slide saved" : "Slide added");
            setEditing(null);
          }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this slide?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.title || "Picture-only slide"}" is removed from the home page for good. To take it down for a while, switch it off
              instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && run(() => remove(deleting.id), "Slide deleted")}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function SlideEditor({
  initial,
  isNew,
  onClose,
  onSave,
}: {
  initial: FormState;
  isNew: boolean;
  onClose: () => void;
  onSave: (f: FormState) => Promise<void>;
}) {
  const [f, setF] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));
  const { data: categories = [] } = useStoreCategories();

  const linkSuggestions = useMemo(
    () => [
      { href: "/category/all", label: "All products" },
      { href: "/category/all?sort=newest", label: "New arrivals" },
      { href: "/category/all?sale=1", label: "On sale" },
      { href: "/category/all?availability=made-to-order", label: "Made to order" },
      { href: "/boutiques", label: "All boutiques" },
      { href: "/sell-with-us", label: "Sell with us" },
      ...categories.map((c) => ({ href: `/category/${c.slug}`, label: c.name })),
    ],
    [categories],
  );

  const previewSlide = useMemo(() => {
    const now = new Date().toISOString();
    return toHeroSlide({
      ...toInput(f),
      id: "preview",
      position: 0,
      created_at: now,
      updated_at: now,
      align: f.align,
      show_overlay: f.show_overlay,
      is_active: true,
    } as HeroSlideRow);
  }, [f]);

  const submit = async () => {
    const problem = validate(f);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      await onSave(f);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the slide");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "New slide" : "Edit slide"}</DialogTitle>
          <DialogDescription>Every field except one of title / photo / video is optional. The preview updates as you type.</DialogDescription>
        </DialogHeader>

        <datalist id="hero-link-suggestions">
          {linkSuggestions.map((l) => (
            <option key={l.href} value={l.href}>
              {l.label}
            </option>
          ))}
        </datalist>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="space-y-6">
            <Section title="Text">
              <Field label="Small line above the title" hint="e.g. The Wedding Edit">
                <Input value={f.eyebrow} onChange={(e) => set("eyebrow", e.target.value)} maxLength={60} />
              </Field>
              <Field label="Title">
                <Input value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={80} />
              </Field>
              <Field label="Title, second line (italic)">
                <Input value={f.title_accent} onChange={(e) => set("title_accent", e.target.value)} maxLength={80} />
              </Field>
              <Field label="Description">
                <Textarea value={f.subtitle} onChange={(e) => set("subtitle", e.target.value)} rows={3} maxLength={240} />
              </Field>
            </Section>

            <Section title="Buttons" hint="Link: a shop page starting with / (pick from the list) or a full https:// link. A link with no button text makes the whole slide clickable.">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Main button text">
                  <Input value={f.cta_label} onChange={(e) => set("cta_label", e.target.value)} maxLength={30} placeholder="Shop the edit" />
                </Field>
                <Field label="Main button link">
                  <Input value={f.cta_href} onChange={(e) => set("cta_href", e.target.value)} list="hero-link-suggestions" placeholder="/category/lehenga" />
                </Field>
                <Field label="Second button text">
                  <Input value={f.secondary_cta_label} onChange={(e) => set("secondary_cta_label", e.target.value)} maxLength={30} />
                </Field>
                <Field label="Second button link">
                  <Input value={f.secondary_cta_href} onChange={(e) => set("secondary_cta_href", e.target.value)} list="hero-link-suggestions" />
                </Field>
              </div>
            </Section>

            <Section title="Pictures" hint="Desktop: landscape, about 2400 x 1200 px. Phone: portrait, about 1080 x 1600 px - if left empty the desktop photo is used. Up to 5MB each.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Desktop photo">
                  <SingleImageDropzone folder="hero" value={f.image_url} onChange={(url) => set("image_url", url)} />
                </Field>
                <Field label="Phone photo (optional)">
                  <SingleImageDropzone folder="hero" value={f.mobile_image_url} onChange={(url) => set("mobile_image_url", url)} />
                </Field>
              </div>
              <Field label="Background video (optional)" hint="An https:// link to a short .mp4. It plays muted on a loop; the desktop photo shows while it loads.">
                <Input value={f.video_url} onChange={(e) => set("video_url", e.target.value)} placeholder="https://.../banner.mp4" />
              </Field>
            </Section>

            <Section title="Layout">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Text position">
                  <Tabs value={f.align} onValueChange={(v) => set("align", v as "left" | "center")}>
                    <TabsList className="w-full">
                      <TabsTrigger value="left" className="flex-1">Left</TabsTrigger>
                      <TabsTrigger value="center" className="flex-1">Centre</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </Field>
                <ToggleRow
                  label="Darken the photo"
                  hint="Keeps white text readable. Turn off for banners with their own text in the picture."
                  checked={f.show_overlay}
                  onChange={(v) => set("show_overlay", v)}
                />
              </div>
            </Section>

            {/* Hidden for now: slides are switched on and off from the list. */}
            {BANNER_SCHEDULE_ENABLED && (
              <Section title="When it shows" hint="Leave the dates empty to show it until you switch it off.">
                <ToggleRow label="Show on the site" checked={f.is_active} onChange={(v) => set("is_active", v)} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Show from">
                    <Input type="datetime-local" value={f.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
                  </Field>
                  <Field label="Show until">
                    <Input type="datetime-local" value={f.ends_at} onChange={(e) => set("ends_at", e.target.value)} />
                  </Field>
                </div>
              </Section>
            )}
          </div>

          <div className="space-y-3 lg:sticky lg:top-0 lg:self-start">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Preview</p>
              <Tabs value={device} onValueChange={(v) => setDevice(v as "desktop" | "mobile")}>
                <TabsList>
                  <TabsTrigger value="desktop" className="gap-1">
                    <Monitor className="h-3.5 w-3.5" /> Desktop
                  </TabsTrigger>
                  <TabsTrigger value="mobile" className="gap-1">
                    <Smartphone className="h-3.5 w-3.5" /> Phone
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {device === "desktop" ? (
              <ScaledFrame width={1280} height={640}>
                <HeroSlideView slide={previewSlide} active device="desktop" className="h-full" />
              </ScaledFrame>
            ) : (
              <div className="mx-auto max-w-[260px]">
                <ScaledFrame width={390} height={700}>
                  <HeroSlideView slide={{ ...previewSlide, eyebrow: undefined, title: undefined, titleAccent: undefined, subtitle: undefined, cta: undefined, secondaryCta: undefined }} active device="mobile" className="h-full" />
                </ScaledFrame>
                <p className="mt-2 text-center text-xs text-muted-foreground">Phone photo crop. The text sits on top, in smaller type.</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isNew ? "Add slide" : "Save slide"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border p-3">
      <div>
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// Renders its child at a real page size (so the slide looks exactly as on the
// site) and scales it down to the available width.
function ScaledFrame({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={ref} className="relative w-full overflow-hidden rounded-md border" style={{ height: height * scale }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width, height, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
