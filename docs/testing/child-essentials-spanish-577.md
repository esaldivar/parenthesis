# Child Essentials Spanish audit (#577)

The active release already translates most template labels. This change closes the remaining code-generated copy and options using the existing runtime locale and English/neutral Latin American Spanish catalogs.

| Screen or flow | Missing copy addressed | Automated evidence |
| --- | --- | --- |
| Landing and dedicated section heading | Section names, child heading, back link, changed field/section banners | Spanish tile inventory; live English switch without another child fetch |
| School | Unset fields, Pre-K and Kindergarten display labels | Spanish saved grade, stable option value, unchanged notes/draft during language switch |
| Allergies & Food | Empty allergy status, unset preferences, export language | Spanish empty status and selected-child PDF request |
| Clothing & Shoes | Unset sizes/fit notes; feedback | Spanish empty values and an existing error changing language |
| What Helps | Unset comfort items and strategies | Spanish empty values |
| Routines | Unset bedtime/naps; owner labels and household feedback | Spanish empty values; household changed-field banner |
| Emergency Contacts | Relationship choices and saved standard labels, partial save and validation feedback | Spanish relationship label with unchanged API value |
| Shared Caregivers | Partial save and validation feedback; localized numeric rating label | Spanish empty state; existing bulk-save regression suite |
| Medical | Provider type options and display/history tags; feedback | Spanish provider option and phone validation with stable type value |
| Allergy PDF | Title/metadata, generated date, page labels, empty allergy summaries | Frontend language request; added backend title/fallback and tenant/child selection tests |

All family-authored names, notes, specialties and addresses remain unchanged. Standard option values remain the existing API values. Unknown/custom option labels pass through verbatim. Feedback retains its translation key so changing locale does not clear a form. Insurance has no implemented section in this release and adds no UI in this fix.

## Validation recorded locally

- Frontend lint: passed.
- Child Essentials and locale unit tests: 45 passed across 11 files.
- The original 31 tests remain passing; 14 Spanish/export regression tests were added.
- Production build attempted: blocked by the locally unavailable `@microsoft/signalr` package. An offline dependency install failed with Windows EPERM; no dependency or lockfile changes are part of this PR.
- Backend build/format/tests and the added PDF integration theory require CI; they have not been run locally.
- Phone/desktop light/dark rendering, keyboard/screen-reader walkthroughs, exported PDF rendering and Development deep-link/reload verification remain unverified. Unit rendering is not visual or device acceptance.

## Remaining verification

- Run CI frontend build/full suite and backend build/format/full suite, including the PDF localization theory.
- Render every implemented section with Spanish on phone/desktop in both themes; inspect text expansion, focus and accessible names.
- In Development, confirm saved language on reload and section navigation, exercise history/conflict/save feedback, and inspect a Spanish allergy PDF containing synthetic names and unchanged parent-written allergy notes.
