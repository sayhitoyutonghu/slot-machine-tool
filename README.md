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

## Controls

**Format** — 9:16 / 1:1 / 16:9, reel count, row count, gap.
**Motion** — spin time, stagger between reels, overshoot (the reel passes its
stop and settles back), motion blur.
**Look** — outline weight, how often a logo tile appears, your own logo file,
six editable colours, reseed.
**Degrade** — scanlines, chroma shift, grain, applied as a pass over the
finished frame so it can be dialled after seeing the motion.

The palette ships sampled from the reference footage rather than guessed.

## Export

**PNG** grabs the current frame. **REC** records a spin and saves `.webm`.

To convert:

```
ffmpeg -i slot.webm -c:v libx264 -crf 16 -pix_fmt yuv420p slot.mp4
```

## Reference

`mtv2021.mp4`, 10–15s. 1920×1080, 29.97fps.
