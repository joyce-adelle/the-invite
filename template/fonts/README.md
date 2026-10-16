# Card font

`NotoSans-Bold-Latin.ttf` is the font used for the guest name, table number and
fixed labels on the access card. It stands in for the design's Canva Sans Bold,
which isn't openly licensed.

- **Source:** Noto Sans Bold, Copyright 2022 The Noto Project Authors, under the
  SIL Open Font License 1.1 (`OFL.txt`).
- **Modified:** reduced to Latin, Latin Extended A/B and Additional (which
  includes Yorùbá and Vietnamese letters), combining marks and common
  punctuation, with `pyftsubset` (fonttools). The licence and copyright records
  are kept. Command:

  ```bash
  pyftsubset NotoSans-Bold.ttf --output-file=NotoSans-Bold-Latin.ttf \
    --unicodes="U+0020-007E,U+00A0-024F,U+02B0-02FF,U+0300-036F,U+1E00-1EFF,U+2010-2027,U+2030-203A,U+20AC,U+2122" \
    --layout-features='*' --name-IDs='*' --notdef-outline --glyph-names
  ```

- **Why it's embedded whole:** pdf-lib's built-in subsetting loses glyphs with
  this font, so the card embeds this already-small file as it is.
- **Replacing it:** put another TrueType (`.ttf`) font here and update
  `accessCard.fontPath` in `config/event.ts`. Check long names, and letters such
  as ẹ, ọ and ṣ, on a generated card.
