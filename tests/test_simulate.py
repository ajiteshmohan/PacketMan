import unittest
import numpy as np
from simulate import simulate_run, generate_training
from schema import COLUMNS


class TestSimulate(unittest.TestCase):
    def test_simulate_baseline(self):
        df = simulate_run("baseline", duration=10.0, seed=42)
        self.assertEqual(list(df.columns), COLUMNS)
        self.assertGreater(len(df), 0)
        self.assertAlmostEqual(df["loss_target_pct"].iloc[0], 0.0)
        self.assertEqual(df["retrans_delta"].sum(), 0)

    def test_simulate_loss(self):
        df = simulate_run("loss10", duration=10.0, seed=42)
        self.assertEqual(list(df.columns), COLUMNS)
        self.assertGreater(df["retrans_delta"].sum(), 0)

    def test_reproducible_seed(self):
        df1 = simulate_run("dynamic", duration=20.0, seed=123)
        df2 = simulate_run("dynamic", duration=20.0, seed=123)
        self.assertTrue(df1.equals(df2))

    def test_generate_training(self):
        df = generate_training(n_rows=50, seed=1)
        self.assertEqual(len(df), 50)
        self.assertIn("source", df.columns)


if __name__ == "__main__":
    unittest.main()
