#!/usr/bin/env python3
"""Keeps the Status of issues on Project #2 in step with their pull requests (owner decision, October 19, 2026; #94).

Run by the local Claude queue: every scheduled run syncs the board, and a queue run moves its own issue as it goes.
Any open issue on the project that a PR links with a closing keyword ("Closes #98") moves like this:

  a PR is open as a draft            -> Awaiting PR Approval
  a PR is open and ready for review  -> Code Review
  merged, not yet on main            -> Awaiting Deployment (release/x.y.z, then develop, then main)
  merged and on main                 -> Done, and the issue is closed
  every PR closed without merging    -> Backlog

The queue itself sets In Development when a run starts. A status is only changed when what the PRs say changes, so a
card the owner moves by hand stays where they put it until its PRs change again.
"""
import json
import re

PROJECT_NUMBER = 2
READY = "Ready For Development"
IN_DEVELOPMENT = "In Development"
AWAITING_APPROVAL = "Awaiting PR Approval"
CODE_REVIEW = "Code Review"
AWAITING_DEPLOYMENT = "Awaiting Deployment"
DONE = "Done"
BACKLOG = "Backlog"

# "Closes #98" counts only where it starts a line, a bullet or a sentence, so "...and close #65 later" (a to-do in
# a PR description) doesn't link the issue.
_CLOSING = re.compile(r"(?:^[ \t]*(?:[-*][ \t]+)?|[.!?:][ \t]+)(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)[ \t]*:?[ \t]+#(\d+)\b",
                      re.IGNORECASE | re.MULTILINE)


# ---------- Pure rules (unit tested) ----------

def linked_issues(body):
    """Issue numbers a PR body links with "Closes/Fixes/Resolves #n" at the start of a line, bullet or sentence."""
    return {int(n) for n in _CLOSING.findall(body or "")}


def derive_status(prs):
    """The Status an issue's PRs call for, or None when it has no linked PRs.

    `prs`: dicts with state (OPEN, CLOSED or MERGED), is_draft and on_main (merged work reachable from main).
    Open work comes first: a follow-up PR puts an issue back in review even after an earlier PR merged.
    """
    if not prs:
        return None
    open_prs = [p for p in prs if p["state"] == "OPEN"]
    if open_prs:
        return CODE_REVIEW if any(not p["is_draft"] for p in open_prs) else AWAITING_APPROVAL
    merged = [p for p in prs if p["state"] == "MERGED"]
    if merged:
        return DONE if all(p["on_main"] for p in merged) else AWAITING_DEPLOYMENT
    return BACKLOG


def plan_changes(issues, prs_by_issue, last_seen):
    """What to change now, and the new memory of what the PRs called for.

    `issues`: {number: {"status": current Status, ...}} for open issues on the project.
    `last_seen`: {str(number): status the PRs called for at the last sync}.
    Returns (changes, seen) where changes are dicts with number, current, target and close.
    """
    changes, seen = [], {}
    for number, issue in sorted(issues.items()):
        target = derive_status(prs_by_issue.get(number, []))
        if target is None:
            continue
        seen[str(number)] = target
        if last_seen.get(str(number)) == target:
            continue  # nothing new from the PRs: leave the card where it is (including manual moves)
        if issue["status"] != target or target == DONE:
            changes.append({"number": number, "current": issue["status"], "target": target, "close": target == DONE})
    return changes, seen


def announcement(moves, limit=20):
    """One Discord message for every card a run moved: issue, title, old -> new status, and closed at Done."""
    if not moves:
        return ""
    lines = ["Parenthesis board update"]
    for move in moves[:limit]:
        title = move["title"] if len(move["title"]) <= 60 else move["title"][:59].rstrip() + "…"
        lines.append(f"#{move['number']} {title}: {move['from'] or '(no status)'} → {move['to']}"
                     + (" (issue closed)" if move.get("closed") else ""))
    if len(moves) > limit:
        lines.append(f"…and {len(moves) - limit} more (see the run log)")
    return "\n".join(lines)


def describe(changes):
    if not changes:
        return "Board: no status changes."
    lines = [f"  #{c['number']}: {c['current'] or '(no status)'} -> {c['target']}" + (" (and close the issue)" if c["close"] else "")
             for c in changes]
    return "Board changes:\n" + "\n".join(lines)


# ---------- GitHub (through the runner's `gh`) ----------

_PROJECT_QUERY = """query($owner:String!, $number:Int!) {
  repositoryOwner(login:$owner) { ... on ProjectV2Owner { projectV2(number:$number) {
    id field(name:"Status") { ... on ProjectV2SingleSelectField { id options { id name } } }
  } } }
}"""

_ISSUES_QUERY = """query($owner:String!, $repo:String!, $cursor:String) {
  repository(owner:$owner, name:$repo) { issues(first:100, after:$cursor, states:OPEN) {
    pageInfo { hasNextPage endCursor }
    nodes { number title projectItems(first:20) { nodes {
      id project { number }
      fieldValueByName(name:"Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
    } } }
  } }
}"""

_SET_STATUS = """mutation($project:ID!, $item:ID!, $field:ID!, $option:String!) {
  updateProjectV2ItemFieldValue(input:{projectId:$project, itemId:$item, fieldId:$field,
    value:{singleSelectOptionId:$option}}) { projectV2Item { id } }
}"""


class Board:
    """Reads and writes Project #2 through `run(cmd) -> CompletedProcess` (the runner's logged, redacted runner)."""

    def __init__(self, run, owner, repo):
        self.run, self.owner, self.repo = run, owner, repo
        self._project = None

    def graphql(self, query, **variables):
        cmd = ["gh", "api", "graphql", "-f", f"query={query}"]
        for key, value in variables.items():
            if value is None:
                continue
            cmd += ["-F" if isinstance(value, int) else "-f", f"{key}={value}"]
        data = json.loads(self.run(cmd).stdout)
        if data.get("errors"):
            raise RuntimeError(f"GitHub GraphQL error: {data['errors'][0].get('message')}")
        return data["data"]

    def project(self):
        if self._project is None:
            node = self.graphql(_PROJECT_QUERY, owner=self.owner, number=PROJECT_NUMBER)["repositoryOwner"]["projectV2"]
            if not node or not (node.get("field") or {}).get("id"):
                raise RuntimeError(f"Couldn't read Project #{PROJECT_NUMBER} or its Status field")
            options = {o["name"]: o["id"] for o in node["field"]["options"]}
            missing = {READY, IN_DEVELOPMENT, AWAITING_APPROVAL, CODE_REVIEW, AWAITING_DEPLOYMENT, DONE, BACKLOG} - set(options)
            if missing:
                raise RuntimeError(f"Project #{PROJECT_NUMBER} has no Status option(s): {', '.join(sorted(missing))}")
            self._project = {"id": node["id"], "field": node["field"]["id"], "options": options}
        return self._project

    def open_issues(self):
        """{number: {"title", "item", "status"}} for open issues on the project."""
        issues, cursor = {}, None
        while True:
            page = self.graphql(_ISSUES_QUERY, owner=self.owner, repo=self.repo, cursor=cursor)["repository"]["issues"]
            for node in page["nodes"]:
                items = [i for i in node["projectItems"]["nodes"] if (i.get("project") or {}).get("number") == PROJECT_NUMBER]
                if len(items) == 1:
                    issues[node["number"]] = {"title": node["title"], "item": items[0]["id"],
                                              "status": (items[0].get("fieldValueByName") or {}).get("name")}
            if not page["pageInfo"]["hasNextPage"]:
                return issues
            cursor = page["pageInfo"]["endCursor"]

    def linked_prs(self, on_main):
        """{issue number: [pr, ...]} from every PR's closing keywords. `on_main(oid)` says whether a commit is on main."""
        out = self.run(["gh", "pr", "list", "--state", "all", "--limit", "1000",
                        "--json", "number,state,isDraft,body,mergeCommit"]).stdout
        prs_by_issue = {}
        for pr in json.loads(out):
            oid = (pr.get("mergeCommit") or {}).get("oid")
            entry = {"number": pr["number"], "state": pr["state"], "is_draft": pr["isDraft"],
                     "on_main": bool(pr["state"] == "MERGED" and oid and on_main(oid))}
            for number in linked_issues(pr.get("body")):
                prs_by_issue.setdefault(number, []).append(entry)
        return prs_by_issue

    def set_status(self, item, status):
        project = self.project()
        self.graphql(_SET_STATUS, project=project["id"], item=item, field=project["field"],
                     option=project["options"][status])

    def close_issue(self, number):
        self.run(["gh", "issue", "close", str(number), "--reason", "completed", "--comment",
                  "Done: the work is on `main` (production). Closed by the local Claude queue's board sync (#94)."])
