"""Turn the website's policy and info pages (Live-Vendor JSX) into plain data for the app.

Run: npm run legal:sync (after `git fetch origin Live-Vendor`). Reads the
website's files with `git show`, so the app's text is exactly the website's.

Output:
- src/content/legal.ts: Terms & Conditions, Privacy Policy, Shipping Policy,
  Return & Refund Policy, About us, Contact us and FAQ.
- src/content/company.ts: AllBoutiqs' company and customer-care details
  (the website's src/lib/company.ts).

Numbers the website takes from its own constants (cancel window, bank refund
days, ...) are filled in here, as the website builds them into its pages.
Numbers it reads from Admin settings at run time (return window, refund
charge) stay as {"v": name} segments the app fills in when it shows the page.
"""
import json
import os
import re
import shutil
import subprocess

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
BRANCH = "origin/Live-Vendor"

# key in the app -> the website's page
PAGES = {
    "terms": "src/pages/legal/CustomerTerms.tsx",
    "privacy": "src/pages/legal/PrivacyPolicy.tsx",
    "shipping": "src/pages/legal/ShippingPolicy.tsx",
    "returns": "src/pages/legal/ReturnRefundPolicy.tsx",
    "about": "src/pages/info/AboutUs.tsx",
    "contact": "src/pages/info/ContactUs.tsx",
    "faq": "src/pages/info/Faq.tsx",
}

# Website constants used in the pages, and the file each one lives in.
CONSTANTS = {
    "CUSTOMER_CANCEL_WINDOW_HOURS": "src/lib/orderCancel.ts",
    "BANK_REFUND_DAYS": "src/lib/wallet.ts",
    "ADDRESS_LINE1_MIN": "src/lib/vendorKyc.ts",
}

# Values read from Admin settings when the page is shown (the app fills them in).
RUNTIME = {
    "span": "returnSpan",
    "returnWindowSpan(windowHours)": "returnSpan",
    "refundChargeLabel(refundCharge)": "refundCharge",
}
TOKEN = "\u0001"  # wraps a runtime value's name inside text
HARD_SPACE = "\u0002"  # {" "}: a space JSX keeps


def show(path):
    return subprocess.run(
        ["git", "show", f"{BRANCH}:{path}"], capture_output=True, text=True, encoding="utf-8", check=True
    ).stdout


def balanced(src, start):
    """Text inside the bracket at src[start] ('(', '{' or '['), matching nesting."""
    open_ch = src[start]
    close_ch = {"(": ")", "{": "}", "[": "]"}[open_ch]
    depth = 0
    for i in range(start, len(src)):
        if src[i] == open_ch:
            depth += 1
        elif src[i] == close_ch:
            depth -= 1
            if depth == 0:
                return src[start + 1 : i]
    raise ValueError("unbalanced")


def ts_object(src, name):
    """`export const NAME = {...}` of plain strings (nested objects allowed) -> dict."""
    start = src.index("{", src.index(f"export const {name} ="))
    body = "{" + balanced(src, start) + "}"
    body = re.sub(r"^\s*//.*$", "", body, flags=re.M)
    body = re.sub(r"^(\s*)(\w+):", r'\1"\2":', body, flags=re.M)
    body = re.sub(r",(\s*})", r"\1", body)
    return json.loads(body)


def ts_number(path, name):
    return int(re.search(rf"export const {name} = (\d+);", show(path)).group(1))


def ts_string_list(path, name):
    src = show(path)
    start = src.index("[", src.index(f"export const {name} ="))
    return re.findall(r'"([^"]*)"', src[start : src.index("]", start)])


COMPANY = ts_object(show("src/lib/company.ts"), "COMPANY")
LEGAL_SRC = show("src/lib/legal.ts")
LEGAL_PATHS = ts_object(LEGAL_SRC, "LEGAL_PATHS")
LEGAL_UPDATED = re.search(r'LEGAL_UPDATED = "([^"]+)"', LEGAL_SRC).group(1)
STORE_POLICIES_UPDATED = re.search(r'STORE_POLICIES_UPDATED = "([^"]+)"', LEGAL_SRC).group(1)
CONSTANT_VALUES = {name: str(ts_number(path, name)) for name, path in CONSTANTS.items()}
CHARGE_FREE = ts_string_list("src/lib/wallet.ts", "CHARGE_FREE_RETURN_REASONS")


def company(path):
    value = COMPANY
    for key in path.split("."):
        value = value[key]
    return value


def tel_href(phone):
    return "tel:" + re.sub(r"\s", "", phone)


def expression(inner):
    """A {...} in text position -> the text it shows."""
    e = inner.strip()
    if re.fullmatch(r"/\*.*\*/", e, re.S):
        return ""
    if e in ('" "', "' '"):
        return HARD_SPACE
    m = re.fullmatch(r"COMPANY\.([\w.]+)", e)
    if m:
        return company(m.group(1))
    if e in CONSTANT_VALUES:
        return CONSTANT_VALUES[e]
    if re.fullmatch(r'CHARGE_FREE_RETURN_REASONS\.map\(\(r\) => r\.toLowerCase\(\)\)\.join\("; "\)', e):
        return "; ".join(r.lower() for r in CHARGE_FREE)
    if e in RUNTIME:
        return TOKEN + RUNTIME[e] + TOKEN
    raise ValueError(f"unknown JSX expression: {{{e}}} - teach scripts/legal_from_website.py about it")


def tag(t):
    """Attribute expressions in a tag -> plain strings."""
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"href=\{telHref\(COMPANY\.([\w.]+)\)\}", lambda m: f'href="{tel_href(company(m.group(1)))}"', t)
    t = re.sub(r"href=\{`mailto:\$\{COMPANY\.([\w.]+)\}`\}", lambda m: f'href="mailto:{company(m.group(1))}"', t)
    t = re.sub(r"href=\{COMPANY\.([\w.]+)\}", lambda m: f'href="{company(m.group(1))}"', t)
    t = re.sub(r"to=\{LEGAL_PATHS\.(\w+)\}", lambda m: f'to="{LEGAL_PATHS[m.group(1)]}"', t)
    return t


def jsx_text(text):
    """JSX's whitespace rule for a run of text (as Babel compiles it)."""
    lines = text.replace("\r\n", "\n").split("\n")
    non_empty = [i for i, line in enumerate(lines) if re.search(r"[^ \t]", line)]
    last = non_empty[-1] if non_empty else -1
    out = ""
    for i, line in enumerate(lines):
        line = line.replace("\t", " ")
        if i > 0:
            line = line.lstrip(" ")
        if i < len(lines) - 1:
            line = line.rstrip(" ")
        if line:
            out += line if i == last else line + " "
    return out


def entities(s):
    return s.replace("&amp;", "&").replace("&apos;", "'").replace("&quot;", '"').replace("&rsquo;", "’")


def inline(jsx):
    """JSX children -> segments: str | {"b": text} | {"t": text, "href": path} | {"v": runtime value}."""
    parts = re.split(r"(<[^>]*>|\{[^{}]*\})", jsx)
    s = ""
    for i, part in enumerate(parts):
        if i % 2 == 0:
            s += jsx_text(part)
        elif part.startswith("{"):
            s += expression(part[1:-1])
        elif re.fullmatch(r"<br\s*/>", part):
            s += "\n"
        else:
            s += tag(part)
    s = entities(s).replace(HARD_SPACE, " ")
    out = []
    pos = 0
    pattern = re.compile(
        r'<Link\s+to="([^"]+)"[^>]*>(.*?)</Link>'
        r'|<a\s+[^>]*?href="([^"]+)"[^>]*>(.*?)</a>'
        r"|<strong[^>]*>(.*?)</strong>",
        re.S,
    )
    for m in pattern.finditer(s):
        if m.start() > pos:
            out.append(s[pos : m.start()])
        if m.group(2) is not None:
            out.append({"t": m.group(2).strip(), "href": m.group(1)})
        elif m.group(4) is not None:
            out.append({"t": m.group(4).strip(), "href": m.group(3)})
        else:
            out.append({"b": m.group(5).strip()})
        pos = m.end()
    if pos < len(s):
        out.append(s[pos:])
    # runtime values out of the text, then merge and trim
    split = []
    for seg in out:
        if isinstance(seg, str):
            for j, piece in enumerate(seg.split(TOKEN)):
                split.append({"v": piece} if j % 2 else piece)
        else:
            assert not any(TOKEN in str(v) for v in seg.values()), f"runtime value inside a link or bold: {seg}"
            split.append(seg)
    cleaned = []
    for seg in split:
        if isinstance(seg, str) and cleaned and isinstance(cleaned[-1], str):
            cleaned[-1] += seg
        else:
            cleaned.append(seg)
    if cleaned and isinstance(cleaned[0], str):
        cleaned[0] = cleaned[0].lstrip()
    if cleaned and isinstance(cleaned[-1], str):
        cleaned[-1] = cleaned[-1].rstrip()
    leftover = [x for x in cleaned if isinstance(x, str) and re.search(r"[<>{}]", x)]
    assert not leftover, f"unconverted JSX: {leftover}"
    return [x for x in cleaned if x != ""]


def blocks(jsx):
    """Body JSX -> list of {"p": segs} | {"ul": [segs, ...]} | {"grievance": true} | {"complaint": true}."""
    out = []
    for m in re.finditer(
        r"<p[^>]*>\s*<RaiseComplaintButton[^>]*/>\s*</p>|<p[^>]*>(.*?)</p>|<ul[^>]*>(.*?)</ul>|<GrievanceContact\s*/>",
        jsx,
        re.S,
    ):
        if m.group(0).startswith("<p") and "<RaiseComplaintButton" in m.group(0):
            out.append({"complaint": True})
        elif m.group(1) is not None:
            out.append({"p": inline(m.group(1))})
        elif m.group(2) is not None:
            items = re.findall(r"<li[^>]*>(.*?)</li>", m.group(2), re.S)
            out.append({"ul": [inline(i) for i in items]})
        else:
            out.append({"grievance": True})
    return out


def page(path):
    src = show(path)
    # JSX kept in a const (Faq: myOrders, shipping, returns) -> put in place.
    for m in re.finditer(r"const (\w+) = \(\s*(<Link[\s\S]*?</Link>)\s*\);", src):
        src = src.replace("{" + m.group(1) + "}", m.group(2))
    sections = []
    for m in re.finditer(r"id:\s*\"([^\"]+)\",\s*title:\s*\"([^\"]+)\",\s*body:\s*", src):
        if src[m.end()] == "(":
            body = balanced(src, m.end())
        else:
            # one-element body: body: <p>...</p>,
            body = re.match(r"(<(\w+)[^>]*>.*?</\2>)", src[m.end() :], re.S).group(1)
        sections.append({"id": m.group(1), "title": m.group(2), "blocks": blocks(body)})
    lp = src.index("<LegalPage")
    props = src[lp:]
    eyebrow = entities(re.search(r"eyebrow=\"([^\"]+)\"", props).group(1))
    title = entities(re.search(r"title=\"([^\"]+)\"", props).group(1))
    i = src.index("intro={", lp) + len("intro=")
    intro = blocks(balanced(src, i))
    upd = re.search(r"updated=\{(\w+)\}", props)
    updated = {None: LEGAL_UPDATED, "null": None, "STORE_POLICIES_UPDATED": STORE_POLICIES_UPDATED, "LEGAL_UPDATED": LEGAL_UPDATED}[
        upd.group(1) if upd else None
    ]
    return {"eyebrow": eyebrow, "title": title, "updated": updated, "intro": intro, "sections": sections}


docs = {key: page(path) for key, path in PAGES.items()}

legal_header = """// AllBoutiqs' policy and info pages, word for word from the website
// (Live-Vendor src/pages/legal/* and src/pages/info/*), generated by
// scripts/legal_from_website.py (npm run legal:sync) - change the website's
// pages, then regenerate this file rather than editing it.
// Segments: plain text, {b: bold}, {t: text, href: link (an app path when
// the app has the page, else a website path / mailto / tel)}, {v: a value
// read from Admin settings when the page is shown}.

export type Segment =
  | string
  | { b: string }
  | { t: string; href: string }
  | { v: 'returnSpan' | 'refundCharge' };
export type Block =
  | { p: Segment[] }
  | { ul: Segment[][] }
  | { grievance: true }
  | { complaint: true };
export interface LegalDoc {
  eyebrow: string;
  title: string;
  // "Last updated" date; null for About us, Contact us and FAQ.
  updated: string | null;
  intro: Block[];
  sections: { id: string; title: string; blocks: Block[] }[];
}
export type LegalDocKey = keyof typeof LEGAL_DOCS;

"""


def js(value):
    return json.dumps(value, ensure_ascii=False, indent=2)


legal_body = (
    "// The version a customer accepts (the website's src/lib/legal.ts).\n"
    f"export const LEGAL_UPDATED = {json.dumps(LEGAL_UPDATED)};\n"
    "// Date shown on the Shipping and Return & Refund policies.\n"
    f"export const STORE_POLICIES_UPDATED = {json.dumps(STORE_POLICIES_UPDATED)};\n\n"
    "// The website's paths for these pages (and the seller terms, website only).\n"
    f"export const LEGAL_PATHS = {js(LEGAL_PATHS)} as const;\n\n"
    + "".join(f"export const {key.upper()}: LegalDoc = {js(doc)};\n\n" for key, doc in docs.items())
    + "export const LEGAL_DOCS = {\n"
    + "".join(f"  {key}: {key.upper()},\n" for key in docs)
    + "};\n"
)

company_src = f"""// AllBoutiqs' own legal and customer-care details - the website's
// src/lib/company.ts (Live-Vendor), generated by scripts/legal_from_website.py
// (npm run legal:sync). Change the website's file, then regenerate.

export const COMPANY = {js(COMPANY)} as const;

export const telHref = (phone: string) => `tel:${{phone.replace(/\\s/g, '')}}`;
"""

os.makedirs("src/content", exist_ok=True)
open("src/content/legal.ts", "w", encoding="utf-8", newline="\n").write(legal_header + legal_body)
open("src/content/company.ts", "w", encoding="utf-8", newline="\n").write(company_src)

# Same formatting as the rest of the app, when its tools are installed.
prettier = os.path.join("node_modules", ".bin", "prettier.cmd" if os.name == "nt" else "prettier")
if os.path.exists(prettier) or shutil.which("prettier"):
    subprocess.run([prettier if os.path.exists(prettier) else "prettier", "--write", "src/content/legal.ts", "src/content/company.ts"], check=True, capture_output=True)

print(
    ", ".join(f"{k}: {len(d['sections'])} sections" for k, d in docs.items()),
    f"| updated {LEGAL_UPDATED}, store policies {STORE_POLICIES_UPDATED}",
)
