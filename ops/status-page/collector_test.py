import importlib.util
import json
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('collector', pathlib.Path(__file__).with_name('collector.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class CollectorTests(unittest.TestCase):
    def test_queries_are_read_only_and_never_claim_jobs(self):
        sql = collector.SQL.lower()
        self.assertIn('begin read only', sql)
        self.assertIn("status='queued'", sql)
        self.assertTrue(sql.rstrip().endswith('rollback;'))
        for forbidden in ['claim_', 'insert ', 'update ', 'delete ', 'create ', 'alter ']:
            self.assertNotIn(forbidden, sql)

    def test_storage_requires_both_api_and_minio(self):
        for status, expected in [('200', 'up'), ('503', 'down')]:
            with patch.object(collector, 'command', side_effect=['[true]', json.dumps({'exitcode': 0, 'out-data': status})]):
                self.assertEqual(collector.storage_check()['status'], expected)

    def test_storage_unobservable_is_not_marked_up(self):
        with patch.object(collector, 'command', side_effect=TimeoutError):
            self.assertEqual(collector.storage_check()['status'], 'unknown')

    def worker(self, component, queues, state='running', enabled=True):
        env = ['MARISON_SYNC_ENABLED=true', 'MARISON_SUBMISSION_DISPATCH_ENABLED=' + str(enabled).lower()]
        inspected = [{'State': {'Status': state}, 'Config': {'Env': env}}]
        with patch.object(collector, 'command', side_effect=[json.dumps(inspected),
            'UID PID PPID C STIME TTY TIME CMD\nroot 1 0 0 08:00 ? 00:00:01 node worker.mjs']):
            return collector.worker_check(component, collector.CONTAINERS[component], queues)

    def test_workers_require_process_and_queue_observability(self):
        queues = {'pdf_stalled': False, 'outbound_enabled': True, 'outbound_stalled': False,
                  'sync_success': True, 'sync_running': False}
        for component in ['sigap_pdf', 'sigap_sync', 'sigap_outbound']:
            self.assertEqual(self.worker(component, queues)['status'], 'up')
            self.assertEqual(self.worker(component, None)['status'], 'unknown')
            self.assertEqual(self.worker(component, queues, state='exited')['status'], 'down')
        self.assertEqual(self.worker('sigap_pdf', {**queues, 'pdf_stalled': True})['status'], 'down')
        self.assertEqual(self.worker('sigap_outbound', queues, enabled=False)['status'], 'unknown')


if __name__ == '__main__':
    unittest.main()
