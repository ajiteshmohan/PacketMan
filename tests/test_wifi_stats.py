import unittest
from wifi_stats import RssiReader


class TestWifiStats(unittest.TestCase):
    def test_rssi_reader_interval(self):
        reader = RssiReader(min_interval=5.0)
        # First read probes and sets time
        val1 = reader.read()
        # Second immediate read should return cached value without probing
        val2 = reader.read()
        self.assertEqual(val1, val2)


if __name__ == "__main__":
    unittest.main()
