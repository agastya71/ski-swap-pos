; ski-swap-pos item label — BARCODE mode (v11.1; emitted geometry = v10, 2026-10-14)
;
; THIS FILE IS THE LABEL LAYOUT. It is re-read from disk on EVERY print: edit
; it, print again — no recompile, no service restart.
;
; ─── HOW EACH COORDINATE IS COMPUTED — verify any change against this ────────
;
; Units: dots at 203 dpi (1 dot ≈ 0.125 mm; 20 dots ≈ 2.5 mm).
;
; MEDIA WINDOW (measured by printing `scripts/label_ruler.py` — fine probe
; 2026-10-15; the Sept-27 zones were left 112..136 / right 712..762):
;   left edge  ≈ 115
;   right edge ≈ 716
;   top edge   ≈ 12 dots below format y=0 (real ink must start at y ≥ ~14)
;   tag height ≈ 203 dots (≈1" tall)
;
; HORIZONTAL (x) — origin and edge carry the v10 whole-label shift (−20):
;   left_origin = 147 (the 2026-09-27 calibration's content origin, chosen
;               inside the measured edge zone as edge + ~31-dot margin)
;               + (−20)  = 127.  Margin over today's edge: 127 − 115 = 12
;               dots ≈ 1.5 mm. To move the column: change THIS value; keep
;               it ≥ ~10 dots inside the left edge (115).
;   right_edge  = 723 (2026-09-27 content edge) + (−20) = 703.
;   bars' ink ends at right_edge − bars_right_nudge = 703 − 10 = 693
;               (v9.3: ~10 dots of air so bars don't read "truncated").
;   barcode_x (computed per item — shown for verification) = (right_edge
;               + 20 − nudge) − field, where field = 20 (lead quiet) + ink
;               + 20 (trail quiet), ink = symbols × 22 (11 modules/char ×
;               2-dot module). Symbols: 1 start + ⌈digits/2⌉ pairs + 2 extra
;               if odd count (subset-B switch + digit) + 1 check + 1 stop;
;               alphanumeric text = 1 + chars + 2.
;               5-digit code: 7 syms → ink 154 → field 194 → bx = 519.
;   id_block_w (computed) = (right_edge − nudge) − barcode_x = 713 − 519 = 174.
;   price_col_x (computed) = max(barcode_x, left_origin + 180) — the floor
;               keeps the flag from ever sliding under the seller code.
;   price_x (computed, donate items only) = price_col_x + flag_d_width (14)
;               + flag_gap (26) = col + 40.
;   pw (^PW, computed) = right_edge = 703.
;
; VERTICAL (y) — format y=0 sits ≈12 dots ABOVE the media top; the v7
; whole-label shift (+4) is already inside every y below:
;   y_band_top = 14 (first safe ink row over the top edge) + 4 = 18.
;               Barcode ink runs y_band_top … + barcode_height → 18..64.
;   y_id       = 86 + 4 = 90 — under the bars; gap = 90 − 64 = 26 dots
;               (v9 moved the row up 7 from 97 for more air above the price).
;   y_price (barcode mode) = 120 + 4 = 124 — v6 directive "the row with
;               Y = 120"; the price joins the seller here.
;   y_price (text mode)    = 80 + 4 = 84 — the text flow start (set in
;               label_item_text.zpl).
;   y_event    = 33 + 4 = 37 — the price's OLD band slot (v5): event name
;               beside the barcode, above the price; costs no flow row.
;   y_text_code (text mode) = 34 + 4 = 38 — the ×2 band-code cell
;               (56 tall) tops there; set in label_item_text.zpl.
;   lower rows start at y_price and step +row_pitch (27): 124 → 151 → 178
;               (→ 205). Rows take no pitch when the field is empty/absent.
;   fit guard: a row prints only while row_y + row_ink (24) ≤ label_length
;               (203) — the 205 row therefore drops rather than clips.
;
; CHAR CAPS: description truncates to desc_max_chars (20 chars); every other
;   field to max_field_chars (28 chars — 28 × 15-dot OCR-B advance ≈ 420..504
;   dots, within the ~576-dot content width).
;
; ─── HOW IT WORKS ────────────────────────────────────────────────────────────
;   `; @name value` lines set the geometry. The values ARE the final format
;   coordinates: the number you write is the number emitted — nothing is
;   added behind your back. Delete a directive → its code default returns.
;   The body is plain ZPL: `{{placeholders}}` fill per item;
;   `{{#key}}…{{/key}}` blocks print only when `key` is set; `{{^key}}…{{/key}}`
;   only when it is NOT. An unknown name, an unbalanced block, or a missing
;   file FAILS the print (nothing is sent), with the reason in the server
;   log. Full-line `;` comments are stripped at render time. Per-print dx/dy
;   (Browser-Print agent path: dx=-3, dy=3) nudges every coordinate + ^PW
;   AFTER rendering.
;   Per-item fills (do NOT hardcode): {{code}} {{price}} {{event}} {{rows}}
;   {{copies}} {{barcode_x}} {{id_block_w}} {{price_col_x}} {{price_x}} {{pw}}.
;
; @left_origin 127        ; = 147 (Sep-27 window origin) − 20 (v10 shift)
; @right_edge 703         ; = 723 (Sep-27 content edge) − 20 (v10 shift)
; @y_event 37             ; = 33 (v5 price's old slot) + 4 (v7 down)
; @y_band_top 18          ; = 14 (first safe row under the top edge) + 4
; @y_id 90                ; = 86 (uniform ID row; v9 raised it 7) + 4
; @y_price_barcode 124    ; = 120 (v6 "the row with Y = 120") + 4
; @bars_right_nudge 10    ; bars' ink ends right_edge − 10 (v9.3 air)
; @row_pitch 27           ; 30pt row: ~21 dots ink + ~6 air between rows
; @row_ink 24             ; worst-case row ink depth (fit guard)
; @barcode_height 46      ; ^BC height → bars span y_band_top .. +46
; @label_length 203       ; ^LL — ≈1" tall media
; @darkness 20            ; ^MD (clamped 0..30)
; @desc_max_chars 20      ; description truncation (2026-10-06 directive)
; @max_field_chars 28     ; event/seller/free-line char caps
; @flag_d_width 14        ; bold "D" advance (font 0 @30)
; @flag_gap 26            ; price sits flag_d_width + flag_gap right of the flag
; @bold_d_font 30         ; donation flag "D" font size (font 0 = bold)
; @big_code_h 56          ; BARCODE-MODE UNUSED (text-mode band-code cell)
; @big_code_w 30
^XA
^MD{{darkness}}
^LL{{label_length}}
^PW{{pw}}
^CI0
{{#event}}^FT{{origin}},{{y_event}}^AEN,28,15^FD{{event}}^FS
{{/event}}
^FO{{barcode_x}},{{y_band_top}}^BCN,{{barcode_height}},N,N,N^FD{{code}}^FS
{{#donate}}^FT{{price_col_x}},{{y_price}}^A0N,{{bold_d_font}},{{bold_d_font}}^FDD^FS
^FT{{price_x}},{{y_price}}^AEN,28,15^FD{{price}}^FS
{{/donate}}
{{^donate}}^FT{{price_col_x}},{{y_price}}^AEN,28,15^FD{{price}}^FS
{{/donate}}
^FT{{barcode_x}},{{y_id}}^FB{{id_block_w}},1,0,C,0^AEN,28,15^FD{{code}}^FS
{{rows}}
{{#copies}}^PQ{{copies}}
{{/copies}}
^XZ