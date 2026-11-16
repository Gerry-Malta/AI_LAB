# Composition reference

What the engine measures (`composition()` in `layout_studio/core/dp.js`) and why. Frame coordinates are fractions:
`u` from the left edge, `v` from the top edge.

## Contents
1. Grids · 2. The eyes · 3. Headroom and the size's cut · 4. Look room and short-siding · 5. Balance and negative
space · 6. Depth and separation · 7. Mergers and tangents · 8. Cuts at the joints · 9. Hitchcock's rule ·
10. Contrast and affinity across a scene

## 1. Grids
| grid | lines | character |
|---|---|---|
| thirds | 1/3, 2/3 | the default; balanced off-centre placement, four power points |
| phi (golden section) | 0.382, 0.618 | the same layout pulled toward the centre: subtler, more intimate for close shots |
| quarters | 1/4, 3/4 | pushes the subject toward the edge: more space around it, wider feel — isolation, tension |
| centre / symmetry | 1/2 | confrontation, formality, stillness, the "Kubrick" frame; also a frontal direct address |
| dynamic symmetry | diagonals and reciprocals of the frame | a painter's system cinematographers used early on; place lines of action and limbs along the main diagonal or its parallels |

The thirds grid puts its lines at 33.3/66.7 %, the phi grid at about 38.2/61.8 %; neither is "better" — they are
choices of tension. Treat them as guides, not law: there is no scientific proof that thirds are more pleasing; they
are a convention that works because it avoids dead-centre stasis and edge crowding.

## 2. The eyes
- In a single, the eyes are the point of interest. Horizontally they sit on the grid line on the **back side** of
  the look (a long look), so the space in front of the face is larger than behind it.
- Vertically the eyes sit near the upper line in medium sizes. The size sets how high they can go without cutting
  the head (the engine's ranges, fraction from the top): FS 0.08–0.24 · MLS 0.14–0.30 · MS 0.20–0.36 ·
  MCU 0.27–0.40 · CU 0.34–0.50 · BCU 0.38–0.55 · ECU 0.40–0.60.
- In a big close-up it is normal to cut the top of the head to keep the eyes high (the modern BCU), but never the
  chin of a speaking mouth.
- Two-shots: the two pairs of eyes on the two vertical lines of the grid (thirds: 1/3 and 2/3), or symmetric about
  the centre.

## 3. Headroom and the size's cut
Headroom is the space between the top of the head and the frame edge. Too much makes the subject sink and reads
as dead space; none makes the frame cramped. Ranges by size (fraction of frame height): FS 3–14 %, MLS 3–13 %,
MS 3–12 %, MCU 2–10 %, CU 1–8 %, BCU may cut the head. Intent modifies it: **tight** for power and tension,
**generous** for vulnerability and isolation. The size is defined by where the bottom edge cuts — between joints:
mid-thigh (MLS), waist (MS), mid-chest (MCU), upper chest/shoulders (CU), chin (BCU).

## 4. Look room and short-siding
Look room (nose room, lead room) is the space in front of the face in the direction of the look. The engine
measures the gaze from the horizontal heading of the head, so someone looking down-left still needs room on the
left. Standard: about two-thirds of the width in front (the eyes on the back third). Lead room is the same idea for
movement: more space ahead of a moving subject.

**Short-siding** frames the character looking toward the near edge. It denies the character room to be in the
picture: unbalanced, trapped, isolated, apprehensive. Used sparingly at moments of conflict it is strong (critics
cite *The Social Network*, *Drive*, *Mr. Robot*); used as a default it becomes a mannerism. The intent `tension`
asks for it; everywhere else the engine flags it.

## 5. Balance and negative space
Visual weight: size, contrast, faces and eyes, and the direction of a look (a gaze "weighs" toward where it goes).
The engine estimates a weight centroid (`balance.cx`) including the gaze. Symmetric intents (`calm`, `power`,
`direct`) want it near the centre; others want deliberate imbalance answered by look room. Negative space is the
part of the frame without figures or props: large for isolation, small for claustrophobia.

## 6. Depth and separation
Three layers — foreground, middle ground, background — give a flat screen its depth; the shot check counts them.
Separate the subject from the background by distance and focus (the engine reports the depth of field and whether
the background falls outside it), and by tone and colour (judge on the contact sheet). A dirty foreground (a
shoulder, a branch) adds depth and point of view; it may cover the body but never the eyes in a close or medium
shot.

## 7. Mergers and tangents
- A vertical line far behind the subject that lines up with the head — a trunk, a pole — "grows out of the head".
  The engine flags thin vertical objects behind the head; fix with a small move sideways or a different angle.
- An eye-level lens puts the horizon through the eyes: that is normal. Through the neck it reads as a cut; the
  engine flags that case.
- Tangents: edges that just touch (a head touching the frame top, a shoulder kissing the edge) create tension
  without meaning. The shot check flags subjects tangent to the frame edges.

## 8. Cuts at the joints
Do not let the frame edge cut through a joint (knees, ankles, elbows, wrists): the limb looks amputated. Cut between
joints. The engine lists the joints within 2 % of an edge.

## 9. Hitchcock's rule
"The size of an object in the frame should equal its importance in the story at that moment." Use it to choose
sizes (an insert of the phone when the phone matters; the figure small when she is alone) and to check a sequence:
is the most important thing the biggest or most contrasted thing in each frame? The rule is easy to say and hard to
measure — that judgement is yours on the contact sheet.

## 10. Contrast and affinity across a scene (Bruce Block)
Every visual component — space, line, shape, tone, colour, movement, rhythm — can be in contrast (difference) or
affinity (similarity). More contrast means more visual intensity. Map the scene's story intensity and make the
visual intensity follow it: affinity in the calm set-up, rising contrast (tighter sizes, stronger angles, more
depth contrast, short-siding) toward the turning point, affinity again in the release. Plan it as a curve over the
shot list before composing single frames.
