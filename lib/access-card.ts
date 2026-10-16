import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit, { type Font as ShapingFont } from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { accessCard } from "@/config/event";
import { getPublicHost } from "@/lib/data/hosts";
import { GuestStatus, type Guest } from "@/types/guest";

// Access cards. The card is built from ONE template for the whole event:
// page 1 is kept untouched and the host's name, the guest's name and the table
// are drawn onto page 2. Every card is made in memory from a fresh copy of the template, the
// source files are never modified, and nothing generated is stored.

/** What a card is made from: the guest, and the name of the host who invited them. */
export type AccessCardDetails = Pick<Guest, "id" | "name" | "status" | "tableNumber"> & {
  hostName: string;
};

type NameField = typeof accessCard.hostName;

// The template and the font are read once per server process.
type Assets = { template: Uint8Array; fontBytes: Uint8Array; shaping: ShapingFont };
let assets: Promise<Assets> | undefined;

// The paths come from config, which the build can't follow, so the files are
// listed in next.config.ts (outputFileTracingIncludes) and the comments below
// stop the build treating this as "might read anything in the project".
const assetPath = (file: string) => path.join(/* turbopackIgnore: true */ process.cwd(), file);

function loadAssets() {
  assets ??= Promise.all([
    readFile(assetPath(accessCard.templatePath)),
    readFile(assetPath(accessCard.fontPath)),
  ]).then(
    ([template, fontBytes]) => ({ template, fontBytes, shaping: fontkit.create(fontBytes) }),
    (error) => {
      assets = undefined; // try again next time rather than caching the failure
      throw error;
    },
  );
  return assets;
}

const COLOR = (() => {
  const hex = accessCard.color.replace("#", "");
  const channel = (offset: number) => parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return rgb(channel(0), channel(2), channel(4));
})();

const ELLIPSIS = "…";

/** Far more than fits on the card; stops a runaway name from making layout slow. */
const MAX_NAME_CHARACTERS = 150;

/** Plain, printable, uppercase text, as the design shows every value. */
function tidyName(name: string): string {
  return Array.from(
    name
      .normalize("NFC")
      .replace(/\s+/g, " ")
      .replace(/[\p{Cc}\p{Cf}]/gu, "") // control, zero-width and direction-override characters
      .trim()
      .toLocaleUpperCase("en"),
  )
    .slice(0, MAX_NAME_CHARACTERS)
    .join("")
    .trimEnd();
}

/** Characters the card font can't print are shown as "?" instead of an empty box. */
function printable(text: string, supported: ReadonlySet<number>): string {
  return Array.from(text, (char) => (supported.has(char.codePointAt(0)!) ? char : "?")).join("");
}

// A letter plus any combining marks on it (such as the tone mark on Ẹ̀ or Ọ́).
// pdf-lib draws marks without the font's positioning data, which hides them
// inside the letter below, so they are placed here from the font's own offsets.
type Cluster = { base: string; marks: { char: string; dx: number; dy: number }[] };

/** `dx` and `dy` are in thousandths of the font size. */
function shape(text: string, shaping: ShapingFont): Cluster[] {
  return (text.match(/\P{M}\p{M}*/gu) ?? []).map((cluster) => {
    const [base, ...marks] = Array.from(cluster);
    if (marks.length === 0) return { base, marks: [] };

    // Offsets only mean something while each mark is still its own glyph.
    const run = shaping.layout(cluster);
    const aligned = run.glyphs.length === marks.length + 1;
    return {
      base,
      marks: marks.map((char, i) => ({
        char,
        dx: aligned ? run.positions[i + 1].xOffset : 0,
        dy: aligned ? run.positions[i + 1].yOffset : 0,
      })),
    };
  });
}

const plain = (clusters: Cluster[]) => clusters.map((cluster) => cluster.base).join("");

// Everything below works on whole letters (clusters), so a mark is never
// separated from its letter. Marks have no width, so the plain letters give a
// line's width.
const SPACE: Cluster = { base: " ", marks: [] };

/** Cuts a line short with "…" until it fits. */
function ellipsize(line: Cluster[], widthOf: (line: Cluster[]) => number, maxWidth: number): Cluster[] {
  if (widthOf(line) <= maxWidth) return line;
  for (let length = line.length - 1; length > 0; length--) {
    const kept = line.slice(0, length);
    while (kept.length > 0 && kept[kept.length - 1].base === " ") kept.pop();
    const shortened = [...kept, { base: ELLIPSIS, marks: [] }];
    if (widthOf(shortened) <= maxWidth) return shortened;
  }
  return [{ base: ELLIPSIS, marks: [] }];
}

/** Breaks text into lines of at most `maxWidth`, between words where possible. */
function wrap(clusters: Cluster[], widthOf: (line: Cluster[]) => number, maxWidth: number): Cluster[][] {
  const words: Cluster[][] = [[]];
  for (const cluster of clusters) {
    if (cluster.base !== " ") words[words.length - 1].push(cluster);
    else if (words[words.length - 1].length > 0) words.push([]);
  }

  const lines: Cluster[][] = [];
  let line: Cluster[] = [];
  for (const word of words.filter((w) => w.length > 0)) {
    const attempt = line.length > 0 ? [...line, SPACE, ...word] : word;
    if (widthOf(attempt) <= maxWidth) {
      line = attempt;
      continue;
    }
    if (line.length > 0) lines.push(line);

    // A single word wider than a line is broken where it has to be.
    let rest = word;
    while (widthOf(rest) > maxWidth && rest.length > 1) {
      let length = rest.length - 1;
      while (length > 1 && widthOf(rest.slice(0, length)) > maxWidth) length--;
      lines.push(rest.slice(0, length));
      rest = rest.slice(length);
    }
    line = rest;
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

type NameLayout = { lines: Cluster[][]; size: number; baselines: number[] };

/**
 * Fits a name in its area: one line at full size if it fits, otherwise one
 * line shrunk to fit, otherwise two lines at the smallest size, and only then
 * the end of the second line is shortened with "…".
 */
function layoutName(
  clusters: Cluster[],
  font: PDFFont,
  { size, minSize, maxWidth, baseline, twoLines }: NameField,
): NameLayout {
  const widthAt = (at: number) => (line: Cluster[]) => font.widthOfTextAtSize(plain(line), at);

  const width = widthAt(size)(clusters);
  if (width <= maxWidth) return { lines: [clusters], size, baselines: [baseline] };

  // Width grows in step with the size, so the size that fits is a simple ratio.
  const fitted = size * (maxWidth / width);
  if (fitted >= minSize) return { lines: [clusters], size: fitted, baselines: [baseline] };

  const [first, ...rest] = wrap(clusters, widthAt(minSize), maxWidth);
  const remainder = rest.flatMap((line, i) => (i === 0 ? line : [SPACE, ...line]));
  return {
    lines: [first, ellipsize(remainder, widthAt(minSize), maxWidth)],
    size: minSize,
    baselines: [twoLines.baseline, twoLines.baseline + twoLines.lineHeight],
  };
}

function draw(page: PDFPage, font: PDFFont, text: string, x: number, baseline: number, size: number) {
  // Positions in the config are measured down from the top of the visible card.
  // The page's visible area doesn't start at y = 0 in this template, so go
  // from its crop box rather than assuming the origin.
  const box = page.getCropBox();
  page.drawText(text, { x: box.x + x, y: box.y + box.height - baseline, size, font, color: COLOR });
}

/** Draws the letters, then each combining mark where the font says it belongs. */
function drawClusters(
  page: PDFPage,
  font: PDFFont,
  clusters: Cluster[],
  x: number,
  baseline: number,
  size: number,
) {
  draw(page, font, plain(clusters), x, baseline, size);

  clusters.forEach((cluster, index) => {
    if (cluster.marks.length === 0) return;
    // A mark starts where its letter ends, then moves by the font's offsets.
    const letterEnd = x + font.widthOfTextAtSize(plain(clusters.slice(0, index + 1)), size);
    for (const mark of cluster.marks) {
      draw(page, font, mark.char, letterEnd + (mark.dx * size) / 1000, baseline - (mark.dy * size) / 1000, size);
    }
  });
}

/**
 * The access card as PDF bytes, ready to attach to an email or send as a
 * download. Throws if the guest isn't an approved guest with a table, or if
 * the template or font can't be read; nothing is written to disk.
 */
export async function createAccessCardPdf(card: AccessCardDetails): Promise<Uint8Array> {
  if (card.status !== GuestStatus.APPROVED || card.tableNumber === null) {
    throw new Error(`Guest ${card.id} isn't approved with a table, so has no access card.`);
  }

  const { template, fontBytes, shaping } = await loadAssets();

  // A fresh in-memory copy for every card; the template itself is never changed.
  const doc = await PDFDocument.load(template, { updateMetadata: false });
  if (doc.getPageCount() !== 2) {
    throw new Error(`The access card template must have two pages, but has ${doc.getPageCount()}.`);
  }

  doc.registerFontkit(fontkit);
  // Embedded whole: pdf-lib's own subsetting drops glyphs for this font. The
  // file is already a small Latin subset (template/fonts/README.md).
  const font = await doc.embedFont(fontBytes, { subset: false });
  const supported = new Set(font.getCharacterSet());
  const page = doc.getPage(accessCard.overlayPageIndex);

  for (const label of accessCard.staticText) {
    draw(page, font, label.text, label.x, label.baseline, label.size);
  }

  // The host's name (under "Guest Type") and the guest's own name.
  for (const [text, field] of [
    [card.hostName, accessCard.hostName],
    [card.name, accessCard.guestName],
  ] as const) {
    const layout = layoutName(shape(printable(tidyName(text), supported), shaping), font, field);
    layout.lines.forEach((line, i) => {
      drawClusters(page, font, line, field.x, layout.baselines[i], layout.size);
    });
  }

  const table = accessCard.tableNumber;
  draw(page, font, `${table.prefix} ${card.tableNumber}`, table.x, table.baseline, table.size);

  return doc.save();
}

/** The card for a guest, naming the host who invited them. Throws if the host can't be found. */
export async function createGuestAccessCard(guest: Guest): Promise<Uint8Array> {
  const host = await getPublicHost(guest.invitedBy);
  if (!host) throw new Error(`Guest ${guest.id}'s host "${guest.invitedBy}" no longer exists.`);
  return createAccessCardPdf({ ...guest, hostName: host.name });
}

/**
 * Emails the guest their access card, whatever its current card status.
 * Resolves once the email has been accepted for delivery and throws if it
 * wasn't, so callers record SENT or FAILED from the outcome. A card that can't
 * be generated counts as a failed send.
 *
 * The card is real; the EMAIL is SIMULATED for now: nothing leaves the server
 * and the send always succeeds. `simulated` lets the UI say so. To send for
 * real, pass `pdf` to Resend as an attachment and return `{ simulated: false }`.
 */
export async function sendAccessCard(guest: Guest): Promise<{ simulated: boolean }> {
  const pdf = await createGuestAccessCard(guest);
  console.info(
    `[simulated email] access card for guest ${guest.id}, table ${guest.tableNumber} (${pdf.length} bytes)`,
  );
  return { simulated: true };
}
