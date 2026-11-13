"""Unit tests for the Claude queue selector (scripts/claude_queue_select.py). No network."""
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("claude_queue_select", ROOT / "scripts" / "claude_queue_select.py")
selector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(selector)

MILESTONE = "M3 — Calendar"
PROJECT = 2
QUEUE_LABELS = ["claude-implementation", "owner-approved-claude"]


def issue(number, priority="P1 - High", status="Ready For Development", milestone=MILESTONE, project=PROJECT,
          labels=None):
    return {"number": number, "title": f"Issue {number}", "url": f"https://example.com/{number}",
            "state": "OPEN", "milestone": {"title": milestone},
            "labels": {"nodes": [{"name": v} for v in (labels if labels is not None else QUEUE_LABELS)]},
            "projectItems": {"nodes": [{"project": {"number": project},
                "fieldValues": {"nodes": [{"name": status, "field": {"name": "Status"}},
                                          {"name": priority, "field": {"name": "Priority"}}]}}]}}


class QueueSelectionTests(unittest.TestCase):
    def select(self, issues):
        queue, _, _ = selector.eligible(issues, MILESTONE, PROJECT)
        return [x["number"] for x in queue]

    def excluded(self, issues):
        return selector.eligible(issues, MILESTONE, PROJECT)[1]

    def test_priority_then_issue_number(self):
        self.assertEqual(self.select([issue(9), issue(4, "P0 - Critical"), issue(2, "P0 - Critical")]), [2, 4, 9])

    def test_wrong_milestone_or_status_excluded(self):
        self.assertEqual(self.select([issue(1, milestone="M2 — Onboarding"), issue(2, status="Backlog")]), [])

    def test_status_must_match_exactly(self):
        self.assertEqual(self.select([issue(1, status="Ready for Development")]), [])

    def test_in_development_only_when_the_runner_rechecks(self):
        started = [issue(1, status="In Development")]
        self.assertEqual(self.select(started), [])
        queue, _, _ = selector.eligible(started, MILESTONE, PROJECT, ("Ready For Development", "In Development"))
        self.assertEqual([x["number"] for x in queue], [1])

    def test_wrong_project_excluded(self):
        self.assertEqual(self.select([issue(1, project=1)]), [])

    def test_blocked_excluded(self):
        self.assertEqual(self.select([issue(1, labels=QUEUE_LABELS + ["blocked"])]), [])

    def test_ambiguous_or_missing_priority_excluded(self):
        self.assertEqual(self.select([issue(1, priority="Unknown"), issue(2, priority="")]), [])

    def test_closed_excluded(self):
        x = issue(1)
        x["state"] = "CLOSED"
        self.assertEqual(self.select([x]), [])

    def test_requires_explicit_config(self):
        with self.assertRaises(ValueError):
            selector.eligible([], "", PROJECT)

    def test_non_coding_issue_without_implementation_label_excluded(self):
        self.assertEqual(self.select([issue(1, labels=["owner-approved-claude", "design"])]), [])
        self.assertEqual(self.excluded([issue(1, labels=["owner-approved-claude"])])["labels"], 1)

    def test_unapproved_issue_excluded(self):
        self.assertEqual(self.select([issue(1, labels=["claude-implementation"])]), [])

    def test_no_labels_excluded(self):
        self.assertEqual(self.select([issue(1, labels=[])]), [])


if __name__ == "__main__":
    unittest.main()
