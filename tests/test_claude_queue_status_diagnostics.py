"""Regression tests for read-only queue selection diagnostics."""
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("claude_queue_select", ROOT / "scripts" / "claude_queue_select.py")
selector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(selector)


def issue(status_field="Status", status_value="Ready for Development"):
    return {
        "number": 80, "title": "Safe dry-run issue", "url": "https://github.com/esaldivar/parenthesis/issues/80",
        "state": "OPEN", "milestone": {"title": "M2 — Onboarding"}, "labels": {"nodes": []},
        "projectItems": {"nodes": [{"project": {"number": 2}, "fieldValues": {"nodes": [
            {"name": status_value, "field": {"name": status_field}},
            {"name": "P3 - Low", "field": {"name": "Priority"}},
        ]}}]},
    }


class QueueStatusTests(unittest.TestCase):
    def test_ready_status_is_selected(self):
        queue, excluded, diagnostics = selector.eligible([issue()], "M2 — Onboarding", 2)
        self.assertEqual(queue[0]["number"], 80)
        self.assertEqual(excluded["status"], 0)
        self.assertEqual(diagnostics, [])

    def test_missing_status_field_fails_closed_with_diagnostic(self):
        queue, excluded, diagnostics = selector.eligible([issue(status_field=None)], "M2 — Onboarding", 2)
        self.assertEqual(queue, [])
        self.assertEqual(excluded["status"], 1)
        self.assertEqual(diagnostics[0]["issue"], 80)
        self.assertEqual(diagnostics[0]["status_values"], [])
        self.assertEqual(diagnostics[0]["single_select_fields"][0]["field"], None)


if __name__ == "__main__":
    unittest.main()
