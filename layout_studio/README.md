# Layout Studio

Previz layout tool for film: blockout proxies, posed stand-ins, **real lenses and real camera rigs**, a deterministic
**shot check** (size, headroom, lead room, depth layers, occlusion, horizon, 180° line, rig limits) and exports for the
crew (camera sheet) and for Blender (animated cameras).

It is built so that an agent (Claude) can write the layout — the scene file is plain JSON and every camera can be
described as a *framing definition* ("CU of Arthur from 30°, eye level, 65 mm") that the deterministic core turns into
coordinates — while you fly through the scene with Unreal-style controls and fix things by hand.

No build step. Open `index.html` through any static server (or GitHub Pages). three.js loads from `vendor/three/` when that folder is present (self-contained, offline) and from jsDelivr otherwise.

![viewer](docs/shots_demo/overview.png)

![look through the shot camera](docs/shots_demo/shot_1C.png)


```
python3 -m http.server 8000      # then http://localhost:8000/layout_studio/
```

## Layout of the tool

| Path | What |
|---|---|
| `index.html`, `app/` | the viewer (three.js): six workflow steps, viewport, PiP camera view, shot check, exports. `export_mp4.js` in-browser MP4 export, `audio.js` dialogue playback and mix, `review.js` review notes and frame markup (shared on claude.ai, local elsewhere), `tooltip.js` + `tips.js` hover help |
| `core/` | dependency-free ES modules shared by browser and Node: `lens.js` (filmbacks, FOV, DOF), `rigs.js` (rig constraints → `pose(t)`), `motion.js` (easing), `standin.js` (mannequin skeleton, poses, hands, keypoints, body parts), `blocking.js` (blocking over time), `shot.js` (shot solving with subject tracking), `framing.js` (single / two-shot / OTS / insert solvers), `metrics.js` (shot check), `dp.js` (director of photography: composition analysis, intents, composer), `editor.js` (film editor: cut review, timing, pacing), `keys.js` (framing definitions → keys), `exporters.js` (camera sheet, Blender script), `schema.js` |
| `scenes/_lib/build.mjs` | scene builder used by generation scripts: `node scenes/demo/build.mjs` |
| `scenes/demo/` | public demo scenes: a fictional café terrace and the mannequin pose library |
| `scenes/timeless/` | TIMELESS, scene by scene: `sc001.build.mjs` (Scene 1 layout script), `sc001.json`, its camera sheet and Blender script. The whole-film breakdown (`index.json`) stays local |
| `vendor/` | three.js 0.170 and mp4-muxer 5.2 (MIT), copied unmodified so the viewer works offline |
| `tests/core.test.mjs` | `node --test tests/core.test.mjs` |
| `tests/smoke.mjs` | headless Playwright run: loads a scene, walks the shots, screenshots, fails on JS errors |
| `tools/render_mp4.mjs` | offline sequence render to MP4, dialogue included (see below) |
| `tools/mix_dialogue.mjs` | lays the scene's sound (dialogue, effects, ambience) onto a rendered video, on the same frame plan |
| `tools/compose.mjs` | composes one shot from a narrative intent with the DP composer (`--apply` writes it into the scene) |
| `tools/dp_report.mjs`, `tools/edit_report.mjs` | the DP report (every shot against its intent, reverse-pair matching) and the edit report (cuts, timing, rhythm) |
| `tools/contact_sheet.mjs` | contact sheet of the scene: a frame per shot (both ends of moving shots) with the composition grid, the measured eyes and the scores |
| `tools/export_sheets.mjs` | writes the camera sheet, the Blender script and both reports next to a scene file |
| `../.claude/skills/` | the **director-of-photography** and **film-editor** skills: the method, research references and evals (see below) |

## Workflow: six steps

The left panel follows the order of the work. Each step has a one-line how-to under the step bar, and every control
explains itself when the cursor rests on it for half a second.

1. **Set**: the location. Proxies at real size, props, trees, stand-ins, GLB models.
2. **Blocking**: the story beats and each actor's mark in every beat (position, facing, pose, acting). The viewport
   shows tape marks on the floor: a ring where the actor stands, an arrow for the facing, a dashed line for the move
   between beats, the selected beat in bold (**M** toggles them).
3. **Camera**: shots, lens, rig, keys A and B (labelled in the viewport), timing curve; the shot check grades the frame.
4. **Sound**: the voice cast, the ambience beds, and per shot the lines and effects on one timing bar (lines that start
   before the cut or run past it are marked), with a play button on every take.
5. **Screen**: every shot with its score and voices, real-time screening of the edit, DP and edit reports, exports.
6. **Review**: notes from the director, the VFX supervisor and the artists — on the whole scene, on a shot, or drawn on
   a frame — with replies and resolution (see below).

## Controls (Unreal style)

* **RMB** drag: look. With RMB held: **W A S D** fly, **Q / E** down / up, **Shift** faster, **wheel** changes fly speed.
* **wheel** (RMB not held): dolly forward / back. **MMB** drag: pan. **Alt + LMB**: orbit the focus point.
* **LMB**: select object or shot camera. **W / E / R**: move / rotate / scale gizmo. **F**: frame. **Del**: delete.
* **Space** play, **[ ]** previous / next shot, **L** look through the shot camera (letterboxed to the lens aspect, with live subtitles), **G** grid, **H** labels, **M** actor marks, **Ctrl+Z** undo, **Ctrl+S** download JSON.
* While looking through the camera, RMB + WASD drive the **shot camera**; releasing writes the active key (A or B).
* Shot panel: lens, rig, follow, shake intensity, duration, timing curve with a bezier editor, keys A and B (set from the view, aim at the subject, re-solve from the framing definition).
* Stand-in panel: blocking per beat (position, facing, pose) and **acting**: head, neck, spine, arms and legs joint angles on top of the pose, with a reset to the library pose.

Stand-ins are posed **per beat**: with a shot or beat selected, moving a stand-in edits that beat's blocking. A shot whose
`beatA` and `beatB` differ plays the transition: a character that changes mark gets up, moves to the new mark facing the
travel direction (a slide, no walk cycle) and settles into the new pose; a character that stays on its mark blends poses.

## Stand-ins (Unreal-style mannequins)

`core/standin.js` builds every stand-in from a skeleton with real proportions: adult tables from standard anthropometry,
a 6-year-old table (bigger head, shorter legs), ages in between blended. Set `age` on the stand-in, or leave it empty and
it is estimated from the height for children. Poses are joint angles with forward kinematics and automatic grounding, so the
same body drives the viewer meshes, the shot-check keypoints, occlusion and the Blender export.

* Library poses: `stand walk sit_ground sit_cross sit_chair crouch kneel lie_prone lie_supine` (see `scenes/demo/mannequin_poses.json`).
* Acting per beat: a blocking pose can be `{ "base": "sit_ground", "head": { "pitch": 25 }, "elbow": { "flex": 120 } }`.
  Joints: `root spine chest neck head` (pitch, yaw, roll) and `shoulder elbow wrist hip knee ankle`, both sides or `L` / `R`
  (flex, abd, twist). Pitch positive bends forward, yaw positive turns to the character's left.
* Blends `{ "a": "sit_ground", "b": "stand", "w": 0.4 }` are produced by the blocking transitions and can be used directly.
* **Hands**: a palm with a knuckle ridge and a thumb pad, four fingers of three phalanges and a two-phalanx thumb.
  `hand` (both) or `handL` / `handR` takes a preset — `relaxed open flat fist point grip pinch` — or
  `{ "preset": "grip", "curl": 0.7, "index": 0.1, "spread": 0.2, "thumb": 0.5, "thumbOut": 0.3, "opp": 0.8 }`.
  The wrist takes `flex` (back of the hand up), `dev` (toward the thumb) and `twist` (forearm turn: + shows the palm,
  − palm down). `core.gripPoint(character, 'L' | 'R' | 'both')` returns where a held prop goes (the phone in Claire's
  hands, the grass between Arthur's fingers). Finger phalanges are drawn instanced and skipped by occlusion.

## Following a moving subject

`rig.follow: true` makes a Steadicam / handheld / gimbal / dolly camera follow its subject through the blocking: the
camera keeps the offsets of keys A and B relative to the subject, swings around it instead of crossing it, and booms up and
down less than the actor (`followVertical`, default 0.7). `rig.aim: "subject"` keeps the camera where it is and pans with
the subject (sticks, crane). The shot check evaluates the middle of every move as well as both keys.

## Scene file (`layout-studio/scene`, v1)

Metres, Y up, X east, Z south (three.js convention; the Blender export converts to Z up).

```jsonc
{
  "format": "layout-studio/scene", "version": 1, "project": "DEMO",
  "scene": { "number": 1, "heading": "EXT. ... - DAY", "int_ext": "EXT", "location": "...", "time": "DAY", "pages": "1", "synopsis": "..." },
  "world":  { "ground": { "size": 200, "color": "#6d6a63" }, "sky": "#c9d6e3", "sun": { "azimuth": 240, "elevation": 22 }, "fog": 0.0009 },
  "objects": [
    { "id": "PROP_table", "name": "Café table", "role": "HERO", "kind": "cylinder", "position": [0, 0.15, 0.2], "rotation": [0, 0, 0], "scale": [1, 1, 1], "size": [0.8, 0.74, 0.8], "color": "#d8d3c8", "source": "inferred" },
    { "id": "CHAR_anna", "name": "ANNA", "role": "CHAR", "kind": "standin", "position": [-0.75, 0.15, 0.2], "rotation": [0, 90, 0], "height": 1.68, "pose": "sit_chair", "color": "#c2743b" }
  ],
  "beats": [ { "id": "b1", "label": "Anna waits", "t0": 0, "t1": 10, "blocking": { "CHAR_anna": { "position": [-0.75, 0.15, 0.2], "facing": 90, "pose": "sit_chair" } } } ],
  "shots": [ {
    "id": "sh010", "name": "1A", "beat": "b1", "beatA": null, "beatB": null, "size": "WS", "subject": "CHAR_anna", "intent": "...",
    "camera": { "filmback": "ALEXA35_OG", "focal_mm": 27, "aspect": 2.39, "squeeze": 1, "fstop": 2.8, "focus_m": 11 },
    "rig": { "type": "dolly" }, "duration_s": 8, "curve": "cinematic",
    "keys": { "A": { "position": [x, y, z], "target": [x, y, z], "roll": 0 }, "B": { ... } },
    "framing": { "A": { "type": "single", "azimuth": -40, "cameraHeight": 1.3, "distance": 11 }, "B": { ... } },
    "wantForeground": true, "allowOcclusion": false, "line": ["CHAR_anna", "CHAR_ben"], "notes": ""
  } ]
}
```

* `kind`: `box cylinder cone sphere capsule plane tree standin gltf`. `position` is the pivot at the **base** of the object. `tree` size = canopy diameter, height, trunk fraction. `gltf` loads `url` (e.g. a GLB exported from a reconstruction) and measures its own size.
* `source`: `script | observed | inferred | reference` — what the geometry is based on (a one-image reconstruction must mark what it invented).
* `standin` poses: `stand walk sit_ground sit_chair crouch kneel lie_prone lie_supine`; keypoints and body parts come from `core/standin.js` and are shared by the viewer and the metrics.
* Shot `size`: `EWS WS FS MLS MS MCU CU BCU ECU INSERT`. Rigs: `static slider dolly crane steadicam handheld gimbal drone vehicle` (each with speed / height / reach limits that produce warnings). Curves: `linear easeIn easeOut easeInOut smooth smoother cinematic quickStart holdMoveHold`.
* Keys hold position + look-at target (+ roll). `framing` keeps the *description* that produced them, so **Re-solve** can recompute the keys after you change the lens, the size or the blocking. Framing types: `single` (subject, azimuth, elevation | cameraHeight, leadRoom, headroom, distance), `two` (a, b, side ±1, margin), `ots` (fg, bg, side, fitSize picks the focal from the kit), `object` (object, fill, azimuth, elevation), `compose` (the DP composer: intent, size, side, focal, povOf, grid, look…), `raw` (position, target, or `frame: { subject, u, v }`).
* `dp`: `{ "intent": "intimacy", "why": [...], "notes": "..." }` — the shot's narrative intent (the DP report judges it against it), the composer's reasoning, and overrides of the profile (`grid`, `look`, `vAngle`, `face`, `ffEq`, `roll`).
* Scene `edit`: `{ "tempo": "drama" }` for the edit report; scene `review`: the review notes when the page runs without claude.ai (see Review).
* `line`: the two characters that define the 180° axis for this shot; consecutive shots of the same beat that declare the same axis are checked for crossings.
* `dialogue`: `[{ "who": "CLAIRE", "line": "Sabato. Perché?", "audio": "audio/sc001/….mp3", "dur_s": 2.19, "at": 0.4 }]`. `audio` and
  `dur_s` come from the recorded take (see Dialogue voices), `at` optionally fixes the start inside the shot. Subtitles,
  playback and exports all use the same timing. The scene's `cast` maps each character to its voice.
* `curve`: a preset name or a cubic bezier `[x1, y1, x2, y2]` (CSS convention: time on x, progress on y). `easeInOutCubic` is a slow start and a slow landing; heavy S-curves raise the peak speed, which the rig check reports.
* `rig.shake`: operator shake intensity for handheld / Steadicam / gimbal / drone (1 = default, 0 = locked); longer lenses are operated steadier automatically. `rig.follow`, `rig.followVertical`, `rig.aim`: see "Following a moving subject".

## Shot check

Deterministic, no AI: measured size (first body landmark under the bottom edge reading from the head down, or head size for
lying subjects), headroom, lead room, eyes on the thirds, horizon height, dutch angle, depth layers (objects in FG / MG / BG
relative to the subject distance), occlusion of the subject (exact ray tests against boxes, cones, cylinders, ellipsoids and
the mannequins' capsules), near objects filling the frame, camera inside an object, eyeline height, wide-lens distortion
risk, rig limits (speed, track, boom range, crane reach, pan rate) and the 180° line. `wantForeground` can be set per key
in the framing definition (a push-in that passes its foreground). Each shot gets a 0–100 score; the intent is "first pass that a human
then nudges", not taste.

## Editing: timing inside the shots

A previs cut feels mechanical when every move starts on the first frame and every line half a second after the cut.
Three controls give a shot its own rhythm:

* `move: [start_s, end_s]`: the camera holds until something motivates the move (an actor gets up, a line lands) and
  settles before the cut. The shot's curve eases inside the window.
* `action: [start_s, end_s]`, or `{ CHAR_id: [s, e], default: [s, e] }`: when the actors go from the first beat to the
  second. Each actor can have their own window, so one can leave while the other keeps drawing.
* Dialogue `at` (seconds in the shot) may be negative: the line starts over the previous shot and the cut lands inside it
  (a J-cut). `lap: true` lets a line run into the next shot, so we watch the listener (an L-cut).

Beats can also move, turn or hide props (`PROP_id: { position, facing, visible }`): the phone in Claire's hands, then
face down on the blanket. Insert framings and the shot check follow the prop to where the beat puts it.

## Sound: voices, effects, ambience (Higgsfield)

Claude makes the sound from the chat with Higgsfield and saves it next to the scene, in `scenes/<project>/audio/<scene>/`:

* **Voices**: one voice per character. A whole exchange is voiced as one performance (ElevenLabs Eleven v4, with short
  acting directions), then cut line by line, so the delivery and the pauses stay natural. `voices.json` maps takes to
  lines; the build attaches a take only while its text still matches the line.
* **Effects and ambience**: Mirelo text-to-audio. `sounds.json` lists them with their length and their loudest moment.
  A shot names its effects (`sfx: [{ sound: 'phone_buzz', at: 1.2, gain: 0.6, align: 'start' }]`): by default the
  loudest moment lands on `at`. `B.ambience([...])` lays looped beds under the edit, from one shot to another, with fades.

Everything sits on one clock (`core/edit.js`, on the exporters' frame plan): subtitles, live playback, Export MP4 and the
offline mix use the same times. To change a voice, a delivery or a sound, ask Claude (for example "Claire more tired",
"a woodpecker far away in 1D").

## Previs of the edit (real-time playback and MP4)

* **Real time, in the viewer.** **▶ all** in the timeline switches to the lens view and plays every shot back to back on your GPU,
  letterboxed to the lens aspect, with the stand-ins moving between their beat marks, subtitles, voices, effects and
  ambience. **L** goes back to the world view; **♪ sound** mutes.
* **Export MP4** (top bar, or step 5) renders the same sequence frame by frame on your GPU and encodes it in the browser with
  WebCodecs (H.264 where the browser has it, else VP9 or AV1), with the sound mixed through a limiter (AAC, else Opus), then downloads the file.
  Options: all shots or the current one, 1280 to 3840 wide, supersampling 1 to 2×, 24/25/30 fps, burn-in (shot, lens, rig,
  timecode, action text, subtitles), dialogue on or off. Nothing is uploaded. Recent Chrome, Edge, Safari or Firefox.
* **Offline, headless:** `node tools/render_mp4.mjs scenes/<project>/<scene>.json out.mp4 [--fps 24] [--width 1920] [--height 804] [--ss 1.5] [--fast] [--shots 1A,1B]`
  renders the same frames in headless Chromium, encodes H.264 with `ffmpeg` and lays the dialogue on (AAC; `--no-audio` to skip).
  Use it on a machine with a GPU, or for automation.
  Without a GPU Chromium falls back to a CPU renderer (SwiftShader) at about 1 to 3 frames per second; `--fast` (Lambert shading,
  lighter shadows, no logarithmic depth) and `--width 1280 --height 536 --ss 1.5` keep previews quick. Split long scenes with
  `--shots` across processes (with `--no-audio`), join the parts with `ffmpeg -f concat -c copy`, then lay the sound on with
  `node tools/mix_dialogue.mjs <scene.json> joined.mp4 final.mp4`.
* `--ss` / supersampling renders more pixels and filters them down, so thin edges do not crawl during moves.
* Shadows are fitted to the area where the action is (4096 map, 2048 in fast mode), so they stay sharp and stable.

## Director of photography (`core/dp.js`)

The DP reads a frame like a cinematographer and composes cameras for a **narrative intent**. It is deterministic: the
same scene gives the same frame, with the reasoning written next to it.

* **Composition analysis** — `composition(scene, shot, pose, blocking)`: where the eyes sit on the grid (thirds, phi,
  quarters, centre), look room and short-siding (from where the head actually points), headroom from the head's
  silhouette, the lens angle on the eyes (high / low), the face angle (frontal, three-quarter, profile), lens and
  distance on faces (perspective), trunks growing out of a head, the horizon through the neck, frame edges on joints,
  balance and negative space, depth of field. Each note carries a fix ("pan right 3°", "raise the camera 0.3 m").
* **Intents** — `establish neutral intimacy direct conflict isolation vulnerability power tension observation wonder
  detail calm childhood`: each maps to ranges of size, lens, vertical angle, face angle, grid, look room, headroom,
  dutch and depth of field (see the skill's `references/intents.md` for the rationale and the research).
* **Composer** — framing definition `{ "type": "compose", "intent": "intimacy", "size": "CU", "side": 1 }`: searches the
  lenses of the kit inside the intent, the face angles and heights it allows, solves the distance for the size, aims
  the eyes onto the grid, and keeps the frame that scores best on the shot check plus the composition. Options:
  `focal` (lock the lens), `side` with the shot's `line` (stay on one side of the 180° axis), `povOf` (the lens at a
  character's eye height — a point of view), `grid`, `look`, `vAngle`, `face`, `ffEq`. A `raw` key can take
  `frame: { subject, u, v }` to place a figure on the grid from a fixed set-up. The reasoning is stored in `shot.dp.why`.
* **DP report** — `dpReport(scene)`: every shot against its `dp.intent`, plus the coverage rules across shots: reverse
  singles must match lens, eye height, angle, face angle and look (`node tools/dp_report.mjs scene.json`).
* In the viewer (step 3 · Camera): the **DP · composition** panel picks the intent, **Compose for this intent**
  recomposes the shot, and the live read shows the score and the notes; the **grid** button over the viewport switches
  the composition grid drawn over the lens view (thirds → phi → quarters → centre → none).

![DP panel and phi grid over the lens view](docs/dp_panel.jpg)

`tools/contact_sheet.mjs` on TIMELESS Scene 1 after the DP pass — the grid, the eyes as the DP measured them (red), the
intent and the score of every frame:

![contact sheet](docs/dp_contact_sheet.jpg)

## Film editor (`core/editor.js`)

`editReview(scene)` reads the cut the way an editor does — what can be measured is measured, emotion and story stay
with the editor (Murch's rule of six weighs them 51 % and 23 %):

* **Every cut**: eye-trace (how far the eye jumps between the last frame of A and the first of B), size step and camera
  angle on the same subject (30° rule, axial cuts accepted), the 180° line, eyelines that meet in shot / reverse shot,
  screen direction of a character moving across the cut, cutting in movement, a camera still travelling into a still
  frame, sound bridging the cut (J / L), a line ending right on the cut, reaction cuts. A "craft" score weighs the four
  measurable criteria with Murch's weights.
* **Every shot**: what it carries (its lines plus a beat, its move, its action, the time to read a frame of its size the
  first time) against its length. A line that runs past the cut on purpose (L-cut) only needs its first second.
* **The rhythm**: ASL, median, variation (CV), monotone stretches (four shots of the same length read as a metronome),
  acceleration toward the end, against a tempo (`scene.edit.tempo`: contemplative, drama, dialogue, tension, action).
* `node tools/edit_report.mjs scene.json --tempo drama`, or **Edit report** in step 5 · Review.

## Review: notes from the director, the VFX supervisor and the artists

Step 6 is the review table of the scene. Everyone writes as themselves, with a role — **Director**, **VFX
supervisor** or **Artist** — and every note says who wrote it, when, and where:

* **Scene notes** on the whole scene (tone, coverage, a VFX approach), and **shot notes** on the selected shot at the
  current moment of its timeline.
* **✎ Mark this frame** freezes the frame you are looking through and opens a drawing layer: pen, arrow, circle, text,
  colour (your role's by default), undo. The marks are saved with the note as vectors (they redraw at any size) and as
  a picture of the marked frame. **Go to frame** looks through that shot at that moment and draws the marks over the
  live lens view.
* Replies under each note; **resolve** (the note's author, a director or a VFX supervisor) and **reopen**; filters for
  open / resolved notes and by role; a count of open notes on the step button; **Export** writes the notes as Markdown.

Who is writing depends on where the page runs:

* **As a claude.ai artifact (shared, signed in):** identity comes from each person's claude.ai account; notes are shared
  live with everyone who opens the page. The owner (the director by default) assigns roles in **team · roles** —
  search a colleague, pick a role; people without a role write as artists. Storage: `review/roles` (only the owner and
  editors write it) and one document per person, `notes/<id>` (each person writes only their own: their notes and
  their resolutions; a resolution counts when it comes from the note's author, a director or a VFX supervisor). Marked
  frames are uploaded as the artifact's assets.
* **Anywhere else (GitHub Pages, a local server):** a local profile — name and role — kept in this browser (not a
  verified login), and the notes saved inside the scene file (`scene.review`), so **Save JSON** keeps them and they
  travel with the scene.

## Skills: a DP and an editor for Claude

`.claude/skills/director-of-photography` and `.claude/skills/film-editor` (at the repository root) turn the engines
into a repeatable method for Claude: read the scene for intent, plan coverage, compose with the engine, verify with the
reports and with the contact sheet (looked at, not only measured), iterate to a quality bar, write the reasons down.
Each has research references with sources (Mascelli, Arijon, Block, Murch, Dmytryk, Bordwell, Cutting, Smith, and
perception studies on camera angle and face distance) and evals in the `claude plugin eval` format.

## Exports

* **Camera sheet** (`.md`): per shot — lens, filmback, FOV, rig and move (length, speeds, pan/tilt, lens heights, crane pivot/arm), key positions, distances, warnings.
* **Blender script** (`.py`): rebuilds proxies and stand-ins in collections, one camera per shot with the real gate and focal, animation baked at 24 fps from the rig solver (including handheld / Steadicam texture), timeline markers that switch cameras. Run it from Blender's Scripting tab; from Blender, export USD / FBX to Unreal.
* **JSON**: the scene itself (also autosaved in the browser).
* **DP report** and **Edit report** (`.md`) from step 5 · Review, or all four files at once with `node tools/export_sheets.mjs scene.json`.

## Workflow for a new scene

1. Describe the location, props and characters in a build script (see `scenes/demo/build.mjs`) or draw them in the viewer with the + buttons; mark what is observed vs inferred.
2. Add beats (blocking states) and shots with framing definitions; `node scenes/<project>/build.mjs` prints the shot check report.
3. Open the viewer, walk the shots, look through the lens, nudge objects or keys, re-solve, play the edit in real time, export.
4. When a reference image for the location exists, reconstruct it (e.g. Higgsfield 3D Jutsu → GLB) and drop the GLB into the scene as a `gltf` object; keep the proxies for what the photo does not show.

## Status

v0.5 — viewer + deterministic core, Unreal-style mannequins with acting and articulated hands, subject following,
real-time screening, in-browser MP4 export, editorial timing, sound, a director of photography (composition analysis,
intents, composer, DP report) and a film editor (cut review, timing, pacing) with their Claude skills, a review step
with notes and frame markup by role (shared and signed in on claude.ai, local elsewhere), and TIMELESS Scene 1
recomposed by intent (DP 96/100, edit 100/100). Next: scoring wide frames and tangents beside a head in the DP, more
TIMELESS scenes, USD/FBX camera export, Unreal bridge, stand-in animation clips.
