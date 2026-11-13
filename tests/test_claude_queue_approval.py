"""Unit tests for the owner-approval check (scripts/claude_queue_approval.py). Mocked issue history, no network."""
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("claude_queue_approval", ROOT / "scripts" / "claude_queue_approval.py")
approval = importlib.util.module_from_spec(spec)
spec.loader.exec_module(approval)

OWNER = {"login": "owner", "databaseId": 1001}
OTHER = {"login": "someone-else", "databaseId": 2002}
LABELS = ["claude-implementation", "owner-approved-claude"]


def labeled(at, actor=OWNER, label="owner-approved-claude"):
    return {"__typename": "LabeledEvent", "createdAt": at, "label": {"name": label}, "actor": actor}


def unlabeled(at, actor=OWNER, label="owner-approved-claude"):
    return {"__typename": "UnlabeledEvent", "createdAt": at, "label": {"name": label}, "actor": actor}


def renamed(at):
    return {"__typename": "RenamedTitleEvent", "createdAt": at}


def repo(events, labels=None, state="OPEN", last_edited=None, owner=OWNER):
    return {"owner": owner, "issue": {
        "number": 72, "title": "Calendar reminders", "body": "Synthetic issue text.", "url": "https://example.com/72",
        "state": state, "lastEditedAt": last_edited, "milestone": {"title": "M3 — Calendar"},
        "labels": {"nodes": [{"name": x} for x in (labels if labels is not None else LABELS)]},
        "timelineItems": {"nodes": events}}}


class ApprovalTests(unittest.TestCase):
    def assertRejected(self, data, fragment):
        with self.assertRaises(approval.ApprovalError) as ctx:
            approval.verify(data)
        self.assertIn(fragment, str(ctx.exception))

    def test_owner_approval_accepted(self):
        result = approval.verify(repo([labeled("2026-10-20T10:00:00Z")]))
        self.assertEqual(result["number"], 72)
        self.assertEqual(result["approved_at"], "2026-10-20T10:00:00Z")

    def test_label_added_by_someone_else_rejected(self):
        self.assertRejected(repo([labeled("2026-10-20T10:00:00Z", actor=OTHER)]), "someone other than the owner")

    def test_matches_user_id_not_login(self):
        impostor = {"login": "owner", "databaseId": 3003}
        self.assertRejected(repo([labeled("2026-10-20T10:00:00Z", actor=impostor)]), "someone other than the owner")

    def test_relabeled_by_someone_else_after_owner_rejected(self):
        events = [labeled("2026-10-20T10:00:00Z"), unlabeled("2026-10-20T11:00:00Z", actor=OTHER),
                  labeled("2026-10-20T12:00:00Z", actor=OTHER)]
        self.assertRejected(repo(events), "someone other than the owner")

    def test_removed_after_approval_rejected(self):
        events = [labeled("2026-10-20T10:00:00Z"), unlabeled("2026-10-20T11:00:00Z")]
        self.assertRejected(repo(events, labels=["claude-implementation"]), "doesn't have the owner-approved-claude")
        self.assertRejected(repo(events), "no current owner-approved-claude event")

    def test_owner_reapproval_after_removal_accepted(self):
        events = [labeled("2026-10-20T10:00:00Z"), unlabeled("2026-10-20T11:00:00Z"), labeled("2026-10-20T12:00:00Z")]
        self.assertEqual(approval.verify(repo(events))["approved_at"], "2026-10-20T12:00:00Z")

    def test_events_out_of_order_are_sorted(self):
        events = [labeled("2026-10-20T12:00:00Z", actor=OTHER), labeled("2026-10-20T10:00:00Z")]
        self.assertRejected(repo(events), "someone other than the owner")

    def test_text_edited_after_approval_rejected(self):
        self.assertRejected(repo([labeled("2026-10-20T10:00:00Z")], last_edited="2026-10-20T10:30:00Z"),
                            "text changed after")

    def test_text_edited_before_approval_accepted(self):
        approval.verify(repo([labeled("2026-10-20T10:00:00Z")], last_edited="2026-10-20T09:00:00Z"))

    def test_title_changed_after_approval_rejected(self):
        self.assertRejected(repo([labeled("2026-10-20T10:00:00Z"), renamed("2026-10-20T10:05:00Z")]),
                            "title changed after")

    def test_missing_implementation_label_rejected(self):
        self.assertRejected(repo([labeled("2026-10-20T10:00:00Z")], labels=["owner-approved-claude"]),
                            "claude-implementation")

    def test_closed_issue_rejected(self):
        self.assertRejected(repo([labeled("2026-10-20T10:00:00Z")], state="CLOSED"), "isn't open")

    def test_missing_history_rejected(self):
        self.assertRejected(repo([]), "no current owner-approved-claude event")

    def test_missing_owner_id_rejected(self):
        self.assertRejected(repo([labeled("2026-10-20T10:00:00Z")], owner={"login": "an-org"}), "user ID is missing")

    def test_event_without_time_rejected(self):
        self.assertRejected(repo([{"__typename": "LabeledEvent", "label": {"name": "owner-approved-claude"},
                                   "actor": OWNER}]), "without a time")


if __name__ == "__main__":
    unittest.main()
