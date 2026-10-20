#!/usr/bin/env python3
"""Read-only GitHub Project issue queue selector. Requires token with Projects read access.

An issue is selected only when it is open, in the exact milestone, in exactly one item of the project with Status
"Ready For Development", not blocked, has exactly one valid priority, and carries both queue labels:
"claude-implementation" (a coding issue) and "owner-approved-claude". The label only nominates the issue: the owner's
approval is verified separately against the issue history (scripts/claude_queue_approval.py) before anything runs.
"""
import json
import os
import sys
import urllib.request

QUERY = """query($owner:String!, $repo:String!, $cursor:String) {
  repository(owner:$owner,name:$repo) {
    issues(first:100,after:$cursor,states:OPEN) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url state milestone { title }
        labels(first:30) { nodes { name } }
        projectItems(first:50) {
          nodes { project { number title }
            fieldValues(first:30) { nodes {
              ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } }
            } }
          }
        }
      }
    }
  }
}"""

CODING_LABEL = "claude-implementation"
APPROVAL_LABEL = "owner-approved-claude"
REQUIRED_LABELS = (CODING_LABEL, APPROVAL_LABEL)


def eligible(issues, milestone, project_number, allowed_statuses=("Ready For Development",)):
    """Never infer status or priority from titles; missing metadata fails closed.

    `allowed_statuses`: only the local runner's re-check before pushing also accepts "In Development", the status
    the runner itself set when the run started.
    """
    if not milestone or project_number is None:
        raise ValueError("ACTIVE_MILESTONE and PROJECT_NUMBER are required")
    ranked = []
    status_diagnostics = []
    excluded = {"state": 0, "milestone": 0, "project": 0, "status": 0, "blocked": 0, "labels": 0, "priority": 0}
    for issue in issues:
        if issue.get("state") != "OPEN":
            excluded["state"] += 1
            continue
        if (issue.get("milestone") or {}).get("title") != milestone:
            excluded["milestone"] += 1
            continue
        items = [item for item in (issue.get("projectItems") or {}).get("nodes", [])
                 if (item.get("project") or {}).get("number") == project_number]
        if len(items) != 1:
            excluded["project"] += 1
            continue
        fields = (items[0].get("fieldValues") or {}).get("nodes", [])
        statuses = [v.get("name") for v in fields if (v.get("field") or {}).get("name") == "Status"]
        if len(statuses) != 1 or statuses[0] not in allowed_statuses:
            # Explain the exact metadata received without weakening the eligibility gate.
            status_diagnostics.append({"issue": issue["number"], "project": project_number,
                "status_values": statuses,
                "single_select_fields": [{"field": (v.get("field") or {}).get("name"),
                    "value": v.get("name")} for v in fields if v.get("name") is not None]})
            excluded["status"] += 1
            continue
        labels = {x["name"].lower() for x in (issue.get("labels") or {}).get("nodes", [])}
        if labels & {"blocked", "status:blocked"}:
            excluded["blocked"] += 1
            continue
        if not all(label in labels for label in REQUIRED_LABELS):
            # Non-coding issues never get "claude-implementation"; unapproved issues lack "owner-approved-claude".
            excluded["labels"] += 1
            continue
        project_priorities = [v.get("name") for v in fields if (v.get("field") or {}).get("name") == "Priority"]
        priority_map = {"P0 - Critical": 0, "P1 - High": 1, "P2 - Medium": 2, "P3 - Low": 3}
        if len(project_priorities) != 1 or project_priorities[0] not in priority_map:
            excluded["priority"] += 1
            continue
        ranked.append((priority_map[project_priorities[0]], issue["number"], issue))
    ranked.sort(key=lambda row: (row[0], row[1]))
    return ([{"number": issue["number"], "title": issue["title"], "url": issue["url"],
             "priority": "P" + str(priority)} for priority, _, issue in ranked], excluded, status_diagnostics)

def github_graphql(token, variables):
    payload = json.dumps({"query": QUERY, "variables": variables}).encode()
    request = urllib.request.Request("https://api.github.com/graphql", data=payload,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json",
                 "User-Agent": "parenthesis-readonly-queue"})
    with urllib.request.urlopen(request, timeout=20) as response:
        result = json.load(response)
    if result.get("errors") or not result.get("data", {}).get("repository"):
        raise RuntimeError("GitHub GraphQL returned errors or inaccessible repository")
    return result["data"]["repository"]["issues"]

def fetch_open_issues(token, owner, repo):
    """All open issues with their labels and project fields, following pagination."""
    issues, cursor = [], None
    while True:
        page = github_graphql(token, {"owner": owner, "repo": repo, "cursor": cursor})
        issues.extend(page["nodes"])
        if not page["pageInfo"]["hasNextPage"]:
            break
        next_cursor = page["pageInfo"]["endCursor"]
        if not next_cursor or next_cursor == cursor:
            raise RuntimeError("Invalid pagination cursor")
        cursor = next_cursor
    return issues


def main():
    owner, repo = os.environ.get("GITHUB_REPOSITORY", "").split("/", 1)
    token = os.environ["GH_TOKEN"]
    milestone = os.environ["ACTIVE_MILESTONE"]
    project_number = int(os.environ["PROJECT_NUMBER"])
    issues = fetch_open_issues(token, owner, repo)
    queue, excluded, status_diagnostics = eligible(issues, milestone, project_number)
    print(json.dumps({"mode": "read-only", "active_milestone": milestone,
                      "eligible_count": len(queue), "selected": queue[0] if queue else None,
                      "queue": queue, "issues_inspected": len(issues),
                      "excluded_by_first_failing_filter": excluded,
                      "status_diagnostics": status_diagnostics}, indent=2))

if __name__ == "__main__":
    try:
        main()
    except (KeyError, ValueError, RuntimeError, OSError) as exc:
        print("Queue selection failed closed: " + str(exc), file=sys.stderr)
        sys.exit(1)
