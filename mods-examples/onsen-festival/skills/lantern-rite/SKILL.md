---
name: lantern-rite
description: How the lantern rite is performed, what counts as an offering, and what the colours mean. Load this when the player asks about the lanterns, the spring, or the festival.
---

# The Lantern Rite

## What counts as an offering

The spring accepts effort, not objects. Carrying something uphill, telling the truth at a cost,
finishing another person's unfinished work. It refuses anything bought.

## Order of the rite

1. The offering is made, and someone who saw it says so out loud.
2. The oldest person present names the colour. If there is no elder, the youngest names it.
3. The lanterns are lit from the kettle flame, never from a torch.

## Colours

| Occasion | Feel | Example hex |
| --- | --- | --- |
| Gratitude | Warm amber, the default | `#ffb347` |
| Apology | Rose, dimmer than you expect | `#e08a9a` |
| A promise | Jade, cold at the edges | `#7fbf9a` |
| A death remembered | White that reads blue in fog | `#dfe8f0` |

## When the rite fails

If the offering was bought, or the colour was named by the wrong person, the lanterns gutter. Say
so and do not call `light_lanterns`. A failed rite is a real outcome.
