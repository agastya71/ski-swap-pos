; ski-swap-pos item label — TEXT mode (v11.1; emitted geometry = v10, 2026-10-14)
;
; The `code_as_text` render: the item code prints as large text in the band
; instead of a barcode. It is re-read from disk on EVERY print — edit, print,
; no recompile, no restart. General semantics (`;` comments stripped, {{…}}
; fills, loud failures on unknown names/blocks/missing files) match
; label_item.zpl — that header also explains what NOT to hardcode.
;
; ─── HOW EACH COORDINATE IS COMPUTED — verify any change against this ────────
;
; Units: dots at 203 dpi (1 dot ≈ 0.125 mm; 20 dots ≈ 2.5 mm).
; MEDIA: left edge ≈115 / right edge ≈716 / top ≈12 below format y=0 /
;   height ≈203 (fine probe 2026-10-15 — same zones as Sept-27).
;
; HORIZONTAL (x) — carries the v10 whole-label shift (−20):
;   left_origin = 147 (Sep-27 window origin) − 20 = 127 (margin to the edge:
;               12 dots ≈ 1.5 mm — keep ~10 dots or more when editing).
;   right_edge  = 723 (Sep-27 content edge) − 20 = 703.
;   text_fb_w (computed) = right_edge − left_origin = 576 — the band code's
;               ^FB right-aligns into this width.
;   price_col_x (computed) = (left_origin + right_edge) // 2 = 415 — the
;               content width's midpoint; text mode has no barcode anchor.
;   price_x (computed, donate items only) = price_col_x + flag_d_width (14)
;               + flag_gap (26) = col + 40.
;   pw (^PW, computed) = right_edge = 703.
;
; VERTICAL (y) — format y=0 sits ≈12 dots ABOVE the media top; the v7
; whole-label shift (+4) is already inside every y below:
;   y_text_code = 34 + 4 = 38 — the ×2 band-code cell (big_code_h = 56 tall)
;               tops there. The OLD 50-pt font-0 code's ink ended ≈75 in
;               format y; the flow was placed off that.
;   y_price     = 80 + 4 = 84 — the flow start (the seller/price row), kept
;               clear of the band code's ink. If you RAISE the band code
;               (y 38, cell to 94), push this and the rows down instead.
;   y_event     = 33 + 4 = 37 — the price's OLD band slot (v5): the event
;               beside the band code, above the price; consumes no flow row.
;   lower rows start at y_price and step +row_pitch (27): 84 → 111 → 138 →
;               165 → 192; a row past 203 − row_ink (24) drops, never clips.
;
; CHAR CAPS: description truncates to desc_max_chars (20); other fields to
;   max_field_chars (28).
;
; ─── DIRECTIVES (values are FINAL format coordinates — nothing stacks) ───────
; @left_origin 127        ; = 147 (Sep-27 window origin) − 20 (v10 shift)
; @right_edge 703         ; = 723 (Sep-27 content edge) − 20 (v10 shift)
; @y_event 37             ; = 33 (v5 price's old slot) + 4 (v7 down)
; @y_text_code 38         ; = 34 (v8 ×2-cell clearance) + 4
; @y_price_text 84        ; = 80 (flow start under the band code) + 4
; @bars_right_nudge 10    ; TEXT-MODE UNUSED
; @row_pitch 27           ; 30pt row: ~21 ink + ~6 air
; @row_ink 24             ; worst-case row ink depth (fit guard)
; @barcode_height 46      ; TEXT-MODE UNUSED
; @label_length 203       ; ^LL — ≈1" tall media
; @darkness 20            ; ^MD (clamped 0..30)
; @desc_max_chars 20      ; description truncation
; @max_field_chars 28     ; event/seller/free-line char caps
; @flag_d_width 14        ; bold "D" advance (font 0 @30)
; @flag_gap 26            ; price sits flag_d_width + flag_gap right of the flag
; @bold_d_font 30         ; donation flag "D" font size (font 0 = bold)
; @big_code_h 56          ; band code font E ×2 cell height
; @big_code_w 30
^XA
^MD{{darkness}}
^LL{{label_length}}
^PW{{pw}}
^CI0
{{#event}}^FT{{origin}},{{y_event}}^AEN,28,15^FD{{event}}^FS
{{/event}}
^FT{{origin}},{{y_text_code}}^FB{{text_fb_w}},1,0,R,0^AEN,{{big_code_h}},{{big_code_w}}^FD{{code}}^FS
{{#donate}}^FT{{price_col_x}},{{y_price}}^A0N,{{bold_d_font}},{{bold_d_font}}^FDD^FS
^FT{{price_x}},{{y_price}}^AEN,28,15^FD{{price}}^FS
{{/donate}}
{{^donate}}^FT{{price_col_x}},{{y_price}}^AEN,28,15^FD{{price}}^FS
{{/donate}}
{{rows}}
{{#copies}}^PQ{{copies}}
{{/copies}}
^XZ