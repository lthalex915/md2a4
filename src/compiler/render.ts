import type { IR, ThemeId } from "./ir.ts";
import { renderClassicBody } from "./render-classic.ts";
import { renderNavyBody } from "./render-navy.ts";
import { renderPalatinoBody } from "./render-palatino.ts";
import { MATHJAX_HTML, THEME_CSS, THEME_SUPPLEMENT } from "./theme-css.ts";
import { escapeHtml } from "./html.ts";

const MATHJAX_TYPESET = `<script>
(function () {
  function typeset() {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  }
  if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
    window.MathJax.startup.promise.then(typeset);
  } else {
    document.addEventListener("DOMContentLoaded", typeset);
    window.addEventListener("load", typeset);
  }
})();
</script>`;

function wrapDocument(ir: IR, themeId: ThemeId, body: string): string {
  const title = escapeHtml(ir.title || "Untitled");
  const lang = escapeHtml(ir.lang || "en");
  const locked = THEME_CSS[themeId];
  const extra = THEME_SUPPLEMENT[themeId];
  const footerClass =
    themeId === "palatino" && (ir.footer_left || ir.folio) ? " has-running-footer" : "";
  const bodyTag = footerClass ? `<body class="has-running-footer">` : "<body>";
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
${locked}
${extra}
</style>
${MATHJAX_HTML}
${MATHJAX_TYPESET}
</head>
${bodyTag}
${body}
</body>
</html>
`;
}

export function renderHtml(ir: IR, themeId: ThemeId = ir.theme): string {
  const body =
    themeId === "navy"
      ? renderNavyBody({ ...ir, theme: themeId })
      : themeId === "palatino"
        ? renderPalatinoBody({ ...ir, theme: themeId })
        : renderClassicBody({ ...ir, theme: themeId });
  return wrapDocument({ ...ir, theme: themeId }, themeId, body);
}
