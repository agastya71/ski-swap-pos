; ski-swap-pos item label — BARCODE mode (v11 template; geometry = v10, 2026-10-14)
;
; THIS FILE IS THE LABEL LAYOUT. It is re-read from disk on EVERY print: edit
; it, print again — no recompile, no service restart.
;
; HOW IT WORKS
;   `; @name value` directive lines below override the geometry constants the
;   renderer uses (a directive beats the same-named env/config default, and a
;   directive you DELETE falls back to the config default). The body is plain
;   ZPL: `{{placeholders}}` are filled per item; `{{#key}}…{{/key}}` blocks
;   print only when `key` is set; `{{^key}}…{{/key}}` print only when it is
;   NOT. An unknown name, an unbalanced block, or a missing file FAILS the
;   print (nothing is sent) with the reason in the server log — fix the file
;   and print again. Full-line `;` comments are stripped at render time.
;   Per-print dx/dy (the Browser-Print agent path passes dx=-3, dy=3) still
;   nudge every emitted coordinate + ^PW AFTER rendering.
;
; WHAT THE RENDERER FILLS (per item — do not hardcode these):
;   {{code}} {{price}} {{event}} {{rows}} {{copies}}
;   {{barcode_x}}        exact Code 128 model: bars' ink ends at
;                        (right_edge − bars_right_nudge); the ID row centers
;                        on the bars' band; the price column anchors at bx
;                        (floored so a long code can't slide under the seller)
;   {{id_block_w}}       the ID row's ^FB width: (right_edge − nudge) − barcode_x
;   {{price_col_x}}      the flag/price column edge; {{price_x}} = it +
;                        flag_d_width + flag_gap for donate items
;   {{y_*}} {{pw}} …     geometry after the @ directives below fold in
;
; GEOMETRY HISTORY (dots @ 203 dpi; media ≈3"×1", ruler 2026-09-27):
;   v7  2026-10-06  whole label +4 dots down (print feedback)
;   v9  2026-10-12  exact Code 128 width model — bars to the right edge
;   v9.3 2026-10-12 bars end right_edge − 10 (air instead of "truncated" look)
;   v10 2026-10-14  whole label 20 dots left (print feedback)
;   v5/v6/v8 2026-10-06/12: event into the price's old band slot; price+flag
;   share the seller row; plain OCR-B (font E ^AEN,28,15) everywhere but the
;   bold D flag (font 0)
;
; @left_origin 147        ; content left origin (media window, ruler print)
; @right_edge 723         ; content right edge
; @left_dots -20          ; v10 (2026-10-14 user): whole label 20 dots LEFT
; @down_dots 4            ; v7 (2026-10-06 user): whole label 4 dots DOWN
; @bars_right_nudge 10    ; v9.3: bars' ink ends right_edge − 10
; @event_row_y 33         ; event row — the price's old top-band left slot
; @band_top 14            ; barcode top (media top ≈12 dots below format y=0)
; @id_row_y 86            ; item-ID row, centered under the bars
; @seller_row_y 120       ; seller row — price (+ donate flag) in its right column
; @text_rows_y 80         ; BARCODE-MODE UNUSED (text-mode flow start)
; @text_code_y 34         ; BARCODE-MODE UNUSED (text-mode band-code top)
; @row_pitch 27           ; lower-flow row stride
; @row_ink 24             ; worst-case ink depth of one row (fit guard vs label_length)
; @barcode_height 46      ; ^BC height
; @label_length 203       ; ^LL — ≈1" tall media
; @darkness 20            ; ^MD (clamped 0..30)
; @desc_max_chars 20      ; description truncation (2026-10-06 directive)
; @max_field_chars 28     ; event/seller/free-line char caps
; @flag_d_width 14        ; bold "D" advance (font 0 @30)
; @flag_gap 26            ; price sits flag_d_width + flag_gap right of the flag's edge
; @bold_d_font 30
; @big_code_h 56          ; TEXT-MODE UNUSED (band-code font E ×2 cell)
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