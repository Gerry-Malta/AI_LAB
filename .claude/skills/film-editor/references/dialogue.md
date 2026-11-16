# Cutting dialogue

## Split edits
- **J-cut** (audio lead): the next shot's sound begins before its picture. It pulls the audience into the next shot:
  we hear the answer and then see who says it. Layout Studio: `at: -0.4` on the first line of the next shot.
- **L-cut** (audio lag): the current sound continues over the next picture. It shows the listener while the speaker
  is still talking — the reaction becomes the event. Layout Studio: `lap: true` on the line.
- Split edits keep a two-person conversation from feeling like a tennis match (cut on every line) and let you choose
  the best picture and the best sound independently. There is no fixed overlap length: long enough to keep the
  meaning, short enough that the audience still links voice and face; follow the speech rhythm.

## Reactions
- The listener is often the scene. Cutting to the reaction while the line is still going (L-cut) tells the audience
  how to read the line.
- **Kuleshov effect:** the same neutral face is read differently depending on what it is cut against (Kuleshov's
  experiments; replications with improved designs and fMRI found a real but context-dependent effect — Mobbs et al.
  2006, Barratt et al. 2016, a 2017 Frontiers study). Editing creates meaning; a reaction shot borrows its emotion
  from what precedes it.

## Where to cut inside a conversation
- On the thought, not on the syllable: after the line has landed (0.3–0.6 s), or before the answer starts if the
  answer is the surprise.
- Hold the face that changes. A line that hurts plays on the person it hurts.
- Escalation tightens sizes (the DP plans MCU → CU → BCU); the edit quickens the exchange toward the peak and then
  lets a silence play.
- Avoid "radio cutting": each line in its own shot, every cut on the first and last syllable.
- Overlaps and interruptions belong in the sound; cut picture to the face that matters.

## The engine's checks
`edit_report` counts J-cuts, L-cuts, cuts bridged by sound and reaction cuts, flags a line that ends right on a cut
with no bridge ("no room to land") and a next line starting on the first frame ("radio-play cut"), and checks that
eyelines meet across shot/reverse cuts.
