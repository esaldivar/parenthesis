#!/usr/bin/env python3
"""Verifies the owner's approval for running Claude Code on one issue (issue #94). Read-only.

Ready For Development and the queue labels only nominate an issue. Approval is the "owner-approved-claude" label,
and it counts only when the issue history shows that:
  - the most recent time the label was added, the repository owner added it (matched by numeric user ID, because
    logins can change);
  - the label is still there and wasn't removed afterwards;
  - nobody edited the issue's title or text after the approval (the text is what Claude is asked to do);
  - the issue is open and still has the "claude-implementation" label.
Anything missing or unclear fails closed.
"""
import json
import urllib.request

APPROVAL_LABEL = "owner-approved-claude"
CODING_LABEL = "claude-implementation"

QUERY = """query($owner:String!, $repo:String!, $number:Int!) {
  repository(owner:$owner, name:$repo) {
    owner { login ... on User { databaseId } }
    issue(number:$number) {
      number title body url state lastEditedAt
      milestone { title }
      labels(first:50) { nodes { name } }
      timelineItems(last:100, itemTypes:[LABELED_EVENT, UNLABELED_EVENT, RENAMED_TITLE_EVENT]) {
        nodes {
          __typename
          ... on LabeledEvent { createdAt label { name } actor { login ... on User { databaseId } } }
          ... on UnlabeledEvent { createdAt label { name } actor { login ... on User { databaseId } } }
          ... on RenamedTitleEvent { createdAt }
        }
      }
    }
  }
}"""


class ApprovalError(Exception):
    """The issue is not approved for a Claude run. The message says why, without issue text."""


def fetch_issue(token, owner, repo, number):
    """The repository owner and the issue with its label and title history, from the GitHub GraphQL API."""
    payload = json.dumps({"query": QUERY, "variables": {"owner": owner, "repo": repo, "number": number}}).encode()
    request = urllib.request.Request("https://api.github.com/graphql", data=payload,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json",
                 "User-Agent": "parenthesis-claude-queue-approval"})
    with urllib.request.urlopen(request, timeout=20) as response:
        result = json.load(response)
    repository = (result.get("data") or {}).get("repository")
    if result.get("errors") or not repository or not repository.get("issue"):
        raise ApprovalError("GitHub returned errors, or the issue or repository isn't accessible")
    return repository


def verify(repository):
    """Returns {"number", "title", "body", "url", "approved_at"} for an approved issue, else raises ApprovalError.

    `repository` is the GraphQL result above: {"owner": {...}, "issue": {...}}. ISO 8601 UTC timestamps from GitHub
    compare correctly as strings.
    """
    owner_id = ((repository or {}).get("owner") or {}).get("databaseId")
    if not isinstance(owner_id, int):
        raise ApprovalError("the repository owner's user ID is missing (approval must come from a user account)")
    issue = (repository or {}).get("issue") or {}
    number = issue.get("number")
    if issue.get("state") != "OPEN":
        raise ApprovalError(f"#{number} isn't open")
    labels = {(x or {}).get("name") for x in (issue.get("labels") or {}).get("nodes", [])}
    if CODING_LABEL not in labels:
        raise ApprovalError(f"#{number} doesn't have the {CODING_LABEL} label")
    if APPROVAL_LABEL not in labels:
        raise ApprovalError(f"#{number} doesn't have the {APPROVAL_LABEL} label")

    events = [e for e in (issue.get("timelineItems") or {}).get("nodes", []) if e]
    if any(not e.get("createdAt") for e in events):
        raise ApprovalError(f"#{number} has history entries without a time")
    events.sort(key=lambda e: e["createdAt"])
    approval_events = [e for e in events if (e.get("label") or {}).get("name") == APPROVAL_LABEL
                       and e.get("__typename") in ("LabeledEvent", "UnlabeledEvent")]
    if not approval_events or approval_events[-1]["__typename"] != "LabeledEvent":
        raise ApprovalError(f"#{number}: no current {APPROVAL_LABEL} event in the issue history")
    approval = approval_events[-1]
    if (approval.get("actor") or {}).get("databaseId") != owner_id:
        raise ApprovalError(f"#{number}: {APPROVAL_LABEL} was last added by someone other than the owner")
    approved_at = approval["createdAt"]
    if any(e.get("__typename") == "RenamedTitleEvent" and e["createdAt"] > approved_at for e in events):
        raise ApprovalError(f"#{number}: the title changed after the owner's approval; approve it again")
    if issue.get("lastEditedAt") and issue["lastEditedAt"] > approved_at:
        raise ApprovalError(f"#{number}: the issue text changed after the owner's approval; approve it again")
    return {"number": number, "title": issue.get("title") or "", "body": issue.get("body") or "",
            "url": issue.get("url") or "", "milestone": (issue.get("milestone") or {}).get("title"),
            "approved_at": approved_at}
