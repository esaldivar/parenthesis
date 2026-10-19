#!/usr/bin/env python3
"""Read-only GitHub Project issue queue selector. Requires token with Projects read access."""
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

def eligible(issues, milestone, project_number):
    """Never infer status or priority from titles; missing metadata fails closed."""
    if not milestone or project_number is None:
        raise ValueError("ACTIVE_MILESTONE and PROJECT_NUMBER are required")
    ranked = []
    for issue in issues:
        if issue.get("state") != "OPEN" or (issue.get("milestone") or {}).get("title") != milestone:
            continue
        items = [item for item in (issue.get("projectItems") or {}).get("nodes", [])
                 if (item.get("project") or {}).get("number") == project_number]
        if len(items) != 1:
            continue
        statuses = [v.get("name") for v in (items[0].get("fieldValues") or {}).get("nodes", [])
                    if (v.get("field") or {}).get("name") == "Status"]
        if statuses != ["Ready for Development"]:
            continue
        labels = {x["name"].lower() for x in (issue.get("labels") or {}).get("nodes", [])}
        if labels & {"blocked", "status:blocked"}:
            continue
        priorities = [p for p in range(4) if ("priority:p" + str(p)) in labels]
        if len(priorities) != 1:
            continue
        ranked.append((priorities[0], issue["number"], issue))
    ranked.sort(key=lambda row: (row[0], row[1]))
    return [{"number": issue["number"], "title": issue["title"], "url": issue["url"],
             "priority": "P" + str(priority)} for priority, _, issue in ranked]

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

def main():
    owner, repo = os.environ.get("GITHUB_REPOSITORY", "").split("/", 1)
    token = os.environ["GH_TOKEN"]
    milestone = os.environ["ACTIVE_MILESTONE"]
    project_number = int(os.environ["PROJECT_NUMBER"])
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
    queue = eligible(issues, milestone, project_number)
    print(json.dumps({"mode": "read-only", "active_milestone": milestone,
                      "eligible_count": len(queue), "selected": queue[0] if queue else None,
                      "queue": queue}, indent=2))

if __name__ == "__main__":
    try:
        main()
    except (KeyError, ValueError, RuntimeError, OSError) as exc:
        print("Queue selection failed closed: " + str(exc), file=sys.stderr)
        sys.exit(1)
