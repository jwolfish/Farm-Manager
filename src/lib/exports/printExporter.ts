import { esc } from '../htmlEscape';

export function exportElementToPrint(elementId: string, title: string) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const styles = Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join('\n');
      } catch {
        return '';
      }
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${esc(title)}</title>
  <style>
    ${styles}
    body { padding: 20px; font-family: sans-serif; }
    @media print { button { display: none !important; } }
  </style>
</head>
<body>
  ${el.outerHTML}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const newWin = window.open(url, '_blank');
  if (newWin) {
    newWin.addEventListener('load', () => {
      newWin.print();
      URL.revokeObjectURL(url);
    });
  }
}
