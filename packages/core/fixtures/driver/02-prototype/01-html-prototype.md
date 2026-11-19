---
title: standalone html prototype
status: doing
updated: 2026-11-19T07:39:00Z
---

Single file, no build. Embeds a fake `~/.driver` as script tags and parses the frontmatter at load, so the prototype reads files the same way the real thing will.

- [x] first pass
- [x] headline number instead of the status strip
- [x] real project as the example (pdk-2-sentry)
- [ ] keymap sign-off

## verification

~~~sh
open prototype/driver.html
# → press ? for the keymap
~~~
