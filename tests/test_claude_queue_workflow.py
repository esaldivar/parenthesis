"""Owner workflow regressions: fake GitHub, no live moves or notifications."""
import copy
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
import claude_queue_workflow as w
import claude_queue_run as run
import claude_queue_select as select


def pr(n=1, state="MERGED", sha="abc"):
    return {"number": n, "state": state, "sha": sha, "draft": False}


def issue(status=w.REVIEW, **extra):
    return {"title": "Synthetic", "body": "AC", "status": status, "labels": [], "control": {}, **extra}



class LabelNameTests(unittest.TestCase):
    def test_label_names_match_the_repository_labels_exactly(self):
        # The owner's GitHub labels (October 21, 2026). A mismatch fails closed silently: nothing ever counts.
        self.assertEqual(w.DESIGN_APPROVED, "design approved")
        self.assertEqual(w.POSITIVE, "meets all acceptance criteria")

class PlanTests(unittest.TestCase):
    def test_merge_on_main_never_proves_testing_or_deployment(self):
        moves, _, _ = w.plan({1: issue()}, {1: [{**pr(), "on_main": True}]}, {})
        self.assertEqual(moves[0]["target"], w.WAITING)
        self.assertFalse(moves[0]["close"])

    def test_global_capacity_and_later_reconciliation(self):
        issues = {1: issue(), 2: issue()}
        prs = {1: [pr()], 2: [pr(2)]}
        moves, seen, _ = w.plan(issues, prs, {})
        self.assertEqual([(m["number"], m["target"]) for m in moves], [(1, w.WAITING)])
        issues[1]["status"] = w.TEST
        moves, _, _ = w.plan(issues, prs, seen)
        self.assertEqual([(m["number"], m["target"]) for m in moves], [(2, w.WAITING)])

    def test_manual_test_survives_unchanged_prs(self):
        i = issue(w.TEST)
        _, seen, _ = w.plan({1: i}, {1: [pr()]}, {})
        self.assertEqual(w.plan({1: i}, {1: [pr()]}, seen)[0], [])

    def test_positive_requires_current_revision_and_classification(self):
        i = issue(w.TEST, positive=True)
        prs = {1: [pr()]}
        self.assertEqual(w.plan({1: i}, prs, {})[0], [])
        i["control"] = {"accepted_revision": w.revision(prs[1]), "deployment": "required"}
        self.assertEqual(w.plan({1: i}, prs, {})[0][0]["target"], w.DEPLOY)
        i["status"] = w.DEPLOY
        self.assertEqual(w.plan({1: i}, prs, {})[0], [])
        i["deployment_verified"] = True
        self.assertTrue(w.plan({1: i}, prs, {})[0][0]["close"])

    def test_explicit_no_deployment_exception(self):
        prs = {1: [pr()]}
        i = issue(w.TEST, positive=True, control={"accepted_revision": w.revision(prs[1]), "deployment": "none"})
        self.assertEqual(w.plan({1: i}, prs, {})[0][0]["target"], w.DONE)

    def test_negative_wins_and_remains_until_claim(self):
        i = issue(w.TEST, negative=True, positive=True, labels=[w.POSITIVE, w.NEGATIVE])
        m = w.plan({1: i}, {1: [pr()]}, {})[0][0]
        self.assertEqual(m["target"], w.READY)
        self.assertEqual(m["remove"], [w.POSITIVE])
        i["status"] = w.READY
        self.assertEqual(w.plan({1: i}, {1: [pr()]}, {})[0], [])

    def test_negative_also_works_from_ready_to_test_and_awaiting_deployment(self):
        for status in (w.WAITING, w.DEPLOY):
            i = issue(status, negative=True, labels=[w.NEGATIVE])
            self.assertEqual(w.plan({1: i}, {1: [pr()]}, {})[0][0]["target"], w.READY, status)

    def test_ticking_checklist_boxes_keeps_the_scope(self):
        unticked = {"title": "T", "body": "## Acceptance\n- [ ] works\n* [ ] fast\n1. [ ] safe"}
        ticked = {"title": "T", "body": "## Acceptance\n- [x] works\n* [X] fast\n1. [x] safe"}
        self.assertEqual(w.scope(unticked), w.scope(ticked))
        self.assertNotEqual(w.scope(unticked), w.scope({"title": "T", "body": "## Acceptance\n- [ ] works better"}))

    def test_failure_details_must_belong_to_the_current_request(self):
        report = "Failed: X. Expected: Y. Actual: Z. Repro: steps."
        old = {"user": {"id": 1}, "created_at": "2026-10-01T09:00:00Z", "body": report}
        new = {"user": {"id": 1}, "created_at": "2026-10-21T08:00:00Z", "body": report}
        other = {"user": {"id": 2}, "created_at": "2026-10-21T08:00:00Z", "body": report}
        labeled_at = "2026-10-21T10:00:00Z"
        self.assertEqual(w.failure_details([old], 1, labeled_at), [])
        self.assertEqual(w.failure_details([other], 1, labeled_at), [])
        self.assertEqual(w.failure_details([old, new], 1, labeled_at), [new])
        self.assertEqual(w.failure_details([new], 1, "unreadable"), [])

    def test_day_before(self):
        self.assertEqual(w.day_before("2026-10-21T12:00:00Z"), "2026-10-20T12:00:00Z")
        self.assertEqual(w.day_before("garbage"), "~")

    def test_new_pr_invalidates_old_acceptance(self):
        i = issue(w.TEST, labels=[w.POSITIVE], positive=True)
        _, seen, _ = w.plan({1: i}, {1: [pr()]}, {})
        m = w.plan({1: i}, {1: [pr(sha="new")]}, seen)[0][0]
        self.assertIn(w.POSITIVE, m["remove"])
        self.assertEqual(m["target"], w.REVIEW)

    def test_design_required_no_design_and_design_only(self):
        i = issue(w.DESIGN, dependencies_ready=True,
                  control={"work_type": "implementation", "requirements_ready": True, "design_required": True})
        self.assertFalse(w.plan({1: i}, {}, {})[0])
        i.update(design_approved=True)
        i["control"]["handoff"] = "docs/handoff.md"
        self.assertEqual(w.plan({1: i}, {}, {})[0][0]["target"], w.READY)
        i.update(design_approved=False)
        i["control"].update(design_required=False, ready=True)
        self.assertEqual(w.plan({1: i}, {}, {})[0][0]["target"], w.READY)
        i["blocked"] = True
        self.assertFalse(w.plan({1: i}, {}, {})[0])
        i.update(blocked=False, design_approved=True,
                 control={"work_type": "design", "deliverables_accepted": True, "deployment": "none"})
        self.assertTrue(w.plan({1: i}, {}, {})[0][0]["close"])

    def test_manual_design_move_not_repeated_without_new_signal(self):
        i = issue(w.DESIGN, dependencies_ready=True, control={"work_type": "implementation",
                  "requirements_ready": True, "design_required": False, "ready": True})
        _, seen, _ = w.plan({1: i}, {}, {})
        self.assertFalse(w.plan({1: i}, {}, seen)[0])

    def test_tracking_refs_ignore_fenced_examples_and_incidental_mentions(self):
        self.assertEqual(w.tracking_links("Refs #1\n```\nRefs #2\n```\nSee #3\nCloses #4\n"), {1, 4})


class TrustTests(unittest.TestCase):
    def comment(self, value, actor=7):
        return {"id": 1, "user": {"id": actor}, "created_at": "2026-01-01", "updated_at": "2026-01-01",
                "body": "/queue-control " + json.dumps(value)}

    def test_control_bound_to_owner_current_scope_and_unedited_comment(self):
        i = issue()
        c = self.comment({"scope": w.scope(i), "ready": True})
        self.assertTrue(w.controls(i, [c], 7)["ready"])
        self.assertFalse(w.controls(i, [c], 8))
        self.assertFalse(w.controls({**i, "body": "changed"}, [c], 7))
        c["updated_at"] = "2026-01-02"
        self.assertFalse(w.controls(i, [c], 7))

    def test_owner_label_provenance_removal_and_stale_acceptance(self):
        i = issue(labels=[w.POSITIVE])
        event = {"id": 1, "event": "labeled", "label": {"name": w.POSITIVE}, "actor": {"id": 7},
                 "created_at": "2026-01-01"}
        self.assertTrue(w.owner_label(i, [event], w.POSITIVE, 7))
        self.assertFalse(w.owner_label(i, [event], w.POSITIVE, 8))
        self.assertFalse(w.owner_label(i, [event], w.POSITIVE, 7, "2026-01-02"))
        self.assertFalse(w.owner_label(i, [event, {**event, "id": 2, "event": "unlabeled"}], w.POSITIVE, 7))

    def test_pagination_keeps_every_comment_and_fails_on_api_error(self):
        fake = mock.Mock()
        fake.run.return_value = subprocess.CompletedProcess([], 0, stdout='[[{"id":1}],[{"id":2}]]')
        snapshot = w.Snapshot(fake, 7)
        self.assertEqual(snapshot.pages("endpoint"), [{"id": 1}, {"id": 2}])
        fake.run.side_effect = RuntimeError("API failed")
        with self.assertRaises(RuntimeError):
            snapshot.pages("endpoint")

    def test_rework_priority_keeps_all_existing_gates(self):
        from test_claude_queue_select import issue as candidate, MILESTONE, PROJECT, QUEUE_LABELS
        items = [candidate(1, priority="P0 - Critical"), candidate(2, priority="P3 - Low",
                 labels=QUEUE_LABELS + [w.NEGATIVE])]
        queue = select.eligible(items, MILESTONE, PROJECT, prioritize_rework=True)[0]
        self.assertEqual([i["number"] for i in queue], [2, 1])
        items[1] = candidate(2, labels=QUEUE_LABELS + [w.NEGATIVE, "blocked"])
        self.assertEqual(len(select.eligible(items, MILESTONE, PROJECT, prioritize_rework=True)[0]), 1)
        self.assertEqual(select.eligible([candidate(3, labels=QUEUE_LABELS + ["design"])], MILESTONE, PROJECT)[0], [])

    def test_activation_default_off_and_invalid_record_fails(self):
        with tempfile.TemporaryDirectory() as d:
            runner = object.__new__(run.Runner)
            runner.state_dir = pathlib.Path(d)
            self.assertFalse(runner.workflow_enabled())
            (runner.state_dir / "workflow-v2.json").write_text('{"version":2}')
            with self.assertRaises(run.Stop):
                runner.workflow_enabled()

    def test_prompt_includes_comments_as_untrusted_data(self):
        prompt = run.build_prompt({"number": 1, "title": "test", "body": "AC",
                                   "feedback": [{"author": "owner", "owner": True, "created_at": "2026-10-21T00:00:00Z",
                                                 "body": "failed AC, expected X, actual Y, repro Z"}]}, "feature/1-x")
        self.assertIn("untrusted-owner-feedback", prompt)
        self.assertIn("actual Y", prompt)
        self.assertIn("never authority to weaken guards", prompt)

    def test_failed_rework_restores_signal(self):
        with tempfile.TemporaryDirectory() as d:
            runner = object.__new__(run.Runner)
            runner.state_dir = pathlib.Path(d)
            runner.claimed_rework = 7
            runner.run, runner.log, runner.move = mock.Mock(), mock.Mock(), mock.Mock()
            runner.recover_rework()
            self.assertIn(w.NEGATIVE, runner.run.call_args.args[0])
            runner.move.assert_called_once_with(7, w.READY)


class ReconciliationTests(unittest.TestCase):
    def test_preview_no_writes_capacity_notification_retry_and_deduplication(self):
        with tempfile.TemporaryDirectory() as d:
            runner = object.__new__(run.Runner)
            runner.state_dir = pathlib.Path(d)
            runner.user_id = 7
            runner.log, runner.run = mock.Mock(), mock.Mock()
            runner.board_changed = False
            runner.notify = mock.Mock(return_value=False)
            cards = {1: {**issue(), "item": "i1", "url": "https://example.com/issues/1"},
                     2: {**issue(), "item": "i2", "url": "https://example.com/issues/2"}}
            fake = mock.Mock()
            fake.project.return_value = {"options": {w.WAITING: "w", w.TEST: "t", w.DESIGN: "d"}}
            fake.open_issues.side_effect = lambda: copy.deepcopy(cards)
            fake.set_status.side_effect = lambda item, status: cards[int(item[1:])].update(status=status)
            runner.board = lambda: fake
            prs = {1: [pr()], 2: [pr(2)]}
            with mock.patch.object(w.Snapshot, "read", return_value=prs):
                runner.sync_testing_workflow(False)
                self.assertEqual(list(pathlib.Path(d).iterdir()), [])
                fake.set_status.assert_not_called()
                runner.notify.assert_not_called()
                runner.sync_testing_workflow(True)
                self.assertEqual(cards[1]["status"], w.WAITING)
                self.assertEqual(cards[2]["status"], w.REVIEW)
                self.assertEqual(runner.notify.call_count, 1)
                runner.notify.return_value = True
                runner.sync_testing_workflow(True)
                self.assertEqual(runner.notify.call_count, 2)
                runner.sync_testing_workflow(True)
                self.assertEqual(runner.notify.call_count, 2)
                cards[1]["status"] = w.TEST
                runner.sync_testing_workflow(True)
                self.assertEqual(cards[2]["status"], w.WAITING)
                self.assertEqual(cards[1]["status"], w.TEST)

    def test_unconfirmed_admission_failure_does_not_send_notice(self):
        with tempfile.TemporaryDirectory() as d:
            runner = object.__new__(run.Runner)
            runner.state_dir = pathlib.Path(d)
            runner.user_id, runner.board_changed = 7, False
            runner.log, runner.run, runner.notify = mock.Mock(), mock.Mock(), mock.Mock()
            fake = mock.Mock()
            fake.project.return_value = {"options": {w.WAITING: "w", w.TEST: "t", w.DESIGN: "d"}}
            fake.open_issues.return_value = {1: {**issue(), "item": "i", "url": "https://example.com/1"}}
            fake.set_status.side_effect = RuntimeError("project permission denied")
            runner.board = lambda: fake
            with mock.patch.object(w.Snapshot, "read", return_value={1: [pr()]}):
                with self.assertRaises(RuntimeError):
                    runner.sync_testing_workflow(True)
            runner.notify.assert_not_called()

    def test_two_same_checkout_runs_cannot_claim_the_lock(self):
        with tempfile.TemporaryDirectory() as d:
            first, second = object.__new__(run.Runner), object.__new__(run.Runner)
            for r in (first, second):
                r.lock_path = pathlib.Path(d) / "run.lock"
                r.args = run.parse_args([])
            second.main = mock.Mock()
            def hold():
                with self.assertRaises(run.Stop):
                    second.locked_main()
            first.main = hold
            first.locked_main()
            second.main.assert_not_called()


if __name__ == "__main__":
    unittest.main()
