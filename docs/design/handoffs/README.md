# Design handoffs: ChatGPT (design) ↔ Claude (code)

Parenthesis has two AI teammates in separate lanes, with the owner as project manager:
- **ChatGPT: design.** Mockups, visual assets, design notes.
- **Claude: code.** It builds from approved designs and reports what it needs next.

The two can't message each other directly, so **this folder is the shared desk**. Every handoff is a file here, and
the owner carries work between the two tools.

## Design → code (ChatGPT to Claude)
1. The owner gives ChatGPT a design request: usually a GitHub issue labelled `design`, or text from Claude.
2. ChatGPT produces the mockups or assets and a short handoff note, using the template below.
3. The owner uploads them on a `docs/design-<topic>` branch:
   - the note to `docs/design/handoffs/<YYYY-MM-DD>-<topic>.md`
   - images to `docs/design/assets/<topic>/`
4. The owner opens a PR into `develop` and marks the design **approved** in the note.
5. Claude builds from approved handoffs only. Anything unclear goes back as a question, never a guess.

## Code → design (Claude to ChatGPT)
Claude writes ready-to-paste **design requests**. Each has the screens, the states (empty, loading, error,
pending/proposed), mobile and desktop sizes, and the constraints from `BRANDING.md` and `design-system.md`. They go
into a GitHub issue labelled `design` and also into chat. If ChatGPT is connected to GitHub, it can read this folder
and those issues directly.

## Rules for every design
- **Mobile first:** the phone layout is designed before desktop.
- **The locked brand:** `docs/design/BRANDING.md`. Never redraw the logo.
- **Synthetic people and photos only.** No real children's photos, names or artwork: the repository is public.
- **Both light and dark mode,** with accessible contrast. Never rely on colour alone.
- **Honest states:** pending and proposed things must never look confirmed.

## Handoff note template
```markdown
# <Topic> — design handoff (<YYYY-MM-DD>)
- **Status:** Draft | Approved by owner (<date>)
- **Made with:** ChatGPT (<model>)
- **Screens:** <list>. Mobile and desktop for each.
- **Assets:** docs/design/assets/<topic>/<files>
- **States shown:** default / empty / loading / error / pending / proposed
- **Notes for Claude:** interactions, copy, anything not obvious from the images
- **Open questions:** <for the owner or for Claude>
```
