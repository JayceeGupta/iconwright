# Taskbar and apps

On Windows, iconwright can change any app's icon, and pin, unpin and reorder taskbar apps. This page explains what each change does and what you'll see.

## Change app icons

> Give Spotify a white icon on a dark circle.

iconwright makes the icon and puts it on the app's Start menu shortcut and its pinned taskbar shortcut (`app_apply_icon`). The app's own files are never touched.

- **Open windows update right away.**
- **Pinned apps that aren't running** keep their old picture until Explorer restarts. iconwright tells your agent when that's the case, and the agent can restart Explorer once at the end of all your changes (`taskbar_refresh`).
- **Many apps at once** cost the same as one. Ask for all of them in one sentence.

### Restyle each app's own icon

> Make all my taskbar icons white.

Instead of one shared picture, iconwright takes each app's current icon and restyles it: recolored, on a background, in a shape. This is how you get a uniform taskbar while every app keeps its recognizable logo. Under the hood that's `source: "app"`.

Preview first if you're unsure:

> Show me what Spotify, Steam and Discord would look like in white, and in white on dark circles.

### Use an icon file you already have

> Use C:\Icons\notes.ico for Notepad.

Any `.ico` works, and so do icons inside `.exe` and `.dll` files.

## Pin, unpin and reorder

> Pin Notepad and Calculator, unpin Edge, and put Notepad first.

All of that happens in **one** step (`taskbar_pins`). Windows only reads the pinned-apps list when Explorer starts, so iconwright restarts Explorer once:

- The taskbar and desktop blink for a second or two.
- **Open File Explorer windows close.** Other apps keep running.
- Tray icons may take a moment to come back.

Before every change, iconwright backs up the pinned-apps list. If anything fails halfway, it puts everything back exactly as it was.

Not sure what the result will be? Ask for a dry run:

> What would my taskbar look like if I pinned Notepad at position 3?

### Undo a pin change

> Undo my last taskbar change.

That restores the pinned-apps list from just before the latest change (`taskbar_restore_backup`). To go all the way back to how it was before you ever used iconwright, ask for the **original** backup.

## Check what's pinned

> What's on my taskbar?

This lists your pinned apps in order with their icon files (`taskbar_status`). To find an app's exact name, or to see where its shortcuts are, ask for its details (`find_apps`).

## Things to know

- **App updates can undo custom icons.** Some apps rewrite their Start menu shortcut when they update. Apply the icon again.
- **Store apps** (like Apple Music) get their pinned icon changed, but a running window may still show the app's own icon in some places.
- **The first pin needs an existing pin.** iconwright copies part of the pin format from an app that's already pinned. If your taskbar has no pins at all, pin any app by hand first.
- **Taskbar styling tools** such as TranslucentTB can turn themselves off after Explorer restarts quickly twice in a row. iconwright notices, restarts them, and can space out restarts on request. See [Safety and risks](safety.md#explorer-restarts).

## Undo icons

> Put Spotify's original icon back.
>
> Undo every icon change.

(`restore_icons`.) iconwright recorded each original before changing it.
