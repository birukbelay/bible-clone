/** Files out of the app in the browser: downloads, the browser's print dialog, a canvas for verse images. */
import type { VerseCard } from './files';

export type { VerseCard };

export const fileSharingAvailable = () => true;
export const printAvailable = () => typeof window !== 'undefined' && typeof window.print === 'function';
export const imageCaptureAvailable = () => typeof document !== 'undefined';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Shares a file through the browser's share sheet when it takes files, else downloads it. */
async function shareBlob(blob: Blob, name: string) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
    }
  }
  download(blob, name);
}

export async function shareFile(uri: string, mimeType: string, title?: string) {
  const res = await fetch(uri);
  await shareBlob(new Blob([await res.arrayBuffer()], { type: mimeType }), title ?? 'file');
  return true;
}

export async function saveText(name: string, content: string, mimeType = 'text/plain') {
  download(new Blob([content], { type: `${mimeType};charset=utf-8` }), name);
}

export function pickText(mimeTypes: string[] = ['application/json', 'text/plain']) {
  return new Promise<string | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = mimeTypes.filter((m) => m !== '*/*').join(',') + ',.json,.txt';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) resolve(null);
      else file.text().then(resolve, () => resolve(null));
    };
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** Prints the HTML from a hidden frame (the print dialog has "Save as PDF"). */
export async function printHtml(html: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  await new Promise((r) => setTimeout(r, 250));
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  setTimeout(() => frame.remove(), 60_000);
  return true;
}

export const sharePdf = (html: string) => printHtml(html);

/** Lines of `text` that fit `width` on the canvas. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** Draws the verse card on a canvas (1080 x 1080) and shares or downloads the PNG. */
export async function shareVerseImage(_view: unknown, card: VerseCard, name: string) {
  const size = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.fillStyle = card.background;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = card.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const margin = 110;
  // largest font (from card.size * 2.4 down) whose text fits
  let font = Math.round(card.size * 2.4);
  let lines: string[] = [];
  for (; font >= 24; font -= 2) {
    ctx.font = `${font}px ${card.font}`;
    lines = wrap(ctx, card.text, size - margin * 2);
    if (lines.length * font * 1.4 < size - margin * 2 - font * 2) break;
  }
  const lineHeight = font * 1.4;
  const top = size / 2 - ((lines.length + 1.6) * lineHeight) / 2 + lineHeight / 2;
  lines.forEach((l, i) => ctx.fillText(l, size / 2, top + i * lineHeight));
  ctx.font = `bold ${Math.round(font * 0.8)}px ${card.font}`;
  ctx.globalAlpha = 0.75;
  ctx.fillText(card.reference, size / 2, top + (lines.length + 0.6) * lineHeight);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) return false;
  await shareBlob(blob, name.endsWith('.png') ? name : `${name}.png`);
  return true;
}
