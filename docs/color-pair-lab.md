# Color Pair Lab

Color Pair Lab is a local-first workspace for checking foreground/background contrast ratios against common WCAG text thresholds.

## MVP features

- Validates and normalizes 3- and 6-digit hexadecimal colours.
- Calculates WCAG relative luminance and contrast ratio.
- Reports AA and AAA thresholds for normal and large text.
- Suggests black or white text based on the better ratio for the chosen background.
- Provides a live sample preview.
- Saves up to 50 named pairs in browser local storage.
- Exports the current pair and saved library as JSON, or copies CSS custom properties.
- Runs without accounts, third-party APIs or a server-side data store.

## Verification

Run the unit suite with Node.js 22:

```sh
node --experimental-strip-types --test tests/color-pair-lab.test.mjs
```

## Important limitations

This tool evaluates solid foreground/background colour pairs only. It does not inspect a rendered website, images, gradients, opacity, hover/focus states, font-weight/size semantics, or all WCAG criteria. A passing contrast result is one input to accessibility review, not a claim that a site conforms to WCAG.
