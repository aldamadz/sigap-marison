import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("recover", Path(__file__).with_name("recover.py"))
recover = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recover)


def config():
    return {"apps": {"http": {"servers": {"srv0": {"routes": [
        {"match": [{"host": ["other.example"]}], "handle": [{"handler": "reverse_proxy", "upstreams": [{"dial": recover.OLD}]}]},
        {"match": [{"host": [recover.HOST]}], "handle": [{"handler": "subroute", "routes": [{"handle": [{"handler": "reverse_proxy", "upstreams": [{"dial": recover.OLD}]}]}]}]},
    ]}}}}}


class RecoveryTests(unittest.TestCase):
    def test_only_owned_host_dial_is_changed(self):
        before = config()
        result, path = recover.candidate(before)
        self.assertEqual(before["apps"]["http"]["servers"]["srv0"]["routes"][0], result["apps"]["http"]["servers"]["srv0"]["routes"][0])
        self.assertEqual(recover.sigap_dial_paths(before)[0][1], recover.OLD)
        self.assertEqual(recover.sigap_dial_paths(result)[0][1], recover.NEW)
        parent = result
        for part in path[:-1]:
            parent = parent[part]
        parent[path[-1]] = recover.OLD
        self.assertEqual(before, result)

    def test_unknown_or_already_changed_origin_is_not_overwritten(self):
        before = config()
        updated, _ = recover.candidate(before)
        with self.assertRaises(AssertionError):
            recover.candidate(updated)

    def test_shared_host_matcher_is_rejected(self):
        before = config()
        before["apps"]["http"]["servers"]["srv0"]["routes"][1]["match"][0]["host"].append("foreign.example")
        with self.assertRaises(AssertionError):
            recover.candidate(before)

    def test_source_parser_preserves_special_sigap_relays(self):
        text = 'other.example {\n reverse_proxy old:80\n}\nsigap.marisoncloud.com {\n handle /storage/* {\n reverse_proxy 192.168.0.251:3082\n }\n handle {\n reverse_proxy 192.168.0.251:3010 {\n header_up Host {host}\n }\n }\n}\n'
        self.assertEqual(recover.source_sigap_targets(text), ["192.168.0.251:3082", recover.NEW])

    def test_alternative_host_or_path_only_matcher_is_rejected(self):
        for alternative in [{"host": ["foreign.example"]}, {"path": ["/*"]}]:
            with self.subTest(alternative=alternative):
                before = config()
                before["apps"]["http"]["servers"]["srv0"]["routes"][1]["match"].append(alternative)
                with self.assertRaises(AssertionError):
                    recover.candidate(before)

    def test_http_parser_supports_chunked_config_and_etag(self):
        body = b'{"apps":{}}'
        raw = b'HTTP/1.1 200 OK\r\nETag: "/config/ test"\r\nTransfer-Encoding: chunked\r\n\r\n' + f'{len(body):x}'.encode() + b'\r\n' + body + b'\r\n0\r\n\r\n'
        response = recover.http.client.HTTPResponse(recover.ResponseSocket(raw))
        response.begin()
        self.assertEqual(response.getheader("Etag"), '"/config/ test"')
        self.assertEqual(response.read(), body)


if __name__ == "__main__":
    unittest.main()
