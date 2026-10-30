"""Unit tests for the local Claude queue runner's guards (scripts/claude_queue_run.py). No network, no Claude."""
import contextlib
import datetime
import importlib.util
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

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
        text = "Week of Mon, Oct 26\nRelease promotions: 2 of 3 (#88, #117)\nCopilot reviews: 0 of 6"
        self.assertEqual(runner.parse_usage(text), (2, 3))

    def test_unreadable_usage_fails_closed(self):
        with self.assertRaises(runner.Stop):
            runner.parse_usage("error")

    def test_old_broad_usage_is_not_accepted(self):
        with self.assertRaises(runner.Stop):
            runner.parse_usage("Development PRs: 99 of 3")

    def test_only_release_to_develop_is_capped(self):
        for source in ("feature/a", "bugfix/a", "docs/a", "chore/a", "hotfix/a", "develop", "release/"):
            for target in ("develop", "release/0.3.0", "main"):
                self.assertFalse(runner.weekly_limit_applies(source, target))
        self.assertTrue(runner.weekly_limit_applies("release/0.3.0", "develop"))
        self.assertFalse(runner.weekly_limit_applies("release/0.3.0", "main"))

    def test_ordinary_admission_and_pre_pr_recheck_never_read_cap(self):
        instance = object.__new__(runner.Runner)
        instance.weekly_usage = mock.Mock(side_effect=AssertionError("ordinary work must not query allowance"))
        instance.log = mock.Mock()
        for branch in ("feature/98-calendar-tests", "bugfix/98-calendar-tests"):
            self.assertFalse(instance.weekly_limit_reached(branch))  # admission
            self.assertFalse(instance.weekly_limit_reached(branch))  # before push/PR
        instance.weekly_usage.assert_not_called()

    def test_in_scope_guard_rechecks_usage_and_fails_closed(self):
        instance = object.__new__(runner.Runner)
        instance.log = mock.Mock()
        instance.weekly_usage = mock.Mock(side_effect=[(2, 3), (3, 3), runner.Stop("API unavailable")])
        with mock.patch.object(runner, "ACTIVE_RELEASE", "develop"):
            self.assertFalse(instance.weekly_limit_reached("release/0.3.0"))
            self.assertTrue(instance.weekly_limit_reached("release/0.3.0"))
            with self.assertRaises(runner.Stop):
                instance.weekly_limit_reached("release/0.3.0")

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
    def test_manual_commit_only_still_prevents_push_after_ordinary_work_is_exempt(self):
        # All commands are mocked; no Claude, network, git or task is invoked.
        with tempfile.TemporaryDirectory(dir=ROOT, prefix=".test-queue-") as directory:
            instance = object.__new__(runner.Runner)
            instance.args = runner.parse_args(["--commit-only", "--mode", "headless"])
            instance.repo_root = pathlib.Path(directory) / "repo"
            instance.state_dir = pathlib.Path(directory)
            instance.log_path = pathlib.Path(directory) / "run.log"
            instance.log = mock.Mock()
            instance.move = mock.Mock()
            instance.exe = lambda name: "synthetic-" + name
            instance.select_and_verify = mock.Mock(return_value={**ISSUE, "approved_at": "synthetic"})
            instance.weekly_usage = mock.Mock(side_effect=AssertionError("ordinary coding cannot query cap"))
            def fake_run(cmd, **kwargs):
                text = ""
                if cmd == ["gh", "auth", "token"]:
                    text = "synthetic-token"
                elif cmd[:3] == ["gh", "repo", "view"]:
                    text = "esaldivar/parenthesis"
                elif cmd == ["gh", "api", "user"]:
                    text = '{"id":1}'
                elif cmd[:3] == ["claude", "auth", "status"]:
                    text = '{"loggedIn":true,"authMethod":"claude.ai"}'
                return subprocess.CompletedProcess(cmd, 0, stdout=text)
            instance.run = mock.Mock(side_effect=fake_run)
            def fake_git(*args, **kwargs):
                if args[:1] == ("rev-parse",):
                    return "base"
                if args[:1] == ("status",):
                    return " M src/synthetic.cs\0"
                if args[:3] == ("diff", "--cached", "--numstat"):
                    return "1\t0\tsrc/synthetic.cs"
                return ""
            instance.git = mock.Mock(side_effect=fake_git)
            instance.main()
            self.assertTrue(any(call.args[0] == "commit" for call in instance.git.call_args_list))
            self.assertFalse(any(call.args[0] == "push" for call in instance.git.call_args_list))
            self.assertFalse(any(call.args[0][:3] == ["gh", "pr", "create"] for call in instance.run.call_args_list))
            instance.weekly_usage.assert_not_called()

    def _claude_fails(self, directory, claude_output):
        """A headless run where Claude Code exits with 1 and prints claude_output. Everything is mocked."""
        instance = object.__new__(runner.Runner)
        instance.args = runner.parse_args(["--commit-only", "--mode", "headless"])
        instance.repo_root = pathlib.Path(directory) / "repo"
        instance.state_dir = pathlib.Path(directory)
        instance.log_path = pathlib.Path(directory) / "run.log"
        instance.log = mock.Mock()
        instance.move = mock.Mock()
        instance.exe = lambda name: "synthetic-" + name
        instance.select_and_verify = mock.Mock(return_value={**ISSUE, "approved_at": "synthetic"})
        answers = {("gh", "auth", "token"): "synthetic-token", ("gh", "repo", "view"): "esaldivar/parenthesis",
                   ("gh", "api", "user"): '{"id":1}', ("claude", "auth", "status"): '{"loggedIn":true,"authMethod":"claude.ai"}'}
        def fake_run(cmd, **kwargs):
            if cmd[0] == "synthetic-claude":
                return subprocess.CompletedProcess(cmd, 1, stdout=claude_output)
            return subprocess.CompletedProcess(cmd, 0, stdout=answers.get(tuple(cmd[:3]), ""))
        instance.run = mock.Mock(side_effect=fake_run)
        instance.git = mock.Mock(side_effect=lambda *args, **kwargs: "base" if args[:1] == ("rev-parse",) else "")
        return instance

    def test_usage_limit_cleans_up_and_pauses_for_a_later_retry(self):
        with tempfile.TemporaryDirectory(dir=ROOT, prefix=".test-queue-") as directory:
            instance = self._claude_fails(directory, "You've hit your session limit · resets 10:30am (America/Chicago)\n")
            with self.assertRaises(runner.Paused) as raised:
                instance.main()
            git_calls = [call.args for call in instance.git.call_args_list]
            self.assertIn(("worktree", "remove", "--force", str(pathlib.Path(directory) / "parenthesis-claude-72")), git_calls)
            self.assertTrue(any(args[:2] == ("branch", "-D") and args[2].startswith("feature/72-") for args in git_calls))
            instance.move.assert_called_with(72, runner.board.READY)
            self.assertIn("resets 10:30am (America/Chicago)", str(raised.exception))
            self.assertFalse(issubclass(runner.Paused, runner.Stop))

    def test_other_claude_failures_still_stop_and_keep_the_worktree(self):
        with tempfile.TemporaryDirectory(dir=ROOT, prefix=".test-queue-") as directory:
            instance = self._claude_fails(directory, "Error: something else went wrong\n")
            with self.assertRaisesRegex(runner.Stop, "Claude Code exited with 1; the worktree is kept"):
                instance.main()
            self.assertFalse(any(call.args[:2] == ("worktree", "remove") for call in instance.git.call_args_list))

    def test_usage_limit_detection(self):
        self.assertEqual(runner.usage_limit("You've hit your session limit · resets 10:30am (America/Chicago)"),
                         "10:30am (America/Chicago)")
        self.assertEqual(runner.usage_limit("Claude AI usage limit reached"), "")
        self.assertIsNone(runner.usage_limit("Tests failed"))
        self.assertIsNone(runner.usage_limit(""))

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
        self.assertIn("Refs #72", msg)
        self.assertNotIn("Closes #72", msg)
        self.assertTrue(runner.commit_message(ISSUE, "bugfix").startswith("fix: "))

    def test_pr_body_reports_checks_and_draft(self):
        body = runner.build_pr_body(ISSUE, "feature", [("Backend tests", True), ("Frontend lint", True)],
                                    ["a", "b"], 40, [])
        self.assertIn("## Tracking issues\nRefs #72", body)
        self.assertNotIn("Closes #72", body)
        for text in ("Refs #72", "**draft**", "Backend tests: passed", "## Testing", "## Risks and known issues",
                     "## Outstanding work", "[x] ✨ Feature"):
            self.assertIn(text, body)

    def test_redaction(self):
        text = ("hook https://discord.com/api/webhooks/123/abcDEF token ghp_" + "a" * 36 +
                " pat github_pat_" + "b" * 30 + " key sk-ant-" + "c" * 20)
        cleaned = runner.redact(text)
        for secret in ("webhooks/123", "ghp_", "github_pat_", "sk-ant-"):
            self.assertNotIn(secret, cleaned)


class ScheduledRunTests(unittest.TestCase):
    def test_scheduled_is_headless_and_takes_the_top_of_the_queue(self):
        args = runner.parse_args(["--scheduled"])
        self.assertEqual(args.mode, "headless")
        self.assertIsNone(args.issue)
        self.assertEqual(runner.parse_args([]).mode, "interactive")

    def test_scheduled_rejects_manual_only_options(self):
        for extra in (["--issue", "72"], ["--commit-only"], ["--mode", "interactive"]):
            with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
                runner.parse_args(["--scheduled", *extra])

    def test_handled_issues_from_local_remote_and_pr_branches(self):
        names = ["develop", "feature/98-calendar-validation-tests", "refs/heads/bugfix/12-pin-lockout",
                 "origin/feature/40-x", "design/signup-invitations", "release/0.3.0", "feature/no-number",
                 "chore/sync-develop-into-0.3.0", "hotfix/7-urgent"]
        self.assertEqual(runner.handled_issue_numbers(names), {98, 12, 40})

    def test_failures_notify_once_until_something_changes(self):
        self.assertTrue(runner.should_notify("Claude queue stopped: A", ""))
        self.assertFalse(runner.should_notify("Claude queue stopped: A", "Claude queue stopped: A\n"))
        self.assertTrue(runner.should_notify("Claude queue stopped: B", "Claude queue stopped: A"))

    def test_idle_is_not_a_failure(self):
        self.assertFalse(issubclass(runner.Idle, runner.Stop))

    def test_stale_lock_detection(self):
        self.assertTrue(runner.process_alive(os.getpid()))
        self.assertFalse(runner.process_alive(0))
        finished = subprocess.Popen([sys.executable, "-c", "pass"])
        finished.wait()
        self.assertFalse(runner.process_alive(finished.pid))

    def test_status_line(self):
        now = datetime.datetime(2026, 10, 26, 0, 0, 5)
        self.assertEqual(runner.status_line("idle", "No eligible issue", now),
                         "2026-10-26T00:00:05 idle: No eligible issue\n")
        self.assertEqual(runner.status_line("finished", "", now), "2026-10-26T00:00:05 finished\n")
        self.assertNotIn("webhooks/1", runner.status_line("stopped", "https://discord.com/api/webhooks/1/x", now))

    def test_refreshed_rerun_never_inherits_console_handles(self):
        """The scheduled task has no console; inherited handles fail with WinError 6 (October 19, 2026)."""
        def fake_run(cmd, **kwargs):
            if cmd[-1] == "--scheduled":  # the rerun of the refreshed runner
                calls.append(kwargs)
                return subprocess.CompletedProcess(cmd, 0)
            result = "" if "status" in cmd else None
            return subprocess.CompletedProcess(cmd, 1 if "symbolic-ref" in cmd else 0, stdout=result or "")

        calls = []
        with mock.patch.object(runner.subprocess, "run", side_effect=fake_run), \
                mock.patch.object(runner.shutil, "which", return_value="git"):
            self.assertEqual(runner.refresh_and_rerun(["--scheduled"]), 0)
        self.assertEqual(len(calls), 1)
        for stream in ("stdin", "stdout", "stderr"):
            self.assertEqual(calls[0][stream], subprocess.DEVNULL)
        self.assertEqual(calls[0]["env"][runner.REFRESHED_ENV], "1")


if __name__ == "__main__":
    unittest.main()
