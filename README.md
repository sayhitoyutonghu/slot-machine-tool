# Slot Machine Tool

Vertical reel transitions in the style of MTV's 2021 music bumpers (10–15s of the
reference cut): a row of reels, each scrolling its own strip of flat graphic
tiles, **landing one after another** rather than together. The stagger is what
makes it read as a slot machine instead of a wipe.

Everything renders to a single canvas, so a take can be captured straight to
video — no screen recording, no dropped frames.

## Use

Open `index.html`. Press **SPIN**.

`?autospin` starts a spin on load — useful when recording the tool itself.
Add `&ratio=9:16` (or another supported ratio) to preview a specific format.
`?payoff&ratio=9:16` freezes the completed end frame for art-direction review.
`?match&ratio=9:16` freezes the enlarged three-logo hold frame.
`?merge=.5&ratio=9:16` freezes the geometric merge halfway through.

## Controls

**Format** — 9:16 / 1:1 / 16:9, reel count, row count, gap.
**Motion** — spin time, stagger between reels, overshoot (the reel passes its
stop and settles back), motion blur.
The collapse payoff grows from the second visible row in the default grid.
With **Merge logo on payoff** enabled, the matching reel tiles hand off to one
large centered logo and the panel dividers disappear. This is the recommended
ending for 9:16 because the full-frame backdrop carries the tall composition
instead of leaving three isolated marks in narrow columns.
**Match hold** begins only after the matching row has expanded into three tall
panels, so that enlarged jackpot remains on screen before the merge. **Merge
time** controls the following transition into the single final logo.
**Winning color** sets the ground colour shared by all matching logo tiles for
the next spin and its MP4 export.
**Look** — outline weight, how often a logo tile appears, your own logo file,
six editable colours, reseed. The supplied WTV logo is loaded by default and
can be replaced from the Logo file control.
**Degrade** — scanlines, chroma shift, grain, applied as a pass over the
finished frame so it can be dialled after seeing the motion.

The palette ships sampled from the reference footage rather than guessed.

## Export

**PNG** grabs the current frame. **MP4** renders the complete spin, staggered
landing and collapse frame by frame, then downloads a true H.264 `.mp4` at
30fps. The exporter requires a current browser with H.264 WebCodecs support,
such as Chrome or Edge.

## Reference

`mtv2021.mp4`, 10–15s. 1920×1080, 29.97fps.
