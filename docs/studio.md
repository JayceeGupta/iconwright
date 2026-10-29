# The studio

iconwright studio is a visual editor for icons in your browser. Pick artwork, change its colors and shape, and see it on a Windows taskbar, Start menu, desktop, File Explorer, a browser, the macOS Dock, an iPhone and Android as you edit. Then download it, or put it on your apps.

Everything you see is drawn in your browser with the same recipe the agent tools use, so changes show instantly and the files you download match the preview.

There are two ways to use it:

| | Online studio | Local studio |
| --- | --- | --- |
| Open it | [iconwright studio](/studio/) | `npx iconwright studio`, or ask your agent to “open the studio” |
| Artwork | Iconify icons and pasted SVG | Also your own files and, on Windows, your installed apps' icons |
| Get the result | Downloads | Downloads, saving to a folder, and applying to apps on Windows |
| Install needed | No | Yes |

## Working in the studio

On a computer the studio has three columns: artwork on the left, the icon and where it lives in the middle, and its style on the right. On a phone the icon stays pinned at the top and Artwork, Style and Scenes are tabs at the bottom.

1. **Pick artwork.** Search more than 200,000 icons (filter to one-color or multicolor sets), paste SVG code, or drop an `.svg` file anywhere on the page. In the local studio on Windows, **My apps** lists your pinned apps so you can restyle an app's own icon.
2. **Style it.** Artwork color is **Original** until you choose **Custom**. Add a solid or gradient background, pick a shape, and set the artwork size (or leave it on **Auto**) and a soft shadow. Swatches cover the common choices; the color pickers do the rest. **Reset** goes back to the plain artwork.
3. **Try ideas.** **Ideas** shows eight looks for the current artwork; click one to use it, or **Shuffle** for more. **Keep this version** saves a design so you can compare and go back.
4. **Check where it lives.** Turn scenes on and off, switch light and dark where Windows has both, and set the app name shown under the icon. Click a scene to enlarge it. Notes appear where a platform treats your icon differently, for example iOS filling see-through corners with black.
5. **Download** from the button at the top right: Windows `.ico`, macOS `.icns`, a website icon kit, a PNG, or PNGs at every size. In the local studio on Windows, **Apply to apps** puts it on the Start menu and taskbar shortcuts of the apps you tick.

**Undo and redo** with the arrows at the top (Ctrl+Z, Ctrl+Shift+Z). Press **/** to jump to search. The address bar always holds the current design, so you can bookmark or share it.

## The style code

The **Style code** field at the bottom of the Style panel shows the current look as a [style string](design.md#styles), such as `color=white bg=#2d5ba6 shape=squircle`. It's what agents and the command line use. Type in it and the preview follows; a mistake is explained under the field.

## Working with your agent

The studio and your agent speak the same language:

- **From the agent to you.** Ask your agent to open the studio. It opens with the agent's current design loaded (`open_studio`).
- **From you to the agent.** **Copy for agent** (top right) copies a line like this, ready to paste into the chat:

  ```text
  Use iconwright with source "ph:rocket-launch-fill" and style "color=white bg=#2d5ba6 shape=squircle".
  ```

- **Share a design.** The address bar holds the design, so you can bookmark it or send the link.

## Privacy and safety

- The online studio sends your choices to iconwright's server to render them, and searches go to Iconify. Nothing is stored.
- The local studio only listens on `127.0.0.1` and needs a secret token that's part of the link iconwright prints, so other websites can't use it. It stops when you close the command (or, when an agent opened it, when the agent session ends).
- Applying icons to apps from the local studio is the same operation as the `app_apply_icon` tool, with the same [undo](safety.md#how-to-undo-everything).
