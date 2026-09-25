# Generated prop sprites · 2026-09-25

Four transparent source PNGs were produced with the built-in ImageGen tool and saved under
`src/assets/generated/props/`. They are source candidates, not wired into the game yet. The
remaining eleven of the planned fifteen props could not be generated: the tool returned
`usage_limit_reached` on the next requests. No API fallback was used.

All four prompts used this shared instruction:

> One standalone 16-bit pixel-art game prop sprite for a top-down/HD-2D adventure. Hand-placed
> chunky pixels, muted earthy colours, dark clean outline, same scale as a 64-pixel RPG character
> sprite. One complete isolated object, slight three-quarter game view, generous genuinely
> transparent padding. No ground plane, cast shadow, extra objects or watermark.

| File | Subject instruction |
| --- | --- |
| `utility_pole.png` | Japanese countryside utility pole with one crossarm and a few insulators, weathered wood and dark metal, no wires beyond the sprite |
| `vending_machine.png` | Retro Japanese roadside vending machine, weathered cream enamel case, simple coloured drink windows, no readable lettering |
| `bus_stop.png` | Small Japanese countryside bus stop: weathered upright sign pole with a simple round marker and compact bench under a tiny roof, no readable lettering |
| `rail_track.png` | Short straight section of narrow railway track on wooden sleepers and gravel, slight three-quarter angle |

Each is an RGBA PNG; the alpha channel is transparent around the subject. Before use in the
16-bit atlas, these large source images need size and style matching against the current CC0 and
actor sprites. The work is incomplete until all intended props are generated, processed and
visually checked in both looks.
