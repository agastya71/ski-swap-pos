; ski-swap-pos item label — TEXT mode (v11 template; geometry = v10, 2026-10-14)
;
; The `code_as_text` render: the item code prints as large text in the band
; instead of a barcode. SAME re-read-on-every-print rules as label_item.zpl —
; edit, print again, no recompile, no restart. See that file's header for the
; full semantics (directives, blocks, loud failures, `;` comments).
;
; Per-item fills: {{code}} {{price}} {{event}} {{rows}} {{copies}},
; {{price_col_x}} (the content width's midpoint — no barcode anchor in this
; mode), {{text_fb_w}} (right_edge − origin, the band code's ^FB width) and
; the {{y_*}}/{{pw}} geometry after the directives fold in. There is NO
; repeated identifier row here — the band code IS the identifier.
;
; @left_origin 147        ; content left origin (media window, ruler print)
; @right_edge 723         ; content right edge
; @left_dots -20          ; v10 (2026-10-14 user): whole label 20 dots LEFT
; @down_dots 4            ; v7 (2026-10-06 user): whole label 4 dots DOWN
; @bars_right_nudge 10    ; TEXT-MODE UNUSED
; @event_row_y 33         ; event row — the price's old top-band left slot
; @band_top 14            ; TEXT-MODE UNUSED
; @id_row_y 86            ; TEXT-MODE UNUSED
; @seller_row_y 120       ; TEXT-MODE UNUSED
; @text_rows_y 80         ; flow start — the seller/price row
; @text_code_y 34         ; band-code top (v8: rides 6 dots higher — the ×2
                         ; bitmap cell needs the ink clearance)
; @row_pitch 27           ; lower-flow row stride
; @row_ink 24             ; worst-case ink depth of one row (fit guard)
; @barcode_height 46      ; TEXT-MODE UNUSED
; @label_length 203       ; ^LL — ≈1" tall media
; @darkness 20            ; ^MD (clamped 0..30)
; @desc_max_chars 20      ; description truncation
; @max_field_chars 28     ; event/seller/free-line char caps
; @flag_d_width 14        ; bold "D" advance (font 0 @30)
; @flag_gap 26            ; price sits flag_d_width + flag_gap right of the flag's edge
; @bold_d_font 30
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