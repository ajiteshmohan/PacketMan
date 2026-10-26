import unittest
from scenarios import SCENARIOS, phase_schedule, phase_index_at, register_custom_scenario


class TestScenarios(unittest.TestCase):
    def test_mandatory_scenarios_exist(self):
        for name in ("baseline", "loss1", "loss5", "loss10", "dynamic"):
            self.assertIn(name, SCENARIOS)

    def test_additional_scenarios_exist(self):
        for name in ("congestion", "blackout", "mixed"):
            self.assertIn(name, SCENARIOS)

    def test_phase_schedule_coverage(self):
        duration = 100.0
        sched = phase_schedule("dynamic", duration)
        self.assertAlmostEqual(sched[0][0], 0.0)
        self.assertAlmostEqual(sched[-1][1], duration)
        self.assertEqual(len(sched), 5)  # 1% -> 5% -> 10% -> 5% -> 1%

    def test_phase_index_at(self):
        duration = 100.0
        sched = phase_schedule("dynamic", duration)
        # 5 phases of 20s each
        self.assertEqual(phase_index_at(sched, 10.0), 0)
        self.assertEqual(phase_index_at(sched, 30.0), 1)
        self.assertEqual(phase_index_at(sched, 50.0), 2)
        self.assertEqual(phase_index_at(sched, 70.0), 3)
        self.assertEqual(phase_index_at(sched, 90.0), 4)

    def test_custom_scenario(self):
        register_custom_scenario("test_step", [2.0, 4.0, 8.0])
        sched = phase_schedule("test_step", 30.0)
        self.assertEqual(len(sched), 3)
        self.assertEqual(sched[0][2].loss_pct, 2.0)
        self.assertEqual(sched[1][2].loss_pct, 4.0)
        self.assertEqual(sched[2][2].loss_pct, 8.0)


if __name__ == "__main__":
    unittest.main()
