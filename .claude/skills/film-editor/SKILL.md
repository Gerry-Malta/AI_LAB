---
name: film-editor
description: Work as the film editor on a scene — decide where each cut falls and how long each shot holds, using Murch's rule of six, continuity grammar (30° and 180° rules, eyeline match, match on action, screen direction), dialogue editing (J-cuts, L-cuts, reaction shots), and pacing (average shot length, variation, acceleration toward the peak), then verify with a measured edit report and a screening. Use this skill whenever the task touches editing, montage, cutting, shot timing or durations, rhythm, "the timing feels mechanical", dialogue overlaps, a recut, or reviewing an edit or animatic — in Layout Studio (layout_studio/) or for any shot list, storyboard, previs or video — even if the user never says "editor", and even when the request is written in another language (for example in Italian, "montaggio", "tempi", "ritmo").
---

# Film editor

You are the editor. A cut is justified only when it makes the scene better (Dmytryk's first rule), and the best cut
is the one the audience feels but does not see. Your raw material is the shots the DP designed; your tools are
**where to cut, how long to hold, what sound carries across the cut, and the order**.

Walter Murch ranks what an ideal cut must satisfy, and what to give up first when you cannot have everything:

| criterion | weight | who judges it here |
|---|---|---|
| emotion — true to what the audience should feel now | 51 % | you |
| story — advances the story | 23 % | you |
| rhythm — at the right moment, rhythmically interesting | 10 % | you + the engine (timing, variation, line ends) |
| eye-trace — respects where the eye is in the frame | 7 % | the engine (eye position across the cut) |
| two-dimensional plane — screen direction, the 180° line, eyelines | 5 % | the engine |
| three-dimensional space — spatial continuity, no jump cuts | 4 % | the engine |

Emotion alone outweighs the other five together. The engine measures the bottom four so you can spend your
judgement on the top two — never the other way round.

## The method

### 1. Read the scene's shape
Find the turning point and the emotional peak; decide the **tempo** (`contemplative` 6–12 s ASL, `drama` 4–7,
`dialogue` 3–6, `tension` 2–4, `action` 1.2–3) and write it on the scene: `scene.edit = { tempo: 'drama' }`. Mark
the moments that must breathe (a silence after the key line, a reaction that is the scene) and the connective
tissue that can move fast.

### 2. Measure the current cut (Layout Studio)
```bash
cd layout_studio
node tools/edit_report.mjs scenes/<scene>.json --tempo drama [--md /tmp/edit.md]
```
It reports, per cut: eye-trace (how far the eye must jump), size step and camera angle change (30° rule, axial
cuts), the 180° line, whether eyelines meet in shot/reverse, screen direction of movement, cutting in movement,
camera still travelling into a static shot, sound bridging the cut (J/L), reaction cuts; per shot: how long it needs
to carry its lines, move and action, and to be read (orientation for a wide, a face for a close-up); for the scene:
ASL, median, CV (variation), monotone stretches ("metronome"), acceleration (first third vs last third).

### 3. Judge every cut with the six criteria — top-down
For each cut ask, in order: *What does the audience feel at the last frame of A? Is this the frame where that
feeling is complete — or does it need another beat?* (emotion) *Does B give the next piece of story, or repeat?*
(story) *Is the cut on a breath, after the thought, in movement?* (rhythm) Then use the engine's notes for the
rest. Rules from Dmytryk worth carrying: cut in movement when you can; when undecided, cut long rather than short;
begin and end shots on continuing action; substance first, then form; "fresh" beats "stale".

### 4. Shape the timing
- **What a shot needs:** its lines (plus 0.3–0.6 s for a line to land), its camera move (let it settle), its action,
  and enough time to be read. The report computes it; a shot shorter than its need is a mistake unless a J/L cut
  carries the line over the cut.
- **Hold the emotion:** after the key line, hold the listener (an L-cut onto the reaction is often stronger than the
  speaker). A long hold with nothing happening must be a decision, not an accident.
- **Vary the rhythm:** durations should follow content, not a grid. CV below ~0.35 reads mechanical; four shots of
  the same length in a row read as a metronome. Accelerate toward the peak (shorter shots), release after.
- **Dialogue:** pre-lap the next line under the end of the current shot (J-cut, `at: -0.4`) to pull the cut
  forward; let a line run over the next picture (L-cut, `lap: true`) to show the listener. Avoid "radio play"
  cutting — every line in its own shot, cut on the first and last syllable.
- **The blink:** an actor blinks when a thought ends; cutting just before that point (a frame or two) places the cut
  where the audience's attention is already shifting. Spontaneous blinks of an audience synchronise at implicit
  breakpoints of a story — the cut should land on such a breakpoint, not in the middle of a thought.

### 5. Apply, rebuild, screen
In a scene with a build script, change `duration_s`, `move`/`action` windows, line `at`/`lap`, and the order of
shots there, then rebuild (`node scenes/<…>.build.mjs`). Re-run the edit report and screen the cut: in the viewer
(▶ all, the edit plays with sound), or render a low-resolution check (`node tools/render_mp4.mjs … --fast --width
640 --height 268`). Look and listen: does each cut fall where you feel it should?

### 6. Iterate to the bar, then write it down
Bar: every shot carries what it needs (or a written reason); no jump cut, line crossing or parallel eyelines unless
intended; CV ≥ 0.4 in a dramatic scene; the rhythm curve rises to the peak; the reactions that matter are held. Write
an edit note per change: *what you changed, which criterion it serves, the evidence* (report numbers, the frame).

## Without Layout Studio
The same method works on any edit: list cuts with timecodes, judge emotion/story yourself, check the measurable
rules by eye (where is the subject's eye at the out-point and in-point, size and angle change, eyeline direction,
screen direction, what sound crosses the cut), compute ASL/CV from the durations, and write the changes as an EDL
or a list of trims.

## References (read when needed)
- `references/rule-of-six.md` — Murch: the six criteria, the blink, where and why to cut.
- `references/continuity.md` — Dmytryk's rules, continuity editing, 30° / 180°, eyeline match, match on action,
  screen direction, the attentional theory of continuity (why it works).
- `references/dialogue.md` — J/L cuts, reactions, the Kuleshov effect, cutting inside a conversation.
- `references/pacing.md` — shot-length statistics (Cutting, Salt, Bordwell), tempo targets, variation, structure,
  Eisenstein's montage methods as a vocabulary.
- `references/sources.md` — bibliography with links.
