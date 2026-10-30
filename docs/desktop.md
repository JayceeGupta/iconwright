# Desktop

iconwright can change desktop icons, line them up, resize them, and save and restore their layout. Everything on this page applies immediately, without restarting Explorer.

## Change a desktop icon

> Give my "Projects" folder a blue folder icon.

Works for shortcuts (`.lnk`), web links (`.url`), folders, and the system icons: This PC, Recycle Bin, your user folder, Network and Control Panel (`desktop_apply_icon`).

To restyle an item's own icon instead of replacing it, give `source: "item"`, for example with style `cutout color=white` for a bare white glyph. iconwright starts from the icon the item had before iconwright first changed it, so restyling twice never stacks. `desktop:<item>` works as a source in the design tools too.

Plain files, like a `.txt` or `.pdf`, can't have their own icon: Windows picks those by file type. Make a shortcut to the file and change the shortcut's icon instead.

## Arrange icons

> Save my desktop layout, then line up the icons by type from the top right.

- **Save first.** A saved layout (`desktop_layout`, action `save`) lets you put every icon back exactly where it was.
- **Arrange** sorts by name or type, fills columns or rows, and starts from any corner (`desktop_arrange`). You can name icons to put first.
- **Several monitors:** arranging works on one monitor at a time and leaves icons on the others where they are. Monitor 0 is the primary display.
- **Move one icon** to an exact spot with its coordinates (`desktop_move`). Positions snap to the desktop grid.

## Settings

> Make desktop icons small and hide the Recycle Bin.

| Setting | Options |
| --- | --- |
| Icon size | small (32 px), medium (48), large (96), xl (128), huge (256), or any size from 16 to 256 |
| Auto arrange | on or off |
| Align to grid | on or off |
| Show desktop icons | on or off (hides all of them, like right-click → View → Show desktop icons) |
| System icons | show or hide This PC, Recycle Bin, your user folder, Network, Control Panel |

(`desktop_settings`; several at once in one request.)

## See the result

> Show me the desktop.

iconwright takes a picture of the desktop icons, even if windows cover them (`capture`).

## Undo

| What | How |
| --- | --- |
| Positions, size, auto-arrange | Load the layout you saved: “restore my desktop layout” |
| A changed icon | “put the original icon back on Projects” (`restore_icons`) |
| Hidden system icons | Ask to show them again |
