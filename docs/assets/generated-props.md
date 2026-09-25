# Milestone: generated prop sprites

Fifteen transparent source PNGs were produced with the built-in ImageGen tool and saved under
`src/assets/generated/props/`. The first four were saved in the preceding session; the remaining
eleven were generated after the tool limit reset. No API fallback was used. Both land renderers now
load them into one 384×384 runtime atlas, cropping transparent padding and fitting each source to a
96×96 cell. The source PNGs stay intact.

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
| `chimney.png` | Tall weathered brick factory chimney with iron bands and soot at the opening |
| `steel_tower.png` | Old steel transmission tower with open lattice legs and small insulators, no external wires |
| `windmill.png` | Countryside windmill with a stone base and four wooden sails |
| `breakwater.png` | Modular Japanese coastal breakwater segment made of sea-worn concrete tetrapods |
| `signpost.png` | Weathered wooden countryside signpost with two arms and no lettering |
| `machine_gear.png` | Compact exposed brass and dark iron gear machine |
| `conveyor.png` | Short factory conveyor belt with rubber belt and steel rollers |
| `boiler.png` | Squat riveted iron boiler with pressure gauge and firebox |
| `pipe_stack.png` | Cluster of upright industrial pipes with elbows and valves |
| `crane.png` | Compact industrial yard crane with lattice boom and hook |
| `reactor.png` | Fantasy industrial reactor core with pipes and restrained teal light |

Each is an RGBA PNG with transparent padding. The runtime atlas bounds each subject by its alpha
channel and scales it into a cell before either the 16-bit or HD-2D view uses it. A separate E2E
record must confirm the in-game scale and appearance in both looks.
