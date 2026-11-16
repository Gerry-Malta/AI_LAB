# Intent profiles

The composer (`layout_studio/core/dp.js`, `INTENTS`) turns a narrative intent into ranges and searches inside
them. Ranges, not single values, so the frame can still answer the set (an occluder, a tree behind the head, the
ground). Focal lengths are **full-frame equivalent** (the engine converts to the shot's camera; on ALEXA 35 open
gate at 2.39:1 divide by about 1.43). Vertical angle is the lens above (+) or below (−) the subject's eyes; face
angle is degrees off the face axis (0 = into the lens, 90 = profile).

| intent | sizes | lens FF eq. | v-angle | face | grid | look | headroom | DoF | move |
|---|---|---|---|---|---|---|---|---|---|
| neutral | MS MCU CU | 35–125 | −5…5 | 15…50 | thirds | long | normal | any | static or motivated |
| establish | EWS WS | 18–50 | 5…35 | — | thirds | long | normal | deep | slow crane / drone descent |
| intimacy | CU MCU BCU | 65–140, ≥1.2 m | −4…4 | 8…30 | phi | long | normal | shallow | static, slow push on a realisation |
| direct | CU BCU MCU | 55–125, ≥1.2 m | −3…3 | 0…10 | centre | centre | normal | shallow | static |
| conflict | MCU CU | 50–125, ≥1.1 m | −5…5 | 15…40 | thirds | long | normal | shallow | matched singles, tighter as it escalates |
| isolation | WS FS EWS | 18–40 | 8…40 | 20…120 | quarters | long | generous | deep | static or slow pull-out |
| vulnerability | MS MCU FS | 28–60 | 10…35 | 15…60 | thirds | long | generous | any | static or slow pull-back |
| power | MS MCU MLS | 28–50 | −30…−8 | 10…45 | centre | long | tight | any | static |
| tension | MCU CU | 24–45 | −12…12 | 5…45 | quarters | short | tight | shallow | static or creeping push |
| observation | FS MLS WS | 85–200 | −3…10 | 30…100 | thirds | long | normal | any | static on a long lens |
| wonder | EWS WS | 14–35 | −25…2 | — | thirds | long | generous | deep | slow tilt-up / crane |
| detail | INSERT ECU | 70–200 | 25…75 | — | thirds | centre | normal | shallow | static |
| calm | WS FS MS | 35–90 | −3…3 | 0…40 | centre | centre | normal | deep | static |
| childhood | MS MLS MCU FS | 24–50 | −6…6 (at the child's eyes) | 10…60 | thirds | long | normal | shallow | low and close |

## Why each one

- **neutral** — the classical, "invisible" style: eye level, three-quarter faces, the eyes on the upper third,
  room in front of the look. The audience never notices the camera. Use it when the scene's power is in the
  performance and the dialogue, not in the frame.
- **establish** — orientation before cutting: the audience needs to know who is where before it can follow
  eyelines and screen direction (continuity editing depends on it). Slightly high and deep so the geography reads;
  the horizon on a third, not through the middle.
- **intimacy** — the eyeline close to the lens makes the look land on the audience; eye level keeps it equal.
  Distance matters more than focal length: faces photographed from inside personal space are judged less
  trustworthy, less competent and less attractive, without the viewer noticing the distortion (Bryan, Perona &
  Adolphs 2012). So: a longer lens from conversational distance (≥ 1.2 m).
- **direct** — frontal and centred: the character addresses us (confession, accusation). Use sparingly: it breaks
  the invisible style on purpose.
- **conflict** — matched singles keep the two sides equal and readable; escalation is played by tightening the
  sizes (MCU → CU → BCU), not by moving the camera off the axis.
- **isolation** — Hitchcock's rule inverted: a small figure in a big empty frame reads alone; pushing it to the
  quarter line enlarges the negative space; a high angle diminishes.
- **vulnerability** — looking down on someone makes them read weaker (Kraft 1987 found pictures taken from below
  eye height were rated stronger and more active than the same people from above). The evidence is real but not
  simple — later work found smaller or context-dependent effects — so use the angle with the performance, not
  instead of it.
- **power** — the inverse: a low angle and tight headroom let a character own the frame.
- **tension** — short-siding (the character looks into the near edge) denies them room, reads unbalanced, trapped
  (used with restraint by Fincher and Refn; as a default it becomes a gimmick). A wider lens close in exaggerates.
- **observation** — a long lens from far away watches without being part of the scene: compression, a voyeur's
  distance.
- **wonder** — low and wide, the horizon low: the sky and the landscape get their size.
- **detail** — the insert exists because the story needs this object now: fill the frame with it (Hitchcock's
  rule), isolate it with focus.
- **calm** — affinity: level, symmetric, static; nothing pushes against the frame. The release after a peak.
- **childhood** — the lens at the child's eye height turns adults into giants and grass into a forest: the world
  from inside it.

The roll range is what an intent allows: the composer tilts the horizon only when the minimum is above zero
(`roll: [6, 10]` asks for a decided dutch). A two-degree tilt reads as a mistake, not a choice.

## Tuning a profile per shot
Any field can be overridden on the key definition or in `dp`: `grid`, `look`, `vAngle`, `face`, `ffEq`,
`headroom`, `roll`, `dof`, `minFaceDist`. Example — a tension single that must stay at eye level on a 50 mm:
`{ type: 'compose', intent: 'tension', vAngle: [-3, 3], focal: 50 }`.
