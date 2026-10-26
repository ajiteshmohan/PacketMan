import unittest
import numpy as np
import pandas as pd
from classifier import add_features, rule_based, train, predict
from simulate import generate_training


class TestClassifier(unittest.TestCase):
    def setUp(self):
        # Create realistic dataset using simulate with mixed impairments
        self.df = generate_training(n_rows=600, scenarios=["mixed"], seed=42)

    def test_add_features(self):
        d = add_features(self.df)
        for col in ("rtt_ms", "rtt_ratio", "d_cwnd_ratio", "d_rtt_ratio", "d_tp_ratio"):
            self.assertIn(col, d.columns)

    def test_rule_based_diagnosis(self):
        d = rule_based(self.df)
        self.assertIn("error_detected", d.columns)
        self.assertIn("symptom", d.columns)
        self.assertIn("likely_cause", d.columns)
        self.assertIn("evidence", d.columns)
        self.assertIn("recommended_action", d.columns)
        self.assertIn("tcp_response", d.columns)
        valid_causes = {"normal", "wireless_loss", "congestion", "link_interruption"}
        self.assertTrue(set(d["likely_cause"].unique()).issubset(valid_causes))

    def test_train_and_predict(self):
        bundle, metrics = train(self.df, n_estimators=10, max_depth=5, folds=3)
        self.assertIn("model", bundle)
        self.assertIn("cv_accuracy", metrics)
        self.assertGreater(metrics["cv_accuracy"], 0.7)

        classified = predict(bundle, self.df)
        self.assertIn("rf_cause", classified.columns)
        self.assertIn("rf_confidence", classified.columns)
        self.assertIn("prediction_source", classified.columns)
        self.assertIn("models_agree", classified.columns)


if __name__ == "__main__":
    unittest.main()
