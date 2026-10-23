import copy
import unittest
from recover import APP, HOST, RELAY, candidate, owned_route, relay_route, at


def config():
    return {"apps": {"http": {"servers": {"srv0": {"routes": [
        {"match": [{"host": ["other.test"]}], "handle": [{"handler": "static_response", "status_code": 200}]},
        {"match": [{"host": [HOST]}], "handle": [{"handler": "subroute", "routes": [
            {"handle": [{"handler": "reverse_proxy", "upstreams": [{"dial": APP}]}]}]}], "terminal": True},
    ]}}}}}


class RoutingTests(unittest.TestCase):
    def test_only_inserts_public_relay_before_existing_app_routes(self):
        before = config()
        original = copy.deepcopy(before)
        after, path = candidate(before)
        self.assertEqual(before, original)
        self.assertEqual(at(after, path)[0], relay_route())
        at(after, path).pop(0)
        self.assertEqual(after, before)

    def test_does_not_allow_private_or_auth_paths_into_relay(self):
        self.assertEqual(relay_route()["match"], [{"path": ["/storage/v1/object/public/*"]}])
        self.assertEqual(relay_route()["handle"][0]["upstreams"], [{"dial": RELAY}])

    def test_rejects_already_configured_storage(self):
        current = config()
        routes = owned_route(current)[0]["handle"][0]["routes"]
        routes.insert(0, relay_route())
        with self.assertRaises(AssertionError):
            candidate(current)

    def test_rejects_shared_host(self):
        current = config()
        owned_route(current)[0]["match"][0]["host"].append("other.test")
        with self.assertRaises(AssertionError):
            candidate(current)

    def test_rejects_ambiguous_host(self):
        current = config()
        current["apps"]["http"]["servers"]["srv0"]["routes"].append(copy.deepcopy(owned_route(current)[0]))
        with self.assertRaises(AssertionError):
            candidate(current)

    def test_rejects_origin_drift(self):
        current = config()
        owned_route(current)[0]["handle"][0]["routes"][0]["handle"][0]["upstreams"][0]["dial"] = "old.test:3010"
        with self.assertRaises(AssertionError):
            candidate(current)


if __name__ == "__main__":
    unittest.main()
