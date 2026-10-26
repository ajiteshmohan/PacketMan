import socket
import threading
import time
import unittest
from pathlib import Path
import tempfile
import server
import client
import framing as fr


class TestServerClient(unittest.TestCase):
    def test_loopback_session(self):
        with tempfile.TemporaryDirectory() as tmp:
            stop_server = threading.Event()
            ready_server = threading.Event()

            # Start server in thread
            server_thread = threading.Thread(
                target=server.serve,
                args=("127.0.0.1", 0, tmp, 0.2, stop_server, ready_server),
                daemon=True
            )
            server_thread.start()
            self.assertTrue(ready_server.wait(timeout=3.0))
            port = ready_server.port

            # Connect client flow
            flow = client.Flow("127.0.0.1", port, chunk=4096, ping_interval=0.1, rate_mbps=10.0)
            flow.send(fr.pack_json(fr.START, {"scenario": "test_loopback", "run": 1, "duration": 1.0}))
            flow.start()

            # Let it transfer data for 1 second
            time.sleep(1.0)
            flow.finish()

            # Stop server
            stop_server.set()
            server_thread.join(timeout=3.0)

            # Check that client sent data
            self.assertGreater(flow.app_bytes, 0)

            # Check that server generated CSV
            server_csvs = list(Path(tmp).glob("server_test_loopback_*.csv"))
            self.assertGreater(len(server_csvs), 0)


if __name__ == "__main__":
    unittest.main()
