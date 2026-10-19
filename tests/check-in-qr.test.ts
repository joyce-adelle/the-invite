import "./no-email"; // first: nothing here may send real email

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";

import fontkit from "@pdf-lib/fontkit";
import jsQR from "jsqr";
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
  type PDFPage,
} from "pdf-lib";
import { PNG } from "pngjs";

import { accessCard } from "@/config/event";
import { createAccessCardPdf, sendAccessCard } from "@/lib/access-card";
import {
  checkInPath,
  checkInUrl,
  createCheckInQr,
  generateCheckInToken,
  isCheckInToken,
  safeReturnPath,
} from "@/lib/check-in/check-in";
import { prisma } from "@/lib/prisma";
import type { Guest } from "@/types/guest";
import { fakeEmailClient } from "./fake-email";
import { contentStreams, readCard } from "./pdf-helpers";

// The check-in token, the address it makes, and the QR code on the card (page
// 2 only) and in the email: same address in both, in the right place, and
// without touching what was already on the card.

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWx";
const URL_FOR_TOKEN = `https://invite.example.test/check-in/${TOKEN}`;

/** Reads the QR code out of a picture, as a phone camera would. */
function scan(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): string | null {
  return jsQR(rgba, width, height)?.data ?? null;
}
function scanPng(png: Buffer): string | null {
  const { data, width, height } = PNG.sync.read(png);
  return scan(new Uint8ClampedArray(data), width, height);
}

/** The pictures page 2 of a card adds to the template's own artwork. */
function addedImages(doc: PDFDocument, page: PDFPage) {
  const xobjects = page.node
    .Resources()!
    .lookupMaybe(PDFName.of("XObject"), PDFDict)!;
  return xobjects
    .keys()
    .filter((key) => key.asString().startsWith("/Image-"))
    .map((key) => xobjects.lookup(key) as PDFRawStream);
}

/** The QR picture embedded in a card, read back from its pixels and scanned. */
function scanEmbedded(image: PDFRawStream): string | null {
  const width = Number(image.dict.get(PDFName.of("Width"))!.toString());
  const height = Number(image.dict.get(PDFName.of("Height"))!.toString());
  const rgb = decodePDFRawStream(image).decode();
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba.set([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 255], i * 4);
  }
  return scan(rgba, width, height);
}

describe("the check-in token", () => {
  it("is 24 URL-safe characters, and never repeats", () => {
    const tokens = Array.from({ length: 2000 }, generateCheckInToken);
    assert.equal(new Set(tokens).size, tokens.length);
    for (const token of tokens) assert.match(token, /^[A-Za-z0-9_-]{24}$/);
  });

  it("is random in every position, with nothing recognizable in it", () => {
    const tokens = Array.from({ length: 500 }, generateCheckInToken);
    for (let position = 0; position < 24; position++) {
      assert.ok(
        new Set(tokens.map((t) => t[position])).size > 20,
        `position ${position} varies`,
      );
    }
    assert.ok(
      tokens.every((t) => !/^\d+$/.test(t)),
      "not a plain number",
    );
  });

  it("is recognized by its shape, and nothing else is", () => {
    assert.ok(isCheckInToken(TOKEN));
    for (const bad of [
      "",
      "short",
      `${TOKEN}x`,
      TOKEN.slice(1),
      `${TOKEN.slice(1)}!`,
      "a b c d e f g h i j k l m",
      null,
      undefined,
      42,
      [TOKEN],
    ]) {
      assert.equal(isCheckInToken(bad), false, String(bad));
    }
  });
});

describe("the address in the QR code", () => {
  it("is the app's own address plus the check-in path", () => {
    assert.equal(checkInPath(TOKEN), `/check-in/${TOKEN}`);
    assert.equal(checkInUrl(TOKEN), URL_FOR_TOKEN);
  });

  it("follows BETTER_AUTH_URL, so no domain is written into the code", () => {
    const saved = process.env.BETTER_AUTH_URL;
    try {
      process.env.BETTER_AUTH_URL = "https://party.example.org/";
      assert.equal(
        checkInUrl(TOKEN),
        `https://party.example.org/check-in/${TOKEN}`,
      );
    } finally {
      process.env.BETTER_AUTH_URL = saved;
    }
  });

  it("is refused when the address isn't configured or isn't usable, rather than printing a dead code", () => {
    const saved = process.env.BETTER_AUTH_URL;
    try {
      for (const bad of [
        "",
        "   ",
        "not a url",
        "ftp://example.org",
        "javascript:alert(1)",
      ]) {
        process.env.BETTER_AUTH_URL = bad;
        assert.throws(
          () => checkInUrl(TOKEN),
          /BETTER_AUTH_URL/,
          JSON.stringify(bad),
        );
      }
      delete process.env.BETTER_AUTH_URL;
      assert.throws(() => checkInUrl(TOKEN), /BETTER_AUTH_URL is not set/);
    } finally {
      process.env.BETTER_AUTH_URL = saved;
    }
  });

  it("is the only thing sign-in will return an admin to (no open redirect)", () => {
    assert.equal(safeReturnPath(`/check-in/${TOKEN}`), `/check-in/${TOKEN}`);
    for (const bad of [
      undefined,
      null,
      "",
      "/admin",
      "//evil.example",
      "https://evil.example/check-in/" + TOKEN,
      `/check-in/${TOKEN}/../../admin`,
      `/check-in/${TOKEN}?x=1`,
      `/check-in/${TOKEN}#x`,
      "/check-in/short",
      `/check-in/${TOKEN}x`,
      `check-in/${TOKEN}`,
      `/CHECK-IN/${TOKEN}`,
      [`/check-in/${TOKEN}`],
    ]) {
      assert.equal(safeReturnPath(bad), null, String(bad));
    }
  });
});

describe("the QR picture", () => {
  it("scans back to exactly the address, black on white", async () => {
    const png = await createCheckInQr(URL_FOR_TOKEN);
    assert.equal(scanPng(png), URL_FOR_TOKEN);

    // Pure black and pure white only, and white all round it (the quiet zone).
    const { data, width, height } = PNG.sync.read(png);
    const colours = new Set<string>();
    for (let i = 0; i < data.length; i += 4)
      colours.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    assert.deepEqual([...colours].sort(), ["0,0,0", "255,255,255"]);
    const white = (x: number, y: number) => data[(y * width + x) * 4] === 255;
    for (let i = 0; i < width; i++) {
      for (const edge of [
        0,
        1,
        2,
        3,
        height - 1,
        height - 2,
        height - 3,
        height - 4,
      ]) {
        assert.ok(
          white(i, edge) && white(edge, i),
          "four modules of white on every side",
        );
      }
    }
  });

  it("is identical every time for the same address, and different for another", async () => {
    const [a, b] = await Promise.all([
      createCheckInQr(URL_FOR_TOKEN),
      createCheckInQr(URL_FOR_TOKEN),
    ]);
    assert.ok(a.equals(b));
    const other = await createCheckInQr(
      `https://invite.example.test/check-in/${generateCheckInToken()}`,
    );
    assert.ok(!a.equals(other));
  });
});

describe("the QR code on the card", () => {
  let template: PDFDocument;
  before(async () => {
    template = await PDFDocument.load(readFileSync(accessCard.templatePath));
  });

  const make = (checkInUrl = URL_FOR_TOKEN) =>
    createAccessCardPdf({
      id: "00000000-0000-4000-8000-000000000009",
      name: "Olawale Segun Adeyemi",
      hostName: "Adelusi Family",
      status: "APPROVED",
      tableNumber: 12,
      checkInUrl,
    });

  it("adds one QR picture to page 2, and still has two pages", async () => {
    const { doc, page2 } = await readCard(await make());
    assert.equal(doc.getPageCount(), 2);
    assert.equal(addedImages(doc, page2).length, 1);
  });

  it("leaves page 1 exactly as it was: no content, picture or resource added", async () => {
    const { doc, page1 } = await readCard(await make());
    const original = template.getPage(0);
    assert.deepEqual(
      contentStreams(doc, page1),
      contentStreams(template, original),
    );
    assert.equal(addedImages(doc, page1).length, 0);
    const keys = (page: PDFPage) =>
      page.node
        .Resources()!
        .lookupMaybe(PDFName.of("XObject"), PDFDict)
        ?.keys()
        .map((k) => k.asString())
        .sort();
    assert.deepEqual(keys(page1), keys(original));
  });

  it("scans, from the picture in the PDF itself, to the address", async () => {
    const { doc, page2 } = await readCard(await make());
    assert.equal(scanEmbedded(addedImages(doc, page2)[0]), URL_FOR_TOKEN);
  });

  it("sits in the bottom-right corner of the visible card, inside its edges", async () => {
    const { page2 } = await readCard(await make());
    const box = page2.getCropBox();
    const { size, right, bottom } = accessCard.qr;
    const qr = {
      left: box.x + box.width - right - size,
      right: box.x + box.width - right,
      bottom: box.y + bottom,
      top: box.y + bottom + size,
    };

    assert.ok(qr.left > box.x + box.width / 2, "in the right half");
    assert.ok(
      qr.top < box.y + box.height / 2,
      "in the bottom half (PDF y grows upward)",
    );
    assert.ok(
      qr.right <= box.x + box.width - 5 && qr.bottom >= box.y + 5,
      "a margin from the edge, so a trim or screen edge can't cut it",
    );
    assert.ok(size >= 50, "large enough to scan from a printed card");
  });

  it("is placed on the page by the PDF drawing commands where the config says", async () => {
    const { doc, page2 } = await readCard(await make());
    const box = page2.getCropBox();
    const { size, right, bottom } = accessCard.qr;
    const added = contentStreams(doc, page2).slice(3).join("\n");
    // pdf-lib draws a picture as: move to its lower-left corner (e, f), then scale to a × d.
    const placed = added.match(
      /1 0 0 1 ([\d.-]+) ([\d.-]+) cm\s+1 0 0 1 0 0 cm\s+([\d.-]+) 0 0 ([\d.-]+) 0 0 cm[\s\S]*?\/Image-\S+ Do/,
    );
    assert.ok(placed, "the picture is drawn");
    const [e, f, a, d] = placed.slice(1).map(Number);
    assert.ok(Math.abs(a - size) < 0.01 && Math.abs(d - size) < 0.01);
    assert.ok(Math.abs(e - (box.x + box.width - right - size)) < 0.01);
    assert.ok(Math.abs(f - (box.y + bottom)) < 0.01);
  });

  it("covers none of the card's text", async () => {
    const { page2, drawn } = await readCard(await make());
    const box = page2.getCropBox();
    const { size, right, bottom } = accessCard.qr;
    const qr = {
      left: box.x + box.width - right - size,
      bottom: box.y + bottom,
      top: box.y + bottom + size,
    };

    const metrics = fontkit.create(readFileSync(accessCard.fontPath));
    const widthOf = (text: string, fontSize: number) =>
      (metrics.layout(text).glyphs.reduce((sum, g) => sum + g.advanceWidth, 0) /
        metrics.unitsPerEm) *
      fontSize;

    assert.ok(
      drawn.length >= 12,
      "the card's fixed texts and details are all there",
    );
    for (const run of drawn) {
      const textRight = run.x + widthOf(run.text, run.size);
      const textTop = run.y + run.size;
      const overlapsHorizontally = textRight > qr.left;
      const overlapsVertically =
        run.y - run.size * 0.3 < qr.top && textTop > qr.bottom;
      assert.ok(
        !(overlapsHorizontally && overlapsVertically),
        `"${run.text}" stays clear of the QR code`,
      );
    }
  });

  it("still shows the guest's name, the host and the table, drawn as before", async () => {
    const { drawn } = await readCard(await make());
    const texts = drawn.map((d) => d.text);
    for (const expected of [
      "OLAWALE SEGUN ADEYEMI",
      "ADELUSI FAMILY",
      "TABLE 12",
      "Guest Name",
      "Guest Type",
      "Table No.",
      "THIS CARD ADMITS ONE",
    ]) {
      assert.ok(texts.includes(expected), expected);
    }
  });

  it("carries a different code for a different token, and the same one for the same", async () => {
    const other = `https://invite.example.test/check-in/${generateCheckInToken()}`;
    const [a, b, c] = await Promise.all([make(), make(), make(other)]);
    const scanned = async (pdf: Uint8Array) => {
      const { doc, page2 } = await readCard(pdf);
      return scanEmbedded(addedImages(doc, page2)[0]);
    };
    assert.equal(await scanned(a), await scanned(b));
    assert.equal(await scanned(c), other);
  });
});

describe("the QR code in the email", () => {
  const guest = (overrides: Partial<Guest> = {}): Guest => ({
    id: "00000000-0000-4000-8000-000000000010",
    name: "Ada Lovelace",
    normalizedName: "adalovelace",
    email: "ada@example.com",
    invitedBy: "test-qr",
    status: "APPROVED",
    tableNumber: 4,
    cardStatus: "NOT_SENT",
    createdAt: new Date(),
    approvedAt: new Date(),
    cardSentAt: null,
    cancelledAt: null,
    checkInToken: TOKEN,
    checkedInAt: null,
    checkedInBy: null,
    ...overrides,
  });

  // The email names the guest's host, which comes from the database: a temporary one, removed afterwards.
  before(async () => {
    await prisma.host.deleteMany({ where: { id: "test-qr" } });
    await prisma.host.create({
      data: { id: "test-qr", name: "QR Family", capacity: 5 },
    });
  });
  after(async () => {
    await prisma.host.deleteMany({ where: { id: "test-qr" } });
    await prisma.$disconnect();
  });

  it("is shown inline, with the PDF still attached", async () => {
    const { client, calls } = fakeEmailClient();
    await sendAccessCard(guest(), { client });
    const { payload } = calls[0];

    assert.equal(payload.attachments?.length, 2);
    const [pdf, qr] = payload.attachments!;
    assert.match(pdf.filename, /\.pdf$/);
    assert.equal(
      pdf.contentId,
      undefined,
      "the card itself is an ordinary attachment",
    );
    assert.equal(qr.contentType, "image/png");
    assert.ok(qr.contentId);
    assert.match(payload.html, new RegExp(`<img src="cid:${qr.contentId}"`));
    assert.match(payload.html, /alt="Your check-in QR code"/);
  });

  it("holds the same address as the QR code on the PDF in the same email", async () => {
    const { client, calls } = fakeEmailClient();
    await sendAccessCard(guest(), { client });
    const [pdf, qr] = calls[0].payload.attachments!;

    const { doc, page2 } = await readCard(new Uint8Array(pdf.content));
    const onCard = scanEmbedded(addedImages(doc, page2)[0]);
    const inEmail = scanPng(qr.content);
    assert.equal(onCard, URL_FOR_TOKEN);
    assert.equal(inEmail, onCard, "one address, in both");
  });

  it("tells the guest briefly that they can show the card or the email's code at the event, in words that never change", async () => {
    const first = fakeEmailClient();
    const second = fakeEmailClient();
    await sendAccessCard(guest(), { client: first.client });
    await sendAccessCard(guest({ tableNumber: 9 }), { client: second.client });

    for (const body of [
      first.calls[0].payload.text,
      first.calls[0].payload.html,
    ]) {
      assert.match(
        body,
        /show the QR code on your attached card, or the one in this email, at the entrance/,
      );
      assert.match(
        body,
        /Each card admits one guest/,
        "the earlier wording is still there",
      );
    }
    // Only the table differs between the two emails.
    assert.equal(
      first.calls[0].payload.text.replace(/Table \d+/g, "Table N"),
      second.calls[0].payload.text.replace(/Table \d+/g, "Table N"),
    );
  });

  it("never prints the check-in address in the text of the email", async () => {
    const { client, calls } = fakeEmailClient();
    await sendAccessCard(guest(), { client });
    const { text, html } = calls[0].payload;
    assert.ok(
      !text.includes(TOKEN) && !html.includes(TOKEN),
      "the token lives only in the pictures",
    );
  });
});
