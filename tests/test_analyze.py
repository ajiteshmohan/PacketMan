import os
import tempfile
import unittest
import pandas as pd
from simulate import simulate_run
import analyze


class TestAnalyze(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = self.tmp.name
        # Create a small dataset across a few scenarios
        frames = []
        for s in ("baseline", "loss1", "loss5", "dynamic"):
            df = simulate_run(s, duration=4.0, seed=1)
            path = os.path.join(self.out, f"client_{s}_run1_sim.csv")
            df.to_csv(path, index=False)
            df["source"] = f"client_{s}_run1_sim.csv"
            frames.append(df)
        self.combined = pd.concat(frames, ignore_index=True)

    def tearDown(self):
        self.tmp.cleanup()

    def test_summary_table(self):
        s = analyze.summary_table(self.combined)
        self.assertIn("mean_throughput_kbps", s.columns)
        self.assertIn("baseline", s.index)
        self.assertIn("loss1", s.index)
        for col in ("jitter_ms", "rtt_p50_ms", "rtt_p90_ms", "rtt_p99_ms", "goodput_efficiency_pct"):
            self.assertIn(col, s.columns)
        self.assertTrue((s["goodput_efficiency_pct"] <= 100.0).all())

    def test_plot_generation(self):
        fig_dir = os.path.join(self.out, "figures")
        os.makedirs(fig_dir, exist_ok=True)

        analyze.grid_plot(
            self.combined,
            [("throughput_kbps", "tp", {})],
            "kbps", "Test TP",
            os.path.join(fig_dir, "test_tp.png")
        )
        self.assertTrue(os.path.exists(os.path.join(fig_dir, "test_tp.png")))

        analyze.dynamic_timeline(self.combined, os.path.join(fig_dir, "test_dyn.png"))
        self.assertTrue(os.path.exists(os.path.join(fig_dir, "test_dyn.png")))

        analyze.throughput_vs_loss(self.combined, os.path.join(fig_dir, "test_mathis.png"))
        self.assertTrue(os.path.exists(os.path.join(fig_dir, "test_mathis.png")))

        analyze.loss_vs_retransmissions(self.combined, os.path.join(fig_dir, "test_loss_retx.png"))
        self.assertTrue(os.path.exists(os.path.join(fig_dir, "test_loss_retx.png")))

        analyze.loss_vs_rtt(self.combined, os.path.join(fig_dir, "test_loss_rtt.png"))
        self.assertTrue(os.path.exists(os.path.join(fig_dir, "test_loss_rtt.png")))


if __name__ == "__main__":
    unittest.main()
