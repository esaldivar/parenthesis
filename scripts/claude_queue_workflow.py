"""Owner testing/rework protocol (#152). Disabled until a local, reviewed rollout.

GitHub comments are task data, except exact owner-authored /queue-control JSON
records bound to the current issue and implementation fingerprints. No comment
can grant Claude execution permission or relax the runner's protected paths.
"""
import hashlib
import json
import re

READY = "Ready For Development"
DESIGN = "In Design"
WAITING = "Ready to Test"
TEST = "Test"
REVIEW = "Code Review"
DEPLOY = "Awaiting Deployment"
DONE = "Done"
NEGATIVE = "acceptance changes requested"
POSITIVE = "meets all acceptance criteria"
DESIGN_APPROVED = "design-approved"


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def scope(issue):
    return fingerprint([issue["title"], issue["body"]])


def revision(prs):
    return fingerprint(sorted((p["number"], p["sha"], p["state"]) for p in prs))


def controls(issue, comments, owner_id):
    """Latest valid owner control; edits after issue edits must be reaffirmed.

    Exact one-line JSON only. Updated comments, malformed records, partial
    records, and controls for old issue text cannot authorize a transition.
    """
    found = {}
    for comment in sorted(comments, key=lambda c: c["id"]):
        if (comment.get("user") or {}).get("id") != owner_id:
            continue
        if comment.get("updated_at") != comment.get("created_at"):
            continue
        body = comment.get("body", "")
        if not body.startswith("/queue-control ") or "\n" in body.strip():
            continue
        try:
            record = json.loads(body[len("/queue-control "):])
        except (ValueError, TypeError):
            continue
        if isinstance(record, dict) and record.get("scope") == scope(issue):
            record["_created_at"] = comment["created_at"]
            found = record
    return found


def owner_label(issue, events, label, owner_id, after=""):
    if label not in issue.get("labels", []):
        return False
    matches = [e for e in events if (e.get("label") or {}).get("name") == label
               and e.get("event") in ("labeled", "unlabeled")]
    if not matches:
        return False
    event = max(matches, key=lambda e: e["id"])
    return (event["event"] == "labeled" and (event.get("actor") or {}).get("id") == owner_id
            and event.get("created_at", "") >= after)


def tracking_links(body):
    """Plain tracking lines only; ignore fenced examples and incidental mentions."""
    result, fence = set(), False
    for line in (body or "").splitlines():
        if line.lstrip().startswith(("```", "~~~")):
            fence = not fence
        if fence:
            continue
        match = re.fullmatch(r"\s*(?:[-*]\s+)?(?:Refs|Closes|Fixes|Resolves)\s+#(\d+)\s*\.?\s*", line, re.I)
        if match:
            result.add(int(match[1]))
    return result


def signal(issue, prs):
    return fingerprint([scope(issue), revision(prs), issue.get("control"), issue.get("labels"),
                        issue.get("positive"), issue.get("negative"), issue.get("design_approved")])


def plan(issues, prs_by_issue, last):
    """Deterministic global one-waiting-slot plan. Never changes GitHub itself.

    Enriched issues contain trusted booleans (computed by Snapshot), controls,
    full comments, PR evidence and deployment evidence, never model inference.
    Remember fingerprints, not just derived status: follow-up work invalidates
    acceptance even when its PR occupies the same review status.
    """
    moves, seen, reasons = [], {}, []
    occupied = sum(i["status"] == WAITING for i in issues.values())
    for number, issue in sorted(issues.items()):
        prs = prs_by_issue.get(number, [])
        rev = revision(prs)
        current_signal = signal(issue, prs)
        prior = last.get(str(number), {})
        prior = prior if isinstance(prior, dict) else {}
        seen[str(number)] = {"signal": current_signal, "revision": rev}
        status, target, remove = issue["status"], None, []
        labels = issue.get("labels", [])
        control = issue.get("control", {})
        open_prs = [p for p in prs if p["state"] == "OPEN"]
        merged = [p for p in prs if p["state"] == "MERGED"]
        fresh_revision = bool(prior and prior.get("revision") != rev)
        if "design" in labels or control.get("work_type") == "design":
            if (status == DESIGN and not open_prs and not issue.get("blocked")
                    and issue.get("dependencies_ready") and issue.get("design_approved")
                    and control.get("work_type") == "design" and control.get("deliverables_accepted") is True
                    and control.get("deployment") == "none" and prior.get("signal") != current_signal):
                moves.append({"number": number, "current": status, "target": DONE, "close": True,
                              "remove": [], "revision": rev})
            elif status != DONE:
                reasons.append(f"#{number}: design-only work awaits explicit owner deliverable acceptance")
            continue
        if issue.get("negative") and status == TEST:
            target = READY
            if POSITIVE in labels:
                remove.append(POSITIVE)
        elif fresh_revision and POSITIVE in labels:
            remove.append(POSITIVE)
            if status in (TEST, DEPLOY, WAITING):
                target = REVIEW
        if target is None and open_prs and (prior.get("signal") != current_signal):
            target = REVIEW if any(not p["draft"] for p in open_prs) else "Awaiting PR Approval"
        elif target is None and status == TEST and issue.get("positive") and NEGATIVE not in labels:
            if control.get("accepted_revision") != rev or not merged or open_prs:
                reasons.append(f"#{number}: acceptance must identify the current merged revision")
            elif control.get("deployment") == "none":
                target = DONE
            elif control.get("deployment") == "required":
                target = DEPLOY
            else:
                reasons.append(f"#{number}: deployment classification is missing")
        elif target is None and status == DEPLOY and issue.get("positive") and NEGATIVE not in labels:
            if (control.get("accepted_revision") == rev and issue.get("deployment_verified") and not open_prs):
                target = DONE
        elif (target is None and merged and not open_prs and NEGATIVE not in labels
              and status not in (TEST, DEPLOY, DONE)):
            if prior.get("signal") != current_signal or status == REVIEW:
                if occupied == 0:
                    target = WAITING
                    occupied += 1
                elif status != WAITING:
                    target = REVIEW
                    reasons.append(f"#{number}: Ready to Test is occupied; retry after the slot frees")
        elif target is None and status == DESIGN and prior.get("signal") != current_signal:
            if issue.get("blocked") or not issue.get("dependencies_ready"):
                reasons.append(f"#{number}: design dependencies or blockers are not cleared")
            elif control.get("work_type") == "implementation" and control.get("requirements_ready") is True:
                if control.get("design_required") is False and control.get("ready") is True:
                    target = READY
                elif issue.get("design_approved") and control.get("handoff"):
                    target = READY
                else:
                    reasons.append(f"#{number}: owner design approval or handoff is missing")
            elif (control.get("work_type") == "design" and issue.get("design_approved")
                  and control.get("deliverables_accepted") is True and control.get("deployment") == "none"):
                target = DONE
            else:
                reasons.append(f"#{number}: explicit owner readiness/work classification is missing")
        # Explicit no-design work may also be deliberately nominated from Backlog.
        elif target is None and status == "Backlog" and prior.get("signal") != current_signal:
            if (control.get("work_type") == "implementation" and control.get("design_required") is False
                    and control.get("ready") is True and control.get("requirements_ready") is True
                    and issue.get("dependencies_ready") and not issue.get("blocked")):
                target = READY
        if target == status:
            target = None
        if target or remove:
            moves.append({"number": number, "current": status, "target": target or status,
                          "close": target == DONE, "remove": remove, "revision": rev})
    return moves, seen, reasons


class Snapshot:
    """Read all paginated GitHub evidence via the runner's redacted gh adapter."""

    def __init__(self, board, owner_id):
        self.board, self.owner_id = board, owner_id

    def pages(self, endpoint):
        result = self.board.run(["gh", "api", "--paginate", "--slurp", endpoint]).stdout
        pages = json.loads(result)
        if not isinstance(pages, list) or any(not isinstance(p, list) for p in pages):
            raise RuntimeError("Unexpected paginated GitHub response")
        return [item for page in pages for item in page]

    def get(self, endpoint):
        return json.loads(self.board.run(["gh", "api", endpoint]).stdout)

    def read(self, issues):
        prefix = f"repos/{self.board.owner}/{self.board.repo}"
        owner_id = self.get(f"users/{self.board.owner}").get("id")
        if owner_id != self.owner_id:
            raise RuntimeError("Only the repository owner may reconcile the workflow")
        prs_by_issue = {}
        for pr in self.pages(f"{prefix}/pulls?state=all&per_page=100"):
            # Release promotion references are deployment tracking, not a new
            # implementation/rework cycle for each issue in the release rollup.
            if not (pr.get("base") or {}).get("ref", "").startswith("release/"):
                continue
            entry = {"number": pr["number"], "sha": pr["head"]["sha"], "draft": pr["draft"],
                     "state": "MERGED" if pr.get("merged_at") else pr["state"].upper(),
                     "changed_at": pr.get("merged_at") or pr["updated_at"],
                     "merge_sha": pr.get("merge_commit_sha")}
            for n in tracking_links(pr.get("body")):
                if n in issues:  # actual issues, never PR-only references
                    prs_by_issue.setdefault(n, []).append(entry)
        for n, issue in issues.items():
            raw = self.get(f"{prefix}/issues/{n}")
            issue.update(title=raw["title"], body=raw["body"] or "", url=raw["html_url"],
                         labels=[l["name"] for l in raw["labels"]])
            comments = self.pages(f"{prefix}/issues/{n}/comments?per_page=100")
            events = self.pages(f"{prefix}/issues/{n}/events?per_page=100")
            issue["comments"] = comments
            issue["control"] = controls(issue, comments, owner_id)
            prs = prs_by_issue.get(n, [])
            after = max([raw.get("created_at", "")] + [p["changed_at"] for p in prs])
            issue["positive"] = owner_label(issue, events, POSITIVE, owner_id, after)
            issue["negative"] = owner_label(issue, events, NEGATIVE, owner_id)
            issue["design_approved"] = owner_label(issue, events, DESIGN_APPROVED, owner_id)
            issue["blocked"] = bool(set(issue["labels"]) & {"blocked", "status:blocked"})
            # Explicit dependencies, read from owner control. Missing/invalid list fails closed.
            deps = issue["control"].get("dependencies")
            issue["dependencies_ready"] = isinstance(deps, list) and all(
                type(d) is int and d != n and (self.get(f"{prefix}/issues/{d}").get("state") == "closed")
                for d in deps)
            issue["deployment_verified"] = False
            evidence = issue["control"].get("verified_deployment")
            if type(evidence) is int and issue["control"].get("accepted_revision") == revision(prs):
                deployment = self.get(f"{prefix}/deployments/{evidence}")
                statuses = self.pages(f"{prefix}/deployments/{evidence}/statuses?per_page=100")
                issue["deployment_verified"] = bool(
                    statuses and statuses[0].get("state") == "success"
                    and issue["control"].get("_created_at", "") >= statuses[0].get("created_at", "~")
                    and deployment.get("environment") == issue["control"].get("environment")
                    and deployment.get("environment") in ("development", "production")
                    and any(p["state"] == "MERGED" for p in prs)
                    and all(p.get("merge_sha") and self.get(
                        f"{prefix}/compare/{p['merge_sha']}...{deployment['sha']}").get("status")
                        in ("ahead", "identical") for p in prs if p["state"] == "MERGED"))
        # Explicit linked-design approval can satisfy an implementation's design gate,
        # but never its own requirements/dependency/Claude approval gates.
        for issue in issues.values():
            linked = issue["control"].get("design_issue")
            if type(linked) is int:
                design = issues.get(linked)
                if design is None:
                    raw = self.get(f"{prefix}/issues/{linked}")
                    if raw.get("pull_request"):
                        continue
                    design = {"title": raw["title"], "body": raw["body"] or "",
                              "labels": [l["name"] for l in raw["labels"]]}
                    design["control"] = controls(design, self.pages(
                        f"{prefix}/issues/{linked}/comments?per_page=100"), owner_id)
                    design["design_approved"] = owner_label(design, self.pages(
                        f"{prefix}/issues/{linked}/events?per_page=100"), DESIGN_APPROVED, owner_id)
                issue["design_approved"] = bool(issue["design_approved"] or (
                    design["design_approved"] and design["control"].get("work_type") == "design"
                    and design["control"].get("deliverables_accepted") is True))
        return prs_by_issue
