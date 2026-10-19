"""Unit tests for the project board sync (scripts/claude_queue_board.py). No network."""
import importlib.util
import json
import pathlib
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("claude_queue_board", ROOT / "scripts" / "claude_queue_board.py")
board = importlib.util.module_from_spec(spec)
spec.loader.exec_module(board)


def pr(state="OPEN", draft=False, on_main=False):
    return {"state": state, "is_draft": draft, "on_main": on_main}


class LinkedIssueTests(unittest.TestCase):
    def test_closing_keywords_that_link(self):
        body = ("## Description\nCloses #98.\n\nAdds tests. Fixes #12\n- Resolves: #7\nfixed #3 too\n"
                "Done in CI. Closes #94.")
        self.assertEqual(board.linked_issues(body), {98, 12, 7, 3, 94})

    def test_mentions_and_to_dos_dont_link(self):
        body = ("Follow-up to #94 / #97.\n- After the release reaches main, confirm all seven closed and close #65.\n"
                "See #48; it closes nothing. Unclosed #5.")
        self.assertEqual(board.linked_issues(body), set())

    def test_empty_body(self):
        self.assertEqual(board.linked_issues(None), set())


class DeriveStatusTests(unittest.TestCase):
    def test_no_prs_leaves_the_card_alone(self):
        self.assertIsNone(board.derive_status([]))

    def test_open_prs(self):
        self.assertEqual(board.derive_status([pr(draft=True)]), board.AWAITING_APPROVAL)
        self.assertEqual(board.derive_status([pr()]), board.CODE_REVIEW)
        self.assertEqual(board.derive_status([pr(draft=True), pr()]), board.CODE_REVIEW)

    def test_open_follow_up_wins_over_earlier_merge(self):
        self.assertEqual(board.derive_status([pr("MERGED", on_main=True), pr(draft=True)]), board.AWAITING_APPROVAL)

    def test_merged(self):
        self.assertEqual(board.derive_status([pr("MERGED")]), board.AWAITING_DEPLOYMENT)
        self.assertEqual(board.derive_status([pr("MERGED", on_main=True)]), board.DONE)
        self.assertEqual(board.derive_status([pr("MERGED", on_main=True), pr("MERGED")]), board.AWAITING_DEPLOYMENT)
        self.assertEqual(board.derive_status([pr("CLOSED"), pr("MERGED", on_main=True)]), board.DONE)

    def test_closed_without_merging(self):
        self.assertEqual(board.derive_status([pr("CLOSED"), pr("CLOSED")]), board.BACKLOG)


class PlanTests(unittest.TestCase):
    ISSUES = {98: {"status": board.IN_DEVELOPMENT}, 94: {"status": board.BACKLOG}, 48: {"status": "In Design"}}

    def test_moves_when_the_prs_change(self):
        changes, seen = board.plan_changes(self.ISSUES, {98: [pr(draft=True)], 94: [pr("MERGED")]}, {})
        self.assertEqual([(c["number"], c["target"]) for c in changes],
                         [(94, board.AWAITING_DEPLOYMENT), (98, board.AWAITING_APPROVAL)])
        self.assertEqual(seen, {"94": board.AWAITING_DEPLOYMENT, "98": board.AWAITING_APPROVAL})

    def test_manual_moves_stay_until_the_prs_change(self):
        # The owner moved #94 back to Backlog by hand; its PRs still say Awaiting Deployment, as at the last sync.
        changes, _ = board.plan_changes(self.ISSUES, {94: [pr("MERGED")]}, {"94": board.AWAITING_DEPLOYMENT})
        self.assertEqual(changes, [])

    def test_already_there_is_recorded_without_a_change(self):
        changes, seen = board.plan_changes({1: {"status": board.CODE_REVIEW}}, {1: [pr()]}, {})
        self.assertEqual(changes, [])
        self.assertEqual(seen, {"1": board.CODE_REVIEW})

    def test_done_closes_the_issue(self):
        changes, _ = board.plan_changes({5: {"status": board.DONE}}, {5: [pr("MERGED", on_main=True)]}, {})
        self.assertEqual(changes, [{"number": 5, "current": board.DONE, "target": board.DONE, "close": True}])

    def test_issues_without_prs_and_prs_without_open_issues_are_ignored(self):
        changes, seen = board.plan_changes(self.ISSUES, {12: [pr()]}, {})
        self.assertEqual((changes, seen), ([], {}))

    def test_describe(self):
        self.assertEqual(board.describe([]), "Board: no status changes.")
        text = board.describe([{"number": 5, "current": None, "target": board.DONE, "close": True}])
        self.assertIn("#5: (no status) -> Done (and close the issue)", text)


class AnnouncementTests(unittest.TestCase):
    def test_nothing_moved_sends_nothing(self):
        self.assertEqual(board.announcement([]), "")

    def test_one_message_lists_every_move(self):
        text = board.announcement([
            {"number": 98, "title": "[M3] Calendar validation tests", "from": board.READY, "to": board.IN_DEVELOPMENT},
            {"number": 94, "title": "Local Claude queue", "from": board.AWAITING_DEPLOYMENT, "to": board.DONE,
             "closed": True},
            {"number": 7, "title": "No status yet", "from": None, "to": board.CODE_REVIEW}])
        self.assertEqual(text.splitlines(), [
            "Parenthesis board update",
            "#98 [M3] Calendar validation tests: Ready For Development → In Development",
            "#94 Local Claude queue: Awaiting Deployment → Done (issue closed)",
            "#7 No status yet: (no status) → Code Review"])

    def test_long_titles_and_release_days_stay_short(self):
        moves = [{"number": n, "title": "x" * 80, "from": board.AWAITING_DEPLOYMENT, "to": board.DONE, "closed": True}
                 for n in range(25)]
        lines = board.announcement(moves, limit=20).splitlines()
        self.assertEqual(len(lines), 22)
        self.assertIn("x" * 59 + "…", lines[1])
        self.assertEqual(lines[-1], "…and 5 more (see the run log)")


class FakeGh:
    """Answers the Board's gh calls from canned data and records them."""

    def __init__(self, responses):
        self.responses, self.calls = responses, []

    def __call__(self, cmd):
        self.calls.append(cmd)
        for key, value in self.responses.items():
            if key in " ".join(cmd):
                return subprocess.CompletedProcess(cmd, 0, stdout=json.dumps(value))
        return subprocess.CompletedProcess(cmd, 0, stdout="{}")


OPTIONS = [{"id": f"o-{n}", "name": n} for n in (board.READY, board.IN_DEVELOPMENT, board.AWAITING_APPROVAL,
                                                   board.CODE_REVIEW, board.AWAITING_DEPLOYMENT, board.DONE,
                                                   board.BACKLOG)]


class BoardTests(unittest.TestCase):
    def test_open_issues_keeps_only_project_2(self):
        page = {"data": {"repository": {"issues": {"pageInfo": {"hasNextPage": False, "endCursor": None}, "nodes": [
            {"number": 98, "title": "Tests", "projectItems": {"nodes": [
                {"id": "item-98", "project": {"number": 2}, "fieldValueByName": {"name": board.READY}}]}},
            {"number": 7, "title": "Elsewhere", "projectItems": {"nodes": [
                {"id": "item-7", "project": {"number": 1}, "fieldValueByName": None}]}}]}}}}
        issues = board.Board(FakeGh({"issues(first": page}), "o", "r").open_issues()
        self.assertEqual(issues, {98: {"title": "Tests", "item": "item-98", "status": board.READY}})

    def test_linked_prs(self):
        prs = [{"number": 101, "state": "MERGED", "isDraft": False, "body": "Closes #98.", "mergeCommit": {"oid": "abc"}},
               {"number": 102, "state": "OPEN", "isDraft": True, "body": "Fixes #98", "mergeCommit": None}]
        linked = board.Board(FakeGh({"pr list": prs}), "o", "r").linked_prs(lambda oid: oid == "abc")
        self.assertEqual(linked[98], [{"number": 101, "state": "MERGED", "is_draft": False, "on_main": True},
                                      {"number": 102, "state": "OPEN", "is_draft": True, "on_main": False}])

    def test_set_status_uses_the_option_id(self):
        project = {"data": {"repositoryOwner": {"projectV2": {"id": "proj", "field": {"id": "status", "options": OPTIONS}}}}}
        gh = FakeGh({"repositoryOwner": project, "updateProjectV2ItemFieldValue": {"data": {}}})
        board.Board(gh, "o", "r").set_status("item-98", board.CODE_REVIEW)
        mutation = gh.calls[-1]
        for arg in ("project=proj", "item=item-98", "field=status", f"option=o-{board.CODE_REVIEW}"):
            self.assertIn(arg, mutation)
        self.assertIn("-F", gh.calls[0])  # the project number is sent as a number

    def test_missing_status_option_fails_closed(self):
        project = {"data": {"repositoryOwner": {"projectV2": {"id": "p", "field": {"id": "s", "options": OPTIONS[:3]}}}}}
        with self.assertRaises(RuntimeError):
            board.Board(FakeGh({"repositoryOwner": project}), "o", "r").project()

    def test_graphql_errors_fail_closed(self):
        with self.assertRaises(RuntimeError):
            board.Board(FakeGh({"repositoryOwner": {"errors": [{"message": "needs project scope"}]}}), "o", "r").project()


if __name__ == "__main__":
    unittest.main()
