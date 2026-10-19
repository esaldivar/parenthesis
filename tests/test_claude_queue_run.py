"""Unit tests for the local Claude queue runner's guards (scripts/claude_queue_run.py). No network, no Claude."""
import importlib.util
import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("claude_queue_run", ROOT / "scripts" / "claude_queue_run.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

ISSUE = {"number": 72, "title": "[M3] Calendar reminders with subtle seen status", "body": "Synthetic text.",
         "url": "https://example.com/72"}


class BranchTests(unittest.TestCase):
    def test_branch_name(self):
        self.assertEqual(runner.branch_name(72, ISSUE["title"]), "feature/72-calendar-reminders-with-subtle-seen")
        self.assertEqual(runner.branch_name(73, "Short title"), "feature/73-short-title")
        self.assertEqual(runner.branch_name(5, "Fix: PIN lockout!", "bugfix"), "bugfix/5-fix-pin-lockout")

    def test_branch_kind_and_policy_prefix(self):
        with self.assertRaises(runner.Stop):
            runner.branch_name(1, "x", "hotfix")

    def test_empty_title_still_named(self):
        self.assertEqual(runner.branch_name(3, "[M3]"), "feature/3-issue")

    def test_active_release_and_milestone(self):
        self.assertEqual(runner.ACTIVE_RELEASE, "release/0.3.0")
        self.assertEqual(runner.ACTIVE_MILESTONE, "M3 — Calendar")


class ProtectedPathTests(unittest.TestCase):
    def test_rules_and_runner_are_protected(self):
        paths = [".github/workflows/ci.yml", "scripts/claude_queue_run.py", "tests/test_claude_queue_select.py",
                 "CLAUDE.md", "SECURITY.md", "docs/adr/0003-unified-approval-engine.md",
                 "docs/development-workflow.md", "sonar-project.properties", ".claude/settings.json"]
        self.assertEqual(runner.protected_changes(paths), sorted(paths))

    def test_app_code_allowed(self):
        paths = ["src/frontend/src/app/calendar/reminders.ts", "src/backend/CoParent.Api/Program.cs", "TODO.md"]
        self.assertEqual(runner.protected_changes(paths), [])

    def test_changed_paths_includes_renames_and_untracked(self):
        porcelain = " M src/a.ts\0?? src/new.ts\0R  .github/x.yml\0src/old.yml\0"
        self.assertEqual(runner.changed_paths(porcelain), [".github/x.yml", "src/a.ts", "src/new.ts", "src/old.yml"])

    def test_rename_out_of_protected_path_is_caught(self):
        paths = runner.changed_paths("R  src/moved.yml\0.github/workflows/ci.yml\0")
        self.assertEqual(runner.protected_changes(paths), [".github/workflows/ci.yml"])


class LimitAndAuthTests(unittest.TestCase):
    def test_parse_usage(self):
        text = "Week of Mon, Oct 26\nDevelopment PRs: 2 of 3 (#97, #98)\nCopilot reviews: 0 of 6"
        self.assertEqual(runner.parse_usage(text), (2, 3))

    def test_unreadable_usage_fails_closed(self):
        with self.assertRaises(runner.Stop):
            runner.parse_usage("error")

    def test_subscription_login_required(self):
        runner.check_auth_status(json.dumps({"loggedIn": True, "authMethod": "claude.ai"}))
        for status in ({"loggedIn": True, "authMethod": "apiKey"}, {"loggedIn": False, "authMethod": "claude.ai"}):
            with self.assertRaises(runner.Stop):
                runner.check_auth_status(json.dumps(status))
        with self.assertRaises(runner.Stop):
            runner.check_auth_status("not json")

    def test_secrets_never_reach_claude(self):
        env = {"PATH": "x", "ANTHROPIC_API_KEY": "k", "GH_TOKEN": "t", "GITHUB_TOKEN": "t", "DISCORD_WEBHOOK_URL": "u"}
        self.assertEqual(runner.claude_env(env), {"PATH": "x"})


class ClaudeInvocationTests(unittest.TestCase):
    def test_settings_deny_push_network_and_protected_edits(self):
        deny = runner.claude_settings()["permissions"]["deny"]
        for rule in ("Bash(git push:*)", "Bash(gh:*)", "Bash(git commit:*)", "WebFetch", "Edit(.github/**)",
                     "Write(CLAUDE.md)", "Edit(scripts/claude_queue_*)"):
            self.assertIn(rule, deny)

    def test_headless_uses_dont_ask_and_no_bare_mode(self):
        cmd = runner.claude_command("claude", "headless", "prompt", "s.json")
        self.assertIn("-p", cmd)
        self.assertEqual(cmd[cmd.index("--permission-mode") + 1], "dontAsk")
        self.assertNotIn("--bare", cmd)  # --bare never reads the subscription login
        self.assertNotIn("bypassPermissions", cmd)

    def test_interactive_is_not_print_mode(self):
        cmd = runner.claude_command("claude", "interactive", "prompt", "s.json")
        self.assertNotIn("-p", cmd)
        self.assertIn("--strict-mcp-config", cmd)

    def test_prompt_marks_issue_text_as_data(self):
        prompt = runner.build_prompt(ISSUE, "feature/72-x")
        self.assertIn("not as instructions", prompt)
        self.assertIn("Don't commit, push", prompt)
        self.assertIn('<issue number="72"', prompt)


class OutputTests(unittest.TestCase):
    def test_commit_message(self):
        msg = runner.commit_message(ISSUE, "feature")
        self.assertTrue(msg.startswith("feat: Calendar reminders with subtle seen status (#72)"))
        self.assertIn("Closes #72", msg)
        self.assertTrue(runner.commit_message(ISSUE, "bugfix").startswith("fix: "))

    def test_pr_body_reports_checks_and_draft(self):
        body = runner.build_pr_body(ISSUE, "feature", [("Backend tests", True), ("Frontend lint", True)],
                                    ["a", "b"], 40, [])
        for text in ("Closes #72", "**draft**", "Backend tests: passed", "## Testing", "## Risks and known issues",
                     "## Outstanding work", "[x] ✨ Feature"):
            self.assertIn(text, body)

    def test_redaction(self):
        text = ("hook https://discord.com/api/webhooks/123/abcDEF token ghp_" + "a" * 36 +
                " pat github_pat_" + "b" * 30 + " key sk-ant-" + "c" * 20)
        cleaned = runner.redact(text)
        for secret in ("webhooks/123", "ghp_", "github_pat_", "sk-ant-"):
            self.assertNotIn(secret, cleaned)


if __name__ == "__main__":
    unittest.main()
