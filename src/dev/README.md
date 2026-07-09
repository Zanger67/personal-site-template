# `src/dev/` — scratch, archive & proofing area

Git-ignored working area. **Nothing here is imported by the build or committed** —
only this README and the `.gitkeep` markers are tracked. Use it **only when
explicitly instructed.**

## What it's for

- **Archive** — items removed from the live site that are kept for possible later
  reinstatement (replaces the old `*.archive.json` convention).
- **Proofing** — drafting and testing new items *before* promoting them into the
  live `src/data/` or `src/content/`, so nothing half-finished ends up on the site.

## Layout — mirror the real tree

Files here mirror the **schema, filename, and folder structure** of their live
counterparts, one level down:

| live | dev mirror |
| --- | --- |
| `src/data/<name>.json` | `src/dev/data/<name>.json` |
| `src/content/projects/<slug>.md` | `src/dev/content/projects/<slug>.md` |
| `src/content/blog/<slug>.md` | `src/dev/content/blog/<slug>.md` |

An item archived out of `src/data/affiliations.json` lives at
`src/dev/data/affiliations.json` with the identical schema, so it can be moved
back verbatim.

## Rules

- **Only files with real content** — do not scaffold empty mirror files or folders
  you aren't using.
- Promote an item by moving it into the matching live path (and back here to retire
  it).
- The same fully-explicit authoring convention as the live data applies to anything
  you intend to promote.
