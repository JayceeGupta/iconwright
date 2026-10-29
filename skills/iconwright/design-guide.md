# Icon design guide

Rules for icons that read well where they're used. Apply them when choosing styles for `design_icons` and when judging `preview_icon` scenes.

## Size

- **Taskbar, title bar and browser tab icons are 16 to 24 px** at 100% scaling (24 px on the Windows taskbar, 32 px in Start, 16 px in Explorer lists and favicons). Judge every design at those sizes, using the `sizes` scene.
- **Bold, simple shapes survive; detail dies.** Thin outlines (stroke icons), text and small interior gaps turn to mush at 16 px. For tiny sizes prefer filled ("-fill", "-solid", "-bold") variants of an icon set.
- **One idea per icon.** A note, a rocket, a folder. Two combined objects rarely read below 32 px.

## Contrast

- **Bare glyphs inherit the taskbar color.** A white glyph disappears on a light taskbar and a black one on a dark taskbar. Either give it a background (`bg` + `shape`), or pick a mid-tone color that holds on both (check both rows of the `taskbar` and `sizes` scenes).
- **Backgrounds make an icon self-contained**: it reads on any surface. Aim for strong contrast between glyph and background, such as white on a saturated color or a dark glyph on a pale one.
- **Gradients**: two neighbors on the color wheel (`linear-gradient(135deg,#e9c46a,#c47335)`) look polished; opposite colors look muddy at small sizes.

## Consistency

- **A set of icons shares one treatment**: all bare glyphs, or all on the same shape with the same padding. Mixing makes tiles look larger than glyphs.
- **Restyling a whole taskbar**: `source: "app"` keeps every app's own logo, so one color or one background shape unifies them without losing recognition.
- **Matching an existing set**: preview with the user's own apps around the icon (the `taskbar` and `start` scenes do this on Windows).

## Platforms

- **Windows** accepts any shape, including bare glyphs. `.ico` holds every size from 16 to 256 px.
- **macOS and iOS** expect a full rounded-square tile (`shape=squircle` with a background). A bare glyph looks lost in the Dock, and iOS fills transparency with black.
- **Android** crops icons to a circle or squircle. Keep the artwork in the middle 66% (padding around 0.2).
- **Web**: the favicon is 16 px in a tab, on light and dark tab strips. The `web` export adds a maskable icon with safe padding for Android home screens.

## Defaults that work

| Look | Style string |
| --- | --- |
| Clean white glyph for a dark taskbar | `color=white` |
| App tile | `color=white bg=#2d5ba6 shape=squircle` |
| Soft, friendly | `color=#25282d bg=#f3e8d2 shape=circle padding=0.24` |
| Polished gradient | `color=white bg=linear-gradient(135deg,#7b3f92,#2d5ba6) shape=rounded shadow` |
| Dark mode tile | `color=#e9c46a bg=#1f2228 shape=squircle` |
