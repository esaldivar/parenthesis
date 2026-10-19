import unittest
from scripts.claude_queue_select import eligible

def issue(number, priority="P1 - High", status="Ready for Development", milestone="M2 — Onboarding", project=1, labels=None):
    return {"number":number,"title":f"Issue {number}","url":f"https://example.com/{number}",
            "state":"OPEN","milestone":{"title":milestone},
            "labels":{"nodes":[{"name":v} for v in (labels if labels is not None else [priority])]},
            "projectItems":{"nodes":[{"project":{"number":project},
                "fieldValues":{"nodes":[{"name":status,"field":{"name":"Status"}},{"name":priority,"field":{"name":"Priority"}}]}}]}}

class QueueSelectionTests(unittest.TestCase):
    def select(self, issues):
        return eligible(issues,"M2 — Onboarding",1)
    def test_priority_then_issue_number(self):
        self.assertEqual([x["number"] for x in self.select([issue(9),issue(4,"P0 - Critical"),issue(2,"P0 - Critical")])],[2,4,9])
    def test_wrong_milestone_or_status_excluded(self):
        self.assertEqual(self.select([issue(1,milestone="M3"),issue(2,status="Backlog")]),[])
    def test_wrong_project_excluded(self):
        self.assertEqual(self.select([issue(1,project=2)]),[])
    def test_blocked_and_ambiguous_priority_excluded(self):
        self.assertEqual(self.select([issue(1,labels=["blocked"]),issue(2,priority="Unknown")]),[])
    def test_missing_priority_excluded(self):
        self.assertEqual(self.select([issue(1,priority="")]),[])
    def test_requires_explicit_config(self):
        with self.assertRaises(ValueError):
            eligible([], "", 1)
    def test_closed_excluded(self):
        x=issue(1);x["state"]="CLOSED";self.assertEqual(self.select([x]),[])

if __name__=="__main__":
    unittest.main()
