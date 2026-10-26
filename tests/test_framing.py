import socket
import threading
import unittest
import framing as fr


class TestFraming(unittest.TestCase):
    def test_pack_valid(self):
        packed = fr.pack(fr.START, b'{"scenario": "baseline"}')
        self.assertEqual(packed[0:1], fr.START)
        self.assertGreater(len(packed), 5)

    def test_pack_invalid_type(self):
        with self.assertRaises(ValueError):
            fr.pack(b"X", b"payload")

    def test_pack_payload_too_large(self):
        with self.assertRaises(ValueError):
            fr.pack(fr.DATA, b"0" * (fr.MAX_PAYLOAD + 1))

    def test_pack_json(self):
        packed = fr.pack_json(fr.REPORT, {"goodput_kbps": 5000})
        self.assertEqual(packed[0:1], fr.REPORT)

    def test_frame_reader_loopback(self):
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.bind(("127.0.0.1", 0))
        srv.listen(1)
        port = srv.getsockname()[1]

        def client_send():
            cli = socket.create_connection(("127.0.0.1", port))
            # Send in small chunks to test incremental parsing
            data = fr.pack(fr.DATA, b"hello network lab")
            for i in range(len(data)):
                cli.sendall(data[i:i+1])
            cli.close()

        t = threading.Thread(target=client_send)
        t.start()
        conn, _ = srv.accept()
        reader = fr.FrameReader(conn)
        ftype, payload = reader.read(timeout=2.0)
        self.assertEqual(ftype, fr.DATA)
        self.assertEqual(payload, b"hello network lab")
        conn.close()
        srv.close()
        t.join()

    def test_frame_reader_eof(self):
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.bind(("127.0.0.1", 0))
        srv.listen(1)
        port = srv.getsockname()[1]

        def client_close():
            cli = socket.create_connection(("127.0.0.1", port))
            cli.close()

        t = threading.Thread(target=client_close)
        t.start()
        conn, _ = srv.accept()
        reader = fr.FrameReader(conn)
        with self.assertRaises(ConnectionError):
            reader.read(timeout=2.0)
        conn.close()
        srv.close()
        t.join()


if __name__ == "__main__":
    unittest.main()
