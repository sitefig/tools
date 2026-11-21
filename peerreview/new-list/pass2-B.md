# Pass 2, batch B (rows first SKIPPED, not network dependent). Module: src/tools/new24.js

| n | name | decision |
|---|---|---|
| 1515 | Typing Tutor | BUILT:typing-tutor-key-rows (11 lessons + weak-key drill; hardware keyboard only) |
| 1525 | Geometry Construction Board | BUILT:geometry-construction-board (commands, form, script, pointer, arrow-key nudge, SVG + text description) |
| 1539 | Coding Logic Puzzles | BUILT:grid-robot-and-circuit-puzzles (typed F/L/R/repeat programs, boolean switch circuits, exact solvability checks; no drag-and-drop blocks) |
| 1549 | Document Scanner | BUILT:document-scanner-clean-pdf (file in only, no live camera; heuristic corner finder; homography code copied from new18 because it is not exported) |
| 1550 | Whiteboard | BUILT:whiteboard-pan-zoom-canvas (vector objects; no move/resize of existing objects) |
| 1335 | Auto Caption Generator | BUILT:auto-caption-generator-whisper (reuses src/gap5lib/whisper.js unchanged; timings estimated, not Whisper timestamp tokens) |
| 1395 | Handwriting Font Maker | BUILT:handwriting-font-maker-ttf (keyboard route = glyph grid with cell toggles; blocky pixel outlines, no smooth tracing) |

Verification
- Geometry: four example constructions vs python formulas (circumcentre, tangent points, equal distances): match to 1e-9.
- Logic: BFS shortest paths vs an independent python BFS on all 6 maps (5, 10, 12, 7, 20, 19 moves); truth tables vs python itertools for two formulas; every level solvable (or deliberately not) as designed.
- Scanner: synthetic Pillow photo with known corners: auto corners within 1.3 to 15.9 px on 1200x900 (light page) and 3.8 to 7.3 px (dark page); warp vs original page MAE 6.8 grey levels; shadow flattening cut background std 28 -> 4.8; black and white text IoU 0.91 at the default sensitivity (0.67 at 12, 0.84 at 25). PDF: pdfinfo/pdftoppm read it, page size and orientation correct.
- Captions: Whisper engine verified earlier by test/gap5-whisper.mjs. New: speech/pause detection vs ffmpeg silencedetect (pause 9.56-10.19 found as 9.54-10.18); 32 s test clip (2 copies of the JFK clip with silence) gives 4 cues, WER 0.0, cue edges within 0.02 s of ffmpeg pauses; continuous 33 s clip WER 0.0; SRT and VTT both re-read by ffmpeg. Browser run identical to Node (32 s audio in 50 s in headless Chrome).
- Font: fontTools loads it, whole-file and per-table checksums valid, maxp/hhea/hmtx consistent, round trip; FreeType (Pillow) rendering matches the grid cell for cell on 6 glyphs (incl. a glyph with a hole, accented char) in proportional and fixed width; Chrome FontFace loads it.
- Whiteboard: pointer pen stroke, keyboard rectangle, undo, zoom/pan, SVG (well formed) and PNG download driven in headless Chrome.

Not verified: real phone camera photos and cluttered backgrounds (scanner), SVG export rendered against the canvas pixels, screen reader output (aria text only inspected), touch input, Safari/Firefox, fonts installed in an OS, word error rate beyond one clean public-domain clip.
