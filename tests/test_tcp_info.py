import struct
import unittest
import tcp_info


class TestTcpInfo(unittest.TestCase):
    def test_parse_tcp_info_valid(self):
        # Construct a synthetic 256-byte buffer matching struct tcp_info layout
        buf = bytearray(256)
        # ca_state at offset 1 (B)
        struct.pack_into("B", buf, 1, 3)  # Recovery
        # rtt at offset 68 (I)
        struct.pack_into("=I", buf, 68, 25000)  # 25 ms
        # snd_cwnd at offset 80 (I)
        struct.pack_into("=I", buf, 80, 42)
        # total_retrans at offset 100 (I)
        struct.pack_into("=I", buf, 100, 7)

        parsed = tcp_info.parse_tcp_info(bytes(buf))
        self.assertEqual(parsed.get("ca_state"), 3)
        self.assertEqual(parsed.get("rtt"), 25000)
        self.assertEqual(parsed.get("snd_cwnd"), 42)
        self.assertEqual(parsed.get("total_retrans"), 7)

    def test_parse_tcp_info_short(self):
        # Buffer shorter than offsets should omit missing fields
        parsed = tcp_info.parse_tcp_info(b"\x00" * 10)
        self.assertIn("ca_state", parsed)
        self.assertNotIn("rtt", parsed)


if __name__ == "__main__":
    unittest.main()
