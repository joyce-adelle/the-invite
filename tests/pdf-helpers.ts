import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
  type PDFPage,
} from "pdf-lib";

// Reads a generated PDF back, for tests: its pages and the text drawn on them.

export const asText = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

export function contentStreams(doc: PDFDocument, page: PDFPage): string[] {
  const contents = page.node.Contents()!;
  const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents];
  return streams.map((stream) => asText(decodePDFRawStream(stream as PDFRawStream).decode()));
}

export type Drawn = { text: string; size: number; x: number; y: number };

/** The text a card draws on page 2, as (text, size, position), via the font's own glyph-to-Unicode table. */
export function drawnText(doc: PDFDocument, page: PDFPage): Drawn[] {
  const fonts = page.node.Resources()!.lookupMaybe(PDFName.of("Font"), PDFDict)!;
  const fontDict = fonts.lookup(fonts.keys()[0], PDFDict);
  const toUnicode = asText(decodePDFRawStream(fontDict.lookup(PDFName.of("ToUnicode")) as PDFRawStream).decode());
  const byGlyph = new Map<string, string>();
  for (const [, glyph, unicode] of toUnicode.matchAll(/<([0-9A-F]{4})> <([0-9A-F]+)>/g)) {
    byGlyph.set(glyph, Buffer.from(unicode, "hex").swap16().toString("utf16le")); // UTF-16 big-endian
  }

  const added = contentStreams(doc, page).slice(3).join("\n");
  const runs = [...added.matchAll(/\/\S+ ([\d.]+) Tf\s+\S+ TL\s+1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm\s+<([0-9A-F]+)> Tj/g)];
  return runs.map(([, size, x, y, hex]) => ({
    size: Number(size),
    x: Number(x),
    y: Number(y),
    text: (hex.match(/.{4}/g) ?? []).map((glyph) => byGlyph.get(glyph) ?? "�").join(""),
  }));
}

export async function readCard(pdf: Uint8Array) {
  const doc = await PDFDocument.load(pdf);
  return { doc, page1: doc.getPage(0), page2: doc.getPage(1), drawn: drawnText(doc, doc.getPage(1)) };
}

