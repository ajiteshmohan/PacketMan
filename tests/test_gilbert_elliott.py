import unittest
import numpy as np
import pandas as pd
from scenarios import SCENARIOS, Phase, phase_schedule
import netem
import simulate
from schema import COLUMNS


class TestGilbertElliott(unittest.TestCase):
    def test_gilbert_elliott_scenario_registered(self):
        self.assertIn("gilbert_elliott", SCENARIOS)
        phases = SCENARIOS["gilbert_elliott"]
        self.assertEqual(len(phases), 3)
        self.assertEqual(phases[0].kind, "none")
        self.assertEqual(phases[1].kind, "markov_loss")
        self.assertGreater(phases[1].gemodel_p, 0.0)
        self.assertGreater(phases[1].gemodel_r, 0.0)
        self.assertGreater(phases[1].loss_bad, 0.0)

    def test_netem_gemodel_args(self):
        p = Phase("markov_loss", loss=1.0, gemodel_p=0.10, gemodel_r=0.40, loss_bad=35.0)
        args = netem.build_args("wlan0", p)
        expected = ["tc", "qdisc", "replace", "dev", "wlan0", "root", "netem",
                    "loss", "gemodel", "10%", "40%", "1%", "35%"]
        self.assertEqual(args, expected)

    def test_simulate_gilbert_elliott_run(self):
        df = simulate.simulate_run("gilbert_elliott", duration=10.0, seed=42)
        self.assertIsInstance(df, pd.DataFrame)
        self.assertGreater(len(df), 0)
        for col in COLUMNS:
            self.assertIn(col, df.columns)
        # Check that throughput is positive and some retransmissions occurred during burst loss
        self.assertTrue((df["throughput_kbps"] > 0).any())
        self.assertTrue((df["impairment"] == "markov_loss").any())

    def test_markov_schedule_timing(self):
        sched = phase_schedule("gilbert_elliott", 60.0)
        self.assertEqual(len(sched), 3)
        self.assertAlmostEqual(sched[0][0], 0.0)
        self.assertAlmostEqual(sched[-1][1], 60.0)


if __name__ == "__main__":
    unittest.main()
