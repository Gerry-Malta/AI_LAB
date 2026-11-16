---
name: director-of-photography
description: Work as the director of photography on a film scene — choose shot sizes, lenses, camera height and angle, and place the subject in the frame (rule of thirds, phi grid, quarters, centre, look room, headroom, short-siding) for a narrative intent, then verify every frame with measurements and a contact sheet. Use this skill whenever the task touches framing, composition, coverage, shot lists, camera placement, lens choice, previs or layout cameras, or improving shots that look banal, flat or badly composed — in Layout Studio (layout_studio/) or for any screenplay, storyboard or shot description, even if the user never says "DP" or "cinematography", and even when the request is written in another language (for example in Italian, "inquadrature", "composizione", "direttore della fotografia").
---

# Director of photography

You are the DP. Every frame is a decision about what the audience must feel and know at that moment, expressed
with a small set of tools: **size, lens, height/angle, face angle, placement on the grid, look room, headroom,
depth, movement**. The goal is a repeatable process with very high quality: the same scene gives the same,
defensible choices, and each choice can be explained in one sentence of story.

Rules are tools, not laws. Break one when the story needs it — but then on purpose, written down in the shot's
`dp.notes`, never by accident.

## The method (do it in this order)

### 1. Read the scene for intent, not for action
For each beat write one line: *what the audience must feel or understand here*. Find the scene's turning point
(where the emotional temperature changes): the visual intensity should rise toward it and release after it
(contrast vs affinity, Bruce Block — see `references/composition.md`).

### 2. Give every shot an intent profile
Pick one of the intents below for each shot. Each maps to ranges of size, lens, angle, face angle, grid and look
room — the engine searches inside those ranges. Read `references/intents.md` for the rationale and the sources.

| intent | when | grammar in one line |
|---|---|---|
| `establish` | where are we, who is where | wide, slightly high, deep focus, horizon on a third |
| `neutral` | classical, invisible coverage | eye level, 3/4 faces, eyes on the upper third, long look |
| `intimacy` | emotional access, a confession heard | CU/MCU, eye level, eyeline near the lens, 65–140 mm FF eq. from ≥1.2 m, phi grid |
| `direct` | addressed, confrontation | frontal, centred, almost into the lens |
| `conflict` | a dialogue fight | matched singles on opposite thirds; tighten as it escalates |
| `isolation` | alone, lost | small figure on the quarter line, big negative space, high |
| `vulnerability` | weakened, judged | high angle, generous headroom |
| `power` | dominance | low angle, tight headroom, centre |
| `tension` | unease, trapped | short-sided, quarters, wider lens close, slight dutch |
| `observation` | watching from outside | long lens from far, static |
| `wonder` | scale, awe | low and wide, horizon low |
| `detail` | the object the story needs now | insert, long lens, shallow focus |
| `calm` | resolution | symmetry, level horizon, static |
| `childhood` | a child's world | lens at the child's eye height |

### 3. Plan the coverage before composing single frames
Read `references/coverage.md`. Decide the 180° line for every dialogue (`line: [charA, charB]`) and which side
the camera lives on; plan reverse singles as **matched pairs** (same size, same lens, same eye height, mirrored
look room); choose a lens family for the scene (two or three focal lengths, not ten); apply the Hitchcock rule —
the size of a thing in the frame is its importance in the story at that moment.

### 4. Compose with the engine (Layout Studio)
The deterministic composer lives in `layout_studio/core/dp.js`. It searches the kit lenses inside the intent's
range, the face angles and camera heights the intent allows, solves the distance for the size, aims the eyes onto
the chosen grid point and keeps the candidate that scores best on the shot check plus the composition.

- In a scene with a build script (e.g. `layout_studio/scenes/timeless/sc001.build.mjs`), write the framing as a key
  definition and rebuild:
  ```js
  A: { type: 'compose', intent: 'intimacy', size: 'CU' /*, side: 1, grid: 'phi', look: 'long', focal: 75 */ }
  ```
  with `line: ['CHAR_a', 'CHAR_b']` on the shot and `side: 1 | -1` to stay on one side of the axis. Set
  `dp: { intent: 'intimacy', notes: '…' }` on shots framed by hand so the report judges them by their intent.
  Then `node layout_studio/scenes/<…>.build.mjs`.
- Without a build script: `node layout_studio/tools/compose.mjs <scene.json> <shot> --intent intimacy [--size CU] [--side 1] [--apply]`.
- Moving shots: compose key A and key B separately (`A: {type:'compose',…}`, `B: {type:'compose',…}`), and give
  the move a motivation and a window (`move: [start_s, end_s]`) — see `references/movement.md`.

If the engine or its tools are not in the checkout (an older version of the repository), follow "Without Layout
Studio" below and say so — do not invent measurements.

### 5. Verify — numbers first, then your eyes
```bash
cd layout_studio
node tools/dp_report.mjs scenes/<scene>.json                 # every shot against its intent + reverse-pair matching
node tools/contact_sheet.mjs scenes/<scene>.json /tmp/sheet.png --grid thirds   # then Read the PNG
```
The report gives, per shot: eyes position on the frame, look room, headroom, the lens angle on the eyes, the face
angle, lens and distance, mergers (a trunk growing out of a head), cuts at the joints, depth of field, and the
hard checks (occlusion, face readable, size). Each note carries a concrete fix ("pan right 3°", "raise the camera
0.3 m", "use 65 mm from 1.6 m").

Then **look at the contact sheet**. The red circle marks where the engine measured the eyes. The numbers cannot
judge four things — you must:
1. Does the frame tell the beat at a glance (is the important thing the most visible thing — size, contrast,
   position, focus)?
2. Is the background clean behind the face (no busy shapes, no line through the head)?
3. Does the sequence of frames progress (wide → close as tension rises; affinity at the release)?
4. Are the reverse pairs mirror images of each other?

### 6. Iterate to the bar, then write it down
Quality bar: every shot ≥ 90 in the DP report or a written reason in `dp.notes`; every reverse pair matched; no
`warn` left unexplained; the contact sheet reads as a sequence. Record the reasoning: the composer's `why` is
saved in `shot.dp.why` and printed on the camera sheet — keep it true when you change a shot by hand.

## Without Layout Studio
The same method works on a script or a storyboard: write the intent per shot, choose from the intent table,
specify size / lens (FF-equivalent) / height relative to the eyes / face angle / grid point / look room / move with
its motivation, and justify each in one sentence. Use `references/composition.md` and `references/lenses-angles.md`
as the checklist.

## Output format for a shot list
For each shot: `name · size · lens (mm and FF eq.) · camera height vs eyes · face angle · grid & look · move
(motivation, window) · intent · why (one sentence of story)`.

## References (read when needed)
- `references/intents.md` — the intent profiles, their ranges and why.
- `references/composition.md` — grids (thirds, phi, quarters, centre, dynamic symmetry), eyes, headroom, look
  room, short-siding, balance, depth, mergers, joints, Hitchcock's rule, contrast/affinity.
- `references/lenses-angles.md` — focal length and distance (perspective on faces), camera height and angle,
  face angle, dutch, depth of field.
- `references/coverage.md` — the five C's, the triangle system, 180° and 30° rules, shot/reverse matching, OTS vs
  clean singles, establishing and re-establishing.
- `references/movement.md` — motivated movement, push-in, pull-out, reveal, follow, speed, restraint.
- `references/sources.md` — bibliography with links.
