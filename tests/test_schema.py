import os
import tempfile
import unittest
import pandas as pd
from schema import COLUMNS, CA_STATES, init_sqlite_db, save_rows_to_sqlite, load_from_sqlite


class TestSchema(unittest.TestCase):
    def test_columns_structure(self):
        self.assertIn("t_s", COLUMNS)
        self.assertIn("throughput_kbps", COLUMNS)
        self.assertIn("loss_est_pct", COLUMNS)
        self.assertIn("app_rtt_ms", COLUMNS)
        self.assertIn("krtt_ms", COLUMNS)
        self.assertEqual(len(COLUMNS), 19)

    def test_ca_states_mapping(self):
        self.assertEqual(CA_STATES[0], "Open")
        self.assertEqual(CA_STATES[3], "Recovery")
        self.assertEqual(CA_STATES[4], "Loss")

    def test_sqlite_storage(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "test.db")
            init_sqlite_db(db_path)
            rows = [
                {
                    "t_s": 0.5,
                    "scenario": "baseline",
                    "run": 1,
                    "impairment": "none",
                    "loss_target_pct": 0.0,
                    "throughput_kbps": 10000.0,
                    "goodput_kbps": 9800.0,
                    "delivery_kbps": 10200.0,
                    "app_rtt_ms": 20.5,
                    "krtt_ms": 20.0,
                    "cwnd": 15,
                    "ssthresh": 30,
                    "ca_state": 0,
                    "rto_ms": 200.0,
                    "rto_backoff": 0,
                    "retrans_delta": 0,
                    "total_retrans": 0,
                    "loss_est_pct": 0.0,
                    "rssi_dbm": -60.0
                }
            ]
            save_rows_to_sqlite(db_path, rows, source_file="client_test.csv")
            df = load_from_sqlite(db_path, scenario="baseline")
            self.assertEqual(len(df), 1)
            self.assertEqual(df["scenario"].iloc[0], "baseline")
            self.assertAlmostEqual(df["throughput_kbps"].iloc[0], 10000.0)


if __name__ == "__main__":
    unittest.main()
