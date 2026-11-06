"""Turn the website's legal pages (Live-Vendor JSX) into plain data for the app.

Run: npm run legal:sync (after `git fetch origin Live-Vendor`). Reads the two
pages with `git show`, so the app's text is exactly the
website's. Output: src/content/legal.ts
"""
import json
import os
import re
import subprocess

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
BRANCH = "origin/Live-Vendor"

COMPANY = {
    "legalName": "AllBoutiqs Private Limited",
    "gstin": "24ABGCA7307J1ZP",
    "cin": "U47912GJ2026PTC183684",
    "jurisdiction": "Deesa, Gujarat",
    "supportEmail": "support@allboutiqs.com",
    "supportPhone": "+91 76004 84789",
    "whatsapp": "+91 78019 40567",
    "officeAddress": "19, Puniynagari, Near Smrudhipark, Deesa, Banaskantha, Gujarat 385535",
}
PATHS = {
    "LEGAL_PATHS.privacy": "/privacy-policy",
    "LEGAL_PATHS.terms": "/terms",
    "LEGAL_PATHS.sellerTerms": "/seller-terms",
}


def show(path):
    return subprocess.run(["git", "show", f"{BRANCH}:{path}"], capture_output=True, text=True, encoding="utf-8", check=True).stdout


def balanced(src, start):
    """Text inside the bracket at src[start] ('(' or '{'), matching nesting."""
    open_ch = src[start]
    close_ch = {"(": ")", "{": "}"}[open_ch]
    depth = 0
    for i in range(start, len(src)):
        if src[i] == open_ch:
            depth += 1
        elif src[i] == close_ch:
            depth -= 1
            if depth == 0:
                return src[start + 1 : i]
    raise ValueError("unbalanced")


def inline(jsx):
    """JSX text -> list of segments: str | {"b": text} | {"t": text, "href": path}."""
    s = jsx
    s = s.replace('{" "}', " ").replace("{' '}", " ")
    s = re.sub(r"\$\{COMPANY\.(\w+)\}", lambda m: COMPANY[m.group(1)], s)
    s = re.sub(r"\{COMPANY\.(\w+)\}", lambda m: COMPANY[m.group(1)], s)
    s = re.sub(r"\{COMPANY\.grievanceOfficer\.\w+\}", COMPANY["supportEmail"], s)
    s = s.replace("&amp;", "&").replace("&apos;", "'").replace("&quot;", '"').replace("&rsquo;", "\u2019")
    s = re.sub(r"\s+", " ", s)
    out = []
    pos = 0
    pattern = re.compile(
        r"<Link\s+to=\{?\"?([^\"}]+)\"?\}?[^>]*>(.*?)</Link>"
        r"|<a\s+[^>]*href=\{?[\"`]?([^\"`}]+)[\"`]?\}?[^>]*>(.*?)</a>"
        r"|<strong[^>]*>(.*?)</strong>"
    )
    for m in pattern.finditer(s):
        if m.start() > pos:
            out.append(s[pos : m.start()])
        if m.group(2) is not None:
            to = m.group(1).strip()
            out.append({"t": m.group(2).strip(), "href": PATHS.get(to, to)})
        elif m.group(4) is not None:
            href = m.group(3).strip()
            href = re.sub(r"\$\{COMPANY\.(\w+)\}", lambda k: COMPANY[k.group(1)], href)
            out.append({"t": m.group(4).strip(), "href": href})
        else:
            out.append({"b": m.group(5).strip()})
        pos = m.end()
    if pos < len(s):
        out.append(s[pos:])
    # trim, merge, drop empties
    cleaned = []
    for seg in out:
        if isinstance(seg, str):
            if cleaned and isinstance(cleaned[-1], str):
                cleaned[-1] += seg
            else:
                cleaned.append(seg)
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
    """Body JSX -> list of {"p": segs} | {"ul": [segs, ...]} | {"grievance": true}."""
    out = []
    for m in re.finditer(r"<p[^>]*>(.*?)</p>|<ul[^>]*>(.*?)</ul>|<GrievanceContact\s*/>", jsx, re.S):
        if m.group(1) is not None:
            out.append({"p": inline(m.group(1))})
        elif m.group(2) is not None:
            items = re.findall(r"<li[^>]*>(.*?)</li>", m.group(2), re.S)
            out.append({"ul": [inline(i) for i in items]})
        else:
            out.append({"grievance": True})
    return out


def page(path):
    src = show(path)
    sections = []
    for m in re.finditer(r"id:\s*\"([^\"]+)\",\s*title:\s*\"([^\"]+)\",\s*body:\s*", src):
        if src[m.end()] == "(":
            body = balanced(src, m.end())
        else:
            # one-line body: body: <p>...</p>,
            body = re.match(r"(<(\w+)[^>]*>.*?</\2>)", src[m.end():], re.S).group(1)
        sections.append({"id": m.group(1), "title": m.group(2), "blocks": blocks(body)})
    lp = src.index("<LegalPage")
    eyebrow = re.search(r"eyebrow=\"([^\"]+)\"", src[lp:]).group(1)
    title = re.search(r"title=\"([^\"]+)\"", src[lp:]).group(1).replace("&amp;", "&")
    i = src.index("intro={", lp) + len("intro=")
    intro = blocks(balanced(src, i))
    return {"eyebrow": eyebrow, "title": title, "intro": intro, "sections": sections}


terms = page("src/pages/legal/CustomerTerms.tsx")
privacy = page("src/pages/legal/PrivacyPolicy.tsx")
updated = re.search(r'LEGAL_UPDATED = "([^"]+)"', show("src/lib/legal.ts")).group(1)

header = """// The customer Terms & Conditions and the Privacy Policy, word for word from
// the website (Live-Vendor src/pages/legal/*), generated by scripts/legal_from_website.py (npm run legal:sync) - change
// the website's pages, then regenerate this file rather than editing it.
// Segments: plain text, {b: bold}, {t: text, href: link (an app path when
// the app has the page, else a website path / mailto / tel)}.

export type Segment = string | { b: string } | { t: string; href: string };
export type Block = { p: Segment[] } | { ul: Segment[][] } | { grievance: true };
export interface LegalDoc {
  eyebrow: string;
  title: string;
  intro: Block[];
  sections: { id: string; title: string; blocks: Block[] }[];
}

"""
body = (
    f"export const LEGAL_UPDATED = {json.dumps(updated)};\n\n"
    f"export const TERMS: LegalDoc = {json.dumps(terms, ensure_ascii=False, indent=2)};\n\n"
    f"export const PRIVACY: LegalDoc = {json.dumps(privacy, ensure_ascii=False, indent=2)};\n"
)
os.makedirs("src/content", exist_ok=True)
open("src/content/legal.ts", "w", encoding="utf-8", newline="\n").write(header + body)
print("terms sections:", len(terms["sections"]), "privacy sections:", len(privacy["sections"]), "updated:", updated)
