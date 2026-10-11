// Print one element on its own A4 page: opens a window containing just
// that element plus the site's stylesheets, then prints it. Printing a
// dialog in place drags the rest of the page along (and clips the dialog).
export function printElement(el: HTMLElement | null, title: string, options: { landscape?: boolean } = {}): void {
  if (!el) return;
  const w = window.open("", "_blank", "width=1000,height=1100");
  if (!w) return;
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((node) => {
      if (node instanceof HTMLLinkElement) return `<link rel="stylesheet" href="${node.href}">`;
      return node.outerHTML;
    })
    .join("\n");
  w.document.open();
  w.document.write(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title.replace(/</g, "&lt;")}</title>
${styles}
<style>
  @page { size: A4${options.landscape ? " landscape" : ""}; margin: 12mm; }
  html, body { background: #fff !important; color: #000; }
  body { margin: 0; padding: 16px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>${el.outerHTML}</body>
</html>`);
  w.document.close();
  const go = () => {
    w.focus();
    w.print();
  };
  // Wait for the copied stylesheets before printing.
  if (w.document.readyState === "complete") setTimeout(go, 300);
  else w.addEventListener("load", () => setTimeout(go, 100));
}
