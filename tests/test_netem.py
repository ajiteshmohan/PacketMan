import unittest
from scenarios import Phase
import netem


class TestNetem(unittest.TestCase):
    def test_build_args_loss(self):
        p = Phase("random_loss", loss=5.0)
        args = netem.build_args("wlan0", p)
        self.assertEqual(args[:7], ["tc", "qdisc", "replace", "dev", "wlan0", "root", "netem"])
        self.assertIn("loss", args)
        self.assertIn("5%", args)

    def test_build_args_congestion(self):
        p = Phase("congestion", delay_ms=20, jitter_ms=5, rate_mbit=3.0, limit_pkts=30)
        args = netem.build_args("eth0", p)
        self.assertIn("delay", args)
        self.assertIn("20ms", args)
        self.assertIn("5ms", args)
        self.assertIn("rate", args)
        self.assertIn("3mbit", args)
        self.assertIn("limit", args)
        self.assertIn("30", args)

    def test_build_args_blackout(self):
        p = Phase("blackout")
        args = netem.build_args("wlan0", p)
        self.assertIn("loss", args)
        self.assertIn("100%", args)

    def test_mock_apply_and_clear(self):
        executed = []

        def mock_runner(cmd, check=True, capture_output=True):
            executed.append(cmd)

        p = Phase("random_loss", loss=1.0)
        netem.apply("test_dev", p, runner=mock_runner)
        self.assertEqual(len(executed), 1)
        self.assertIn("test_dev", executed[0])

        netem.clear("test_dev", runner=mock_runner)
        self.assertEqual(len(executed), 2)
        self.assertIn("del", executed[1])


if __name__ == "__main__":
    unittest.main()
