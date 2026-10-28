# The studio

iconwright studio is a visual editor for icons in your browser. Search for artwork, adjust colors and shapes with live previews, see the icon on a taskbar, desktop and phone, and download it. It uses the same engine as the agent tools, so what you see is exactly what you get.

There are two ways to use it:

| | Online studio | Local studio |
| --- | --- | --- |
| Open it | [iconwright studio](/studio/) | `node bin/iconwright.mjs studio`, or ask your agent to “open the studio” |
| Artwork | Iconify icons and pasted SVG | Also your own files and, on Windows, your installed apps' icons |
| Get the result | Downloads | Downloads, saving to a folder, and applying to apps on Windows |
| Install needed | No | Yes |

## Working in the studio

1. **Pick artwork** on the left: search, paste SVG code, or (local, Windows) pick one of your pinned apps to restyle its own icon.
2. **Shape the look** on the right: recolor the artwork, add a solid or gradient background, choose a shape, and adjust corner radius, padding and shadow.
3. **Check it in place** in the middle. Choose the scenes you care about, set the app name shown under the icon, and pick the display scaling to mimic (100%, 150% or 200%).
4. **Explore**: “Show 6 ideas” renders six color and shape variations of the same artwork. Click one to use it. “Keep this version” saves the current design to compare later.
5. **Download** a Windows `.ico`, a PNG, a macOS `.icns`, a website icon set, or PNGs at every size.

## The style line

The bar at the top always shows the current look as a [style string](design.md#styles), such as `color=white bg=#2d5ba6 shape=squircle`. You can type in it too: press Enter and the controls follow.

## Working with your agent

The studio and your agent speak the same language:

- **From the agent to you.** Ask your agent to open the studio. It opens with the agent's current design loaded (`open_studio`).
- **From you to the agent.** “Copy for your agent” copies a line like this, ready to paste into the chat:

  ```text
  Use iconwright with source "ph:rocket-launch-fill" and style "color=white bg=#2d5ba6 shape=squircle".
  ```

- **Share a design.** The address bar holds the design, so you can bookmark it or send the link.

## Privacy and safety

- The online studio sends your choices to iconwright's server to render them, and searches go to Iconify. Nothing is stored.
- The local studio only listens on `127.0.0.1` and needs a secret token that's part of the link iconwright prints, so other websites can't use it. It stops when you close the command (or, when an agent opened it, when the agent session ends).
- Applying icons to apps from the local studio is the same operation as the `app_apply_icon` tool, with the same [undo](safety.md#how-to-undo-everything).
