# ADR-0005: Protective "Restrict" path that bypasses mutual approval

- **Status:** Accepted (2026-10-16)
- **Date:** 2026-10-16

## Context
Mutual deletion approval protects shared memories from unilateral deletion. But one parent must not be able to block action on child-safety, privacy or legal problems by refusing to approve, for example over an inappropriate image or a child's personal details exposed in a photo.

## Decision
Separate **hiding** from **destroying**:
- **Restrict (immediate, unilateral).** Any parent, or the child who uploaded the item, can restrict a memory at once. A reason code is required. The content becomes invisible to children and leaves the gallery, but it is **kept**. The other parent is notified and the action is audited. Lifting a restriction needs a ChangeRequest.
- **Delete (mutual).** Permanent removal still needs both parents' approval, then the recovery period, then purge.
- **Legal / platform removal.** A platform admin follows a documented break-glass runbook (court order, legal request, abuse report). It needs a reason, it's audited, and it may purge immediately. Two-person admin approval comes post-MVP.
- **Mandatory removals** (e.g. CSAM reports) follow the legal process and are never gated by family approval.

## Consequences
- (+) No one can weaponize the approval workflow to block protection.
- (+) No one can weaponize restriction to destroy memories: it's reversible and visible to the other parent.
- (−) More states to model and test (`Active`, `Restricted`, `SoftDeleted`).
