# Parenthesis M4 · Child Essentials design handoff

Design decisions from November 6, 2026. Related issues include [Child Essentials #126](https://github.com/esaldivar/parenthesis/issues/126), [Medication #127](https://github.com/esaldivar/parenthesis/issues/127), and [System notices #128](https://github.com/esaldivar/parenthesis/issues/128). The in-page update flow below supersedes the Child Essentials Chat notice design discussed in #128. The dark mobile and light desktop mockups were approved on November 6, 2026.

## Layout and visual style

Give parents an easy way to switch children and locate each child's section on mobile and desktop. Use the desktop sidebar's soft, hand-drawn leaf artwork as the reference for small corner illustrations. Match the tint of each section to its update banners. Use deeper versions of those tints in dark mode. Keep labels and indicators readable with or without color, and respect reduced-motion preferences for glowing dots.

| Section | Tint and illustration | Contents |
| --- | --- | --- |
| School | Powder blue · schoolhouse | Grade, optional homeroom teacher for pre-K through fifth grade, and optional **Parent concerns** shared with the co-parent. |
| Allergies & Food | Butter yellow · plate and leaf | Allergies, dietary restrictions, and food preferences. Allergies appear first, with optional notes. Show **No allergies listed** until a parent records an allergy or explicitly selects **No known allergies**. Show who recorded that status and when. Adding an allergy replaces it. |
| Routines | Sage green · crescent moon | Shared and household-specific routines. See the flow below. |
| Clothing & Shoes | Soft lavender · folded shirt and sneaker | Shared top, bottom, and shoe sizes per child, with optional fit notes. |
| What Helps | Warm peach · stuffed animal | Shared tips about what helps the child feel settled, including comfort items and calming strategies. |
| Medication | Dusty coral · prescription bottle | Shared parent-entered reference with name, prescribed dose, schedule, instructions, and who updated it and when. Discontinued entries move to history. |
| Shared Caregivers | Muted teal · helping hands | Shared list with name, tap-to-call number, average rating, and **School pickup** when applicable. |
| Emergency Contacts | Muted rose · telephone | One shared **Call first** contact per child when set, pinned above any additional contacts. Show name, relationship to the child, and tap-to-call phone number. Relationship is chosen from Grandparent, Aunt, Uncle, Sibling, Other relative, Family friend, Neighbor or Other (described in the parent's own words) (owner, November 7, 2026). |

Either authorized parent can edit shared reference details directly. Section history shows who updated what and when, with previous and current values. If both parents edit the same section at once, preserve the second parent's draft and show the latest saved values for review before they save again.

## Routines

Open **Shared** by default, followed by **My routines** and **[Co-parent’s name]’s routines**. Both parents can see all three. Each parent can save their own routines immediately. The co-parent can choose **Use in both homes** to put that version in Shared as one entry. If the creator edits it later, their own version updates immediately and the last agreed version stays in Shared until the co-parent accepts the revision. Either parent can choose **Stop sharing**. The routine leaves Shared and remains visible in its creator's tab.

Show a dot by the co-parent's tab for new or revised routines. Opening the tab clears the dot. An updated row stays highlighted until it comes into view. Seeing the row leaves the agreement action available.

## Shared Caregivers

Each parent can give a caregiver one to three stars and edit their own rating through **Rate caregiver**. Show the average as three star icons using full, half, and outlined states. Use an accessible numeric label and show unrated caregivers as outlined stars with an Unrated label. Sort highest to lowest, use the one available rating until both parents rate, and put unrated contacts last. Keep **School pickup** visible when applicable. Emergency contacts have their own section and ordering.

### Call action

Show the phone number and a separate **Call** button on each Emergency Contacts row, including **Call first**. Tapping **Call** opens the device’s calling interface with that contact’s number selected. The parent confirms the call on their device.

## Updates in Child Essentials

When one parent updates a shared detail, the other parent gets a dot by **Child Essentials**. Opening the page clears that dot and displays color-matched banners on the first visit for those updates. Each banner identifies the child and updated section or field, such as “Kai’s shoe size updated,” and clears after about ten seconds or on dismissal with the X. Keep medication details in the protected child record.

The affected child’s section keeps its own dot until the parent opens it. Inside, the changed row stays highlighted until it comes into view. Each indicator clears independently. For example, dismissing Kai's shoe-size banner still leaves his Clothing section dot and the Shoes row highlight. The change remains in history, and the parent can view it without confirming it.

## PDF downloads

Place **Download medication PDF** and **Download allergy PDF** beside the respective section headings. Use the same picker for one child or all children. Each download is a printable PDF dated when generated, with a separate section for each selected child.

- **Medication** puts current entries first and discontinued entries below under a distinct heading. Include the recorded dose, schedule, and instructions. Offer **Current medications only**.
- **Allergies** lists recorded allergies and notes, or the applicable **No known allergies** or **No allergies listed** state. Keep the export focused on allergy information.

Restrict viewing, editing, history, and export generation to authorized parents in the family.

## First mobile mockup

Show the update banner, then the affected child's section and exact highlighted row. Show both PDF controls and the shared child picker, including the medication-only option. Include the three Routines tabs and the separate Caregivers and Emergency Contacts cards in the design review.

## Mockups

- [Light mobile overview, update and medication export](child-essentials/mobile-light.webp)
- [Light mobile caregiver ratings, emergency contacts, routines and allergy export](child-essentials/mobile-light-caregivers-and-routines.webp)
- [Dark mobile overview, update and medication export](child-essentials/mobile-dark.webp)
- [Light desktop overview](child-essentials/desktop-light.webp)
