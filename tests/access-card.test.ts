import "./no-email"; // first: nothing here may send real email
import "dotenv/config";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { after, before, describe, it } from "node:test";

import fontkit from "@pdf-lib/fontkit";
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  type PDFPage,
} from "pdf-lib";

import { accessCard } from "@/config/event";
import {
  createAccessCardPdf,
  createGuestAccessCard,
  sendAccessCard,
  type AccessCardDetails,
} from "@/lib/access-card";
import { prisma } from "@/lib/prisma";
import type { Guest } from "@/types/guest";
import { accepted, fakeEmailClient, rejected } from "./fake-email";
import { contentStreams, readCard, type Drawn } from "./pdf-helpers";

// Generates real cards from the real template and reads them back: which pages
// there are, what is on them, and that the source files are left alone.

const details = (overrides: Partial<AccessCardDetails> = {}): AccessCardDetails => ({
  id: "00000000-0000-4000-8000-000000000001",
  name: "Felicia Adelusi",
  hostName: "Adelusi Family",
  status: "APPROVED",
  tableNumber: 7,
  ...overrides,
});
const makeCard = (overrides: Partial<AccessCardDetails> = {}) => createAccessCardPdf(details(overrides));

// Combining marks and invisible characters, spelled out so they can be seen in this file.
const GRAVE = String.fromCodePoint(0x0300);
const ACUTE = String.fromCodePoint(0x0301);
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const BELL = String.fromCodePoint(0x0007);
const cp = (...codes: number[]) => String.fromCodePoint(...codes);

const sha = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

// --- Reading a PDF back ---

/** Everything a page draws, including the content of the artwork it references, as one fingerprint. */
function fingerprint(doc: PDFDocument, page: PDFPage, onlyOriginal = false): string {
  const parts: string[] = [];
  const streams = contentStreams(doc, page);
  // pdf-lib wraps the original content of a card as: "q", original, "Q", then what is added.
  // The template itself has just the original.
  parts.push(...(onlyOriginal ? [streams.length === 1 ? streams[0] : streams[1]] : streams));

  const visit = (resources: PDFDict | undefined) => {
    const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    for (const key of xobjects?.keys() ?? []) {
      const xobject = xobjects!.lookup(key) as PDFRawStream;
      parts.push(`${key.asString()}:${sha(Buffer.from(xobject.contents))}`);
      visit(xobject.dict.lookupMaybe(PDFName.of("Resources"), PDFDict));
    }
  };
  visit(page.node.Resources());
  return parts.join("\n");
}

// Loaded in `before`: where things should land, in PDF coordinates.
let template: PDFDocument;
let box: ReturnType<PDFPage["getCropBox"]>;
const yOf = (baseline: number) => box.y + box.height - baseline;
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

// Measures text in the card font, to prove names stay inside their areas.
const metrics = fontkit.create(readFileSync(accessCard.fontPath));
const widthOf = (text: string, size: number) =>
  (metrics.layout(text).glyphs.reduce((sum, glyph) => sum + glyph.advanceWidth, 0) / metrics.unitsPerEm) * size;

const isMark = (text: string) => /^\p{M}$/u.test(text);
const label = (text: string) => accessCard.staticText.find((l) => l.text === text)!;

// The card has two name fields with the same rules: the guest's own name
// first, then the host's name under "Guest Type". `above` and `below` are the
// labels each one sits between.
const fields = [
  {
    title: "guest name",
    cfg: accessCard.guestName,
    set: (text: string): Partial<AccessCardDetails> => ({ name: text }),
    above: "Guest Name",
    below: "Guest Type",
  },
  {
    title: "host name (under “Guest Type”)",
    cfg: accessCard.hostName,
    set: (text: string): Partial<AccessCardDetails> => ({ hostName: text }),
    above: "Guest Type",
    below: "Table No.",
  },
] as const;
type Field = (typeof fields)[number];

/** The lines of a name field, top to bottom: what is drawn at its left edge between its two labels. */
const linesOf = (drawn: Drawn[], field: Field) =>
  drawn
    .filter((d) => near(d.x, box.x + field.cfg.x) && !isMark(d.text))
    .filter((d) => d.y < yOf(label(field.above).baseline) && d.y > yOf(label(field.below).baseline))
    .sort((a, b) => b.y - a.y);

/** A name at full size, on one line. */
function oneLine(drawn: Drawn[], field: Field) {
  const lines = linesOf(drawn, field);
  assert.equal(lines.length, 1, "on one line");
  assert.ok(near(lines[0].y, yOf(field.cfg.baseline)), "at the field's position");
  return lines[0];
}

/**
 * Builds a name of a given kind for a field from real widths in the card font,
 * a letter at a time so it lands inside the (sometimes narrow) range wanted.
 */
function sampleName(field: Field, kind: "shrinks" | "two-lines" | "too-long") {
  const source = "OLUWASEUN ADEBAYO OKONKWO CHUKWUEMEKA BABATUNDE OLAMIDE FOLASADE IBRAHIM ADEYEMI NWACHUKWU";
  const { size, minSize, maxWidth } = field.cfg;
  if (kind === "too-long") return `${source} ${source}`;
  for (let length = 1; length <= source.length; length++) {
    const text = source.slice(0, length);
    if (text.endsWith(" ")) continue;
    const fitsOneLine = widthOf(text, minSize) <= maxWidth;
    if (kind === "shrinks" && widthOf(text, size) > maxWidth && fitsOneLine) return text;
    if (kind === "two-lines" && !fitsOneLine) return text;
  }
  throw new Error(`no ${kind} sample for ${field.title}`);
}

describe("access card PDF", () => {
  before(async () => {
    template = await PDFDocument.load(readFileSync(accessCard.templatePath));
    box = template.getPage(accessCard.overlayPageIndex).getCropBox();
  });

  describe("structure", () => {
    it("has exactly two pages, the same size as the template", async () => {
      const { doc } = await readCard(await makeCard());
      assert.equal(doc.getPageCount(), 2);
      for (const index of [0, 1]) {
        assert.deepEqual(doc.getPage(index).getSize(), template.getPage(index).getSize());
        assert.deepEqual(doc.getPage(index).getCropBox(), template.getPage(index).getCropBox());
      }
    });

    it("leaves page 1 completely unchanged: same content, same artwork, nothing added", async () => {
      const { doc, page1, drawn } = await readCard(await makeCard());
      assert.equal(fingerprint(doc, page1), fingerprint(template, template.getPage(0)));
      assert.equal(contentStreams(doc, page1).length, 1, "no content was added to page 1");
      assert.ok(drawn.every((d) => d.y < box.y + box.height), "all drawing is on page 2");
    });

    it("keeps page 2's original artwork and only adds to it", async () => {
      const { doc, page2 } = await readCard(await makeCard());
      assert.equal(fingerprint(doc, page2, true), fingerprint(template, template.getPage(1), true));
    });

    it("never modifies or writes to the source files", async () => {
      const files = [accessCard.templatePath, accessCard.fontPath];
      const state = () => ({
        hashes: files.map((file) => sha(readFileSync(file))),
        listing: ["template", "template/fonts"].map((dir) =>
          readdirSync(dir)
            .filter((name) => name !== ".DS_Store") // macOS adds this to any folder it opens
            .map((name) => `${dir}/${name}:${statSync(`${dir}/${name}`).size}`),
        ),
      });
      const before = state();
      await Promise.all(["A", "B", "C"].map((name) => makeCard({ name })));
      assert.deepEqual(state(), before);
    });

  });

  describe("what is on page 2", () => {
    it("shows the guest's own name first, the host's name under “Guest Type”, and the table", async () => {
      const { drawn } = await readCard(await makeCard({ hostName: "Adelusi Family", name: "Felicia Adelusi", tableNumber: 7 }));

      assert.equal(oneLine(drawn, fields[0]).text, "FELICIA ADELUSI");
      assert.equal(oneLine(drawn, fields[1]).text, "ADELUSI FAMILY");

      const table = drawn.find((d) => d.text.startsWith("TABLE"))!;
      assert.equal(table.text, "TABLE 7");
      assert.ok(near(table.x, box.x + accessCard.tableNumber.x));
      assert.ok(near(table.y, yOf(accessCard.tableNumber.baseline)));
      assert.ok(near(table.size, accessCard.tableNumber.size));
    });

    it("sets each name at its configured size and position", async () => {
      const { drawn } = await readCard(await makeCard({ hostName: "Ada", name: "Bola" }));
      for (const field of fields) {
        const line = oneLine(drawn, field);
        assert.ok(near(line.x, box.x + field.cfg.x));
        assert.ok(near(line.size, field.cfg.size));
      }
    });

    it("keeps the guest's name and the host's name apart: each one only in its own place", async () => {
      const { drawn } = await readCard(await makeCard({ hostName: "Okafor Family", name: "Ngozi Eze" }));
      assert.equal(oneLine(drawn, fields[0]).text, "NGOZI EZE");
      assert.equal(oneLine(drawn, fields[1]).text, "OKAFOR FAMILY");
      assert.equal(drawn.filter((d) => d.text.includes("NGOZI")).length, 1);
      assert.equal(drawn.filter((d) => d.text.includes("OKAFOR")).length, 1);
    });

    it("formats the actual table number consistently (TABLE 1, TABLE 10, ...)", async () => {
      for (const table of [1, 2, 9, 10, 36, 80, 9001]) {
        const { drawn } = await readCard(await makeCard({ tableNumber: table }));
        assert.deepEqual(
          drawn.filter((d) => d.text.startsWith("TABLE")).map((d) => d.text),
          [`TABLE ${table}`],
        );
      }
    });

    it("draws the fixed labels from the design too, including the one for the guest's name", async () => {
      const { drawn } = await readCard(await makeCard());
      for (const fixed of accessCard.staticText) {
        const found = drawn.find((d) => d.text === fixed.text);
        assert.ok(found, `"${fixed.text}" is on the card`);
        assert.ok(near(found.x, box.x + fixed.x) && near(found.y, yOf(fixed.baseline)) && near(found.size, fixed.size));
      }
      assert.ok(drawn.some((d) => d.text === "Guest Name"));
    });
  });

  describe("layout", () => {
    // Top to bottom: each label, where its answer sits, and where its last answer line sits.
    const blocks = () => {
      const at = (text: string) => label(text).baseline;
      return [
        { name: "Guest Name", label: at("Guest Name"), answer: accessCard.guestName.baseline, last: accessCard.guestName.baseline },
        { name: "Guest Type", label: at("Guest Type"), answer: accessCard.hostName.baseline, last: accessCard.hostName.baseline },
        { name: "Table No.", label: at("Table No."), answer: accessCard.tableNumber.baseline, last: accessCard.tableNumber.baseline },
        { name: "Location", label: at("Location"), answer: at("AB FOUNDATION CIVIC CENTER,"), last: at("ADO-EKITI") },
        { name: "Colour of the day", label: at("Colour of the day"), answer: at("WHITE AND OFI"), last: at("WHITE AND OFI") },
      ];
    };

    it("puts the guest's name first, with the other fields in order below it", () => {
      const labels = blocks().map((b) => b.label);
      assert.deepEqual([...labels].sort((a, b) => a - b), labels, "labels run top to bottom");
      assert.equal(blocks()[0].name, "Guest Name");
      assert.ok(accessCard.guestName.baseline < accessCard.hostName.baseline);
      assert.ok(accessCard.hostName.baseline < accessCard.tableNumber.baseline);
    });

    it("keeps every label the same distance from its answer as in the example card", () => {
      const expected: Record<string, number> = {
        "Guest Name": 9.19,
        "Guest Type": 9.19,
        "Table No.": 9.87,
        Location: 10.98,
        "Colour of the day": 10.57,
      };
      for (const block of blocks()) {
        assert.ok(Math.abs(block.answer - block.label - expected[block.name]) < 0.05, `${block.name} label to answer`);
      }
    });

    it("spaces the fields evenly: the gap from each answer to the next label is the same all the way down", () => {
      const all = blocks();
      const gaps = all.slice(1).map((block, i) => block.label - all[i].last);
      assert.equal(gaps.length, 4);
      assert.ok(Math.max(...gaps) - Math.min(...gaps) < 0.1, `gaps ${gaps.map((g) => g.toFixed(2)).join(", ")}`);
      // Close to the example card's own gaps (14.8 to 15.9), only slightly tighter to fit the extra field.
      for (const gap of gaps) assert.ok(gap > 13 && gap < 16, `gap ${gap.toFixed(2)}`);
    });

    it("keeps the last answer clear of the footer", () => {
      const footer = label("THIS CARD ADMITS ONE");
      const last = blocks().at(-1)!;
      const capHeight = 0.714;
      assert.ok(last.answer + 0.25 * 7.45 < footer.baseline - capHeight * footer.size - 3, "descenders clear the footer line");
    });

    it("leaves the footer where the example card has it", () => {
      const footer = label("THIS CARD ADMITS ONE");
      assert.ok(near(footer.x, 86.93) && near(footer.baseline, 146.08));
    });
  });

  for (const field of fields) {
    describe(`names of different lengths: ${field.title}`, () => {
      const { maxWidth, minSize, size, twoLines } = field.cfg;

      it("sets a short name at full size", async () => {
        const { drawn } = await readCard(await makeCard(field.set("Al")));
        assert.ok(near(oneLine(drawn, field).size, size));
      });

      it("shrinks a longer name to fit on one line, without losing any of it", async () => {
        const name = sampleName(field, "shrinks");
        const { drawn } = await readCard(await makeCard(field.set(name)));
        const line = oneLine(drawn, field);
        assert.equal(line.text, name);
        assert.ok(line.size < size && line.size >= minSize - 0.001);
        assert.ok(widthOf(line.text, line.size) <= maxWidth + 0.01);
      });

      it("puts a name that is too long for one line on two, without losing any of it", async () => {
        const name = sampleName(field, "two-lines");
        const { drawn } = await readCard(await makeCard(field.set(name)));
        const lines = linesOf(drawn, field);

        assert.equal(lines.length, 2);
        assert.equal(lines.map((l) => l.text).join(" "), name, "split between words, nothing lost");
        for (const line of lines) {
          assert.ok(near(line.size, minSize));
          assert.ok(widthOf(line.text, line.size) <= maxWidth + 0.01);
        }
        assert.ok(near(lines[0].y, yOf(twoLines.baseline)));
        assert.ok(near(lines[0].y - lines[1].y, twoLines.lineHeight));
      });

      it("keeps two lines clear of the labels above and below", async () => {
        const { drawn } = await readCard(await makeCard(field.set(sampleName(field, "two-lines"))));
        const [, second] = linesOf(drawn, field);
        const capHeight = 0.714;
        const above = label(field.above);
        const below = label(field.below);
        const firstTop = twoLines.baseline - capHeight * minSize;
        const secondBottom = box.y + box.height - second.y + 0.25 * minSize; // allow for descenders
        const belowTop = below.baseline - capHeight * below.size;
        assert.ok(firstTop > above.baseline + 1, `first line clears "${field.above}" (${firstTop} > ${above.baseline})`);
        assert.ok(secondBottom < belowTop - 1, `second line clears "${field.below}" (${secondBottom} < ${belowTop})`);
      });

      it("shortens a name with an ellipsis on the second line only when two lines aren't enough", async () => {
        const name = sampleName(field, "too-long");
        const { drawn } = await readCard(await makeCard(field.set(name)));
        const lines = linesOf(drawn, field);
        assert.equal(lines.length, 2);
        assert.ok(lines[0].text.length > 0 && name.startsWith(lines[0].text));
        assert.ok(lines[1].text.endsWith("…"));
        for (const line of lines) assert.ok(widthOf(line.text, line.size) <= maxWidth + 0.01);
      });

      it("breaks a single word that is too long for any line", async () => {
        const { drawn } = await readCard(await makeCard(field.set("Wolfe".repeat(40))));
        const lines = linesOf(drawn, field);
        assert.equal(lines.length, 2);
        assert.ok(lines[1].text.endsWith("…"));
        for (const line of lines) assert.ok(widthOf(line.text, line.size) <= maxWidth + 0.01);
      });

      it("stays fast and inside its area for an absurdly long name", async () => {
        const started = Date.now();
        const { drawn } = await readCard(await makeCard(field.set("Abcdefghij ".repeat(50_000))));
        assert.ok(Date.now() - started < 3000, "generated in a few seconds at most");
        const lines = linesOf(drawn, field);
        assert.equal(lines.length, 2);
        assert.ok(lines[1].text.endsWith("…"));
      });

      it("keeps every name inside its area, however extreme", async () => {
        const names = ["W".repeat(300), "A B ".repeat(100), "i", "M", "Ọláwálé Ẹ̀bùn-Ọ̀rẹ́ ".repeat(8)];
        for (const name of names) {
          const { drawn } = await readCard(await makeCard(field.set(name)));
          const lines = linesOf(drawn, field);
          assert.ok(lines.length >= 1 && lines.length <= 2, "one or two lines");
          for (const line of lines) {
            assert.ok(line.size >= minSize - 0.001, "never smaller than the minimum");
            assert.ok(widthOf(line.text, line.size) <= maxWidth + 0.01, `"${name.slice(0, 20)}…" fits`);
          }
        }
      });
    });

    describe(`tidying: ${field.title}`, () => {
      it("uses capitals, one space between words, and no control or zero-width characters", async () => {
        const dirty = ["  ada", ZERO_WIDTH_SPACE, "   love", BELL, "lace \n "].join("");
        const { drawn } = await readCard(await makeCard(field.set(dirty)));
        assert.equal(oneLine(drawn, field).text, "ADA LOVELACE");
      });

      it("prints characters the font doesn't have as '?' rather than blank boxes, without failing", async () => {
        const { drawn } = await readCard(await makeCard(field.set("李明 Wang 😀")));
        assert.equal(oneLine(drawn, field).text, "?? WANG ?");
      });

      it("prints precomposed Yorùbá letters as they are", async () => {
        const { drawn } = await readCard(await makeCard(field.set("Ọláwálé Adéyẹmí")));
        assert.equal(oneLine(drawn, field).text, "ỌLÁWÁLÉ ADÉYẸMÍ");
      });

      it("places tone marks on letters with a dot below, above the line and inside the name", async () => {
        // "ṣẹ̀gun ọ́lá": the tone marks are separate characters on top of the dotted letters.
        const name = cp(0x1e63, 0x1eb9, 0x300) + "gun " + cp(0x1ecd, 0x301) + "l" + cp(0xe1);
        const { drawn } = await readCard(await makeCard(field.set(name)));

        assert.equal(oneLine(drawn, field).text, cp(0x1e62, 0x1eb8) + "GUN " + cp(0x1ecc) + "L" + cp(0xc1));
        const marks = drawn.filter((d) => d.text === GRAVE || d.text === ACUTE);
        assert.deepEqual(marks.map((m) => m.text), [GRAVE, ACUTE]);
        for (const mark of marks) {
          assert.ok(mark.y > yOf(field.cfg.baseline), "a tone mark sits above the baseline");
          assert.ok(mark.x > box.x + field.cfg.x, "and inside the name");
        }
      });

      it("keeps a mark with its letter when a long name is shortened", async () => {
        const { drawn } = await readCard(await makeCard(field.set(cp(0x1ecc, 0x301).repeat(60))));
        const letters = linesOf(drawn, field).flatMap((line) => [...line.text]).filter((c) => c === cp(0x1ecc));
        const marks = drawn.filter((d) => d.text === ACUTE);
        // One mark for every letter that is left, and none for the ellipsis.
        assert.ok(letters.length > 0);
        assert.equal(marks.length, letters.length);
      });
    });
  }

  describe("who gets a card", () => {
    it("only approved guests with a table", async () => {
      for (const status of ["PENDING", "REJECTED", "CANCELLED"] as const) {
        await assert.rejects(makeCard({ status }), /isn't approved/);
      }
      await assert.rejects(makeCard({ tableNumber: null }), /isn't approved with a table/);
    });
  });

  describe("generating many cards", () => {
    it("makes independent cards: each has only its own guest and host", async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          makeCard({ name: `Guest Number ${i}`, hostName: `Family Number ${i}`, tableNumber: i + 1 }),
        ),
      );
      const cards = await Promise.all(results.map(readCard));
      cards.forEach(({ doc, drawn }, i) => {
        assert.equal(doc.getPageCount(), 2);
        assert.equal(oneLine(drawn, fields[0]).text, `GUEST NUMBER ${i}`);
        assert.equal(oneLine(drawn, fields[1]).text, `FAMILY NUMBER ${i}`);
        assert.deepEqual(drawn.filter((d) => d.text.startsWith("TABLE")).map((d) => d.text), [`TABLE ${i + 1}`]);
        const text = drawn.map((d) => d.text).join("|");
        assert.ok(!text.includes(`GUEST NUMBER ${(i + 1) % 20}`), "no other guest's name");
      });
    });

    it("returns bytes that are a PDF, with a sensible size", async () => {
      const pdf = await makeCard();
      assert.ok(pdf instanceof Uint8Array);
      assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), "%PDF-");
      assert.ok(pdf.length > 100_000 && pdf.length < 2_000_000, `${pdf.length} bytes`);
    });
  });
});

// The card for a stored guest names their host, which comes from the database.
// These make a temporary host and remove it afterwards, so they only run
// against a local database.
const url = process.env.DATABASE_URL ?? "";
const isLocal = /^postgres(ql)?:\/\/[^@/]*@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

describe("card for a stored guest", { skip: !isLocal && "DATABASE_URL is not a local database" }, () => {
  const HOST_ID = "test-card";
  const guest = (overrides: Partial<Guest> = {}): Guest => ({
    id: "00000000-0000-4000-8000-000000000002",
    name: "Ada Lovelace",
    normalizedName: "adalovelace",
    email: "ada@example.com",
    invitedBy: HOST_ID,
    status: "APPROVED",
    tableNumber: 4,
    cardStatus: "NOT_SENT",
    createdAt: new Date(),
    approvedAt: new Date(),
    cardSentAt: null,
    cancelledAt: null,
    ...overrides,
  });
  const clean = async () => {
    await prisma.table.deleteMany({ where: { hostId: HOST_ID } });
    await prisma.host.deleteMany({ where: { id: HOST_ID } });
  };

  before(async () => {
    template = await PDFDocument.load(readFileSync(accessCard.templatePath));
    box = template.getPage(accessCard.overlayPageIndex).getCropBox();
    await clean();
    await prisma.host.create({
      data: { id: HOST_ID, name: "Lovelace Family", capacity: 10, tables: { create: [{ number: 9101, capacity: 10 }] } },
    });
  });
  after(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("shows the guest's own name and the host's name from the database", async () => {
    const { drawn } = await readCard(await createGuestAccessCard(guest()));
    assert.equal(oneLine(drawn, fields[0]).text, "ADA LOVELACE");
    assert.equal(oneLine(drawn, fields[1]).text, "LOVELACE FAMILY");
  });

  it("follows a host being renamed", async () => {
    await prisma.host.update({ where: { id: HOST_ID }, data: { name: "Byron Family" } });
    const { drawn } = await readCard(await createGuestAccessCard(guest()));
    assert.equal(oneLine(drawn, fields[1]).text, "BYRON FAMILY");
    await prisma.host.update({ where: { id: HOST_ID }, data: { name: "Lovelace Family" } });
  });

  it("fails clearly when the host can't be found, so the send is recorded as failed", async () => {
    const { client, calls } = fakeEmailClient();
    await assert.rejects(createGuestAccessCard(guest({ invitedBy: "test-missing" })), /no longer exists/);
    await assert.rejects(sendAccessCard(guest({ invitedBy: "test-missing" }), { client }), /no longer exists/);
    assert.equal(calls.length, 0, "nothing is sent without a card");
  });

  describe("emailing the card", () => {
    // These use a stand-in mail client, so nothing is ever really sent.
    process.env.EMAIL_FROM ??= "TheInvite <invites@example.com>";

    it("emails the guest a warm note with their details and their card as a PDF attachment", async () => {
      const { client, calls } = fakeEmailClient(accepted("mail-1"));
      assert.deepEqual(await sendAccessCard(guest({ tableNumber: 4 }), { client }), { id: "mail-1" });

      assert.equal(calls.length, 1);
      const { payload } = calls[0];
      assert.equal(payload.to, "ada@example.com");
      assert.equal(payload.subject, "Your access card for Ìyá Opeke @ 80");

      // Everything the email must say: who, what, invited by, table, and keep the card.
      for (const body of [payload.text, payload.html]) {
        assert.match(body, /Dear Ada Lovelace,/);
        assert.match(body, /delighted to welcome you to Ìyá Opeke @ 80/);
        assert.match(body, /Guest Type/);
        assert.match(body, /Lovelace Family/);
        assert.match(body, /Table 4/);
        assert.match(body, /keep it safe and bring it with you/);
        assert.match(body, /admits one guest/);
      }
      assert.match(payload.text, /Guest Type: Lovelace Family\nYour table: Table 4/);

      assert.equal(payload.attachments?.length, 1);
      const [attachment] = payload.attachments!;
      assert.equal(attachment.filename, "access-card-ada-lovelace.pdf");
      assert.equal(attachment.content.subarray(0, 5).toString(), "%PDF-");
    });

    it("attaches the real card: two pages, with this guest's name, host and table", async () => {
      const { client, calls } = fakeEmailClient();
      await sendAccessCard(guest({ tableNumber: 12 }), { client });

      const { doc, drawn } = await readCard(new Uint8Array(calls[0].payload.attachments![0].content));
      assert.equal(doc.getPageCount(), 2);
      assert.equal(oneLine(drawn, fields[0]).text, "ADA LOVELACE");
      assert.equal(oneLine(drawn, fields[1]).text, "LOVELACE FAMILY");
      assert.ok(drawn.some((d) => d.text === "TABLE 12"));
    });

    it("uses exactly the same wording whether it is the first send, a resend or after a table change", async () => {
      const { client, calls } = fakeEmailClient();
      const ada = guest({ tableNumber: 5 });
      await sendAccessCard(ada, { client }); // approval
      await sendAccessCard(ada, { client }); // admin resend
      await sendAccessCard({ ...ada, cardStatus: "FAILED", cardSentAt: new Date() }, { client }); // after a failed send

      const [first, ...others] = calls.map((c) => c.payload);
      for (const other of others) {
        assert.equal(other.subject, first.subject);
        assert.equal(other.text, first.text);
        assert.equal(other.html, first.html);
      }
    });

    it("changes only the details when the table changes: the same wording, the new table", async () => {
      const { client, calls } = fakeEmailClient();
      await sendAccessCard(guest({ tableNumber: 2 }), { client });
      await sendAccessCard(guest({ tableNumber: 4 }), { client });

      const [before, after] = calls.map((c) => c.payload);
      assert.match(before.text, /Table 2/);
      assert.match(after.text, /Table 4/);
      assert.equal(after.text.replace("Table 4", "Table 2"), before.text);
      assert.equal(after.subject, before.subject);
    });

    it("uses the same idempotency key prefix, with a unique part so a resend is never swallowed", async () => {
      const { client, calls } = fakeEmailClient();
      await sendAccessCard(guest(), { client });
      await sendAccessCard(guest(), { client });
      const keys = calls.map((c) => c.options.idempotencyKey);
      for (const key of keys) assert.match(key, /^access-card\/00000000-0000-4000-8000-000000000002-[0-9a-f-]{36}$/);
      assert.notEqual(keys[0], keys[1]);
    });

    it("can't be made to inject HTML or odd file names through a guest's name", async () => {
      const { client, calls } = fakeEmailClient();
      await sendAccessCard(guest({ name: `<script>alert(1)</script> "O'Brien" & Co ../../x` }), { client });
      const { html, text, attachments } = calls[0].payload;

      assert.ok(!html.includes("<script"), "no raw tag in the HTML");
      assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &quot;O&#39;Brien&quot; &amp; Co/);
      assert.match(text, /^Dear <script>/, "the plain-text part is plain text, not HTML");
      assert.match(attachments![0].filename, /^access-card-[a-z0-9-]+\.pdf$/);
    });

    it("makes a readable attachment name from names with accents", async () => {
      const { client, calls } = fakeEmailClient();
      await sendAccessCard(guest({ name: "Ọláwálé Ṣẹ̀gun" }), { client });
      assert.equal(calls[0].payload.attachments![0].filename, "access-card-olawale-segun.pdf");
    });

    it("fails, so the card is recorded as FAILED, when Resend refuses the email", async () => {
      const { client } = fakeEmailClient(rejected(403, "invalid_from_address", "The domain is not verified"));
      await assert.rejects(sendAccessCard(guest(), { client }), /The domain is not verified/);
    });

    it("fails, so the card is recorded as FAILED, when email isn't configured", async () => {
      // No client given: the real one, with no API key (the tests blank it). Nothing is sent.
      await assert.rejects(sendAccessCard(guest()), /RESEND_API_KEY is not set/);
    });

    it("sends nothing for pending, rejected or cancelled guests, or one without a table", async () => {
      const { client, calls } = fakeEmailClient();
      for (const status of ["PENDING", "REJECTED", "CANCELLED"] as const) {
        await assert.rejects(sendAccessCard(guest({ status }), { client }), /isn't approved/, status);
      }
      await assert.rejects(sendAccessCard(guest({ tableNumber: null }), { client }), /isn't approved with a table/);
      assert.equal(calls.length, 0);
    });
  });
});
