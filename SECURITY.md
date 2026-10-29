# Security

iconwright changes things on your PC: Start menu and taskbar shortcuts, one registry value that lists pinned apps, and desktop icon positions. It runs with your normal user rights and never asks for administrator rights. [Safety and risks](https://iconwright.guptajayam.com/docs/safety) explains what it changes and how to undo it.

## Reporting a vulnerability

Please report security problems privately, not in a public issue: open [a private security advisory](https://github.com/JayceeGupta/iconwright/security/advisories/new) on GitHub. Include what you found, how to reproduce it, and what an attacker could do with it.

You'll get a reply within a week. Fixes go into the next release, and the advisory is published once a fix is out.

Examples of what counts:

- A source, file name, style string or tool argument that makes iconwright run commands, write files outside its own folders, or change shortcuts or registry values it shouldn't.
- Raw SVG that runs script in the studio page.
- The hosted studio at iconwright.guptajayam.com reading or writing anything it shouldn't.

## Supported versions

Only the latest release on npm gets security fixes.
