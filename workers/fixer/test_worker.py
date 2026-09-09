import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

import worker


class WorkerRecoveryTests(unittest.TestCase):
    def test_restart_records_clear_failure_without_reexecuting(self):
        with tempfile.TemporaryDirectory() as folder:
            journal = Path(folder) / 'current.json'
            state = {'job': {'id': 'request-a', 'lease_token': 'lease-a'}}
            worker.save(journal, state)
            with patch.object(worker, 'update') as update:
                worker.deliver(json.loads(journal.read_text()), journal)
            self.assertEqual(update.call_args.args[1], 'fail')
            self.assertIn('restarted', update.call_args.args[2])
            self.assertFalse(journal.exists())

    def test_lost_ack_preserves_answer_for_idempotent_delivery(self):
        with tempfile.TemporaryDirectory() as folder:
            journal = Path(folder) / 'current.json'
            state = {'job': {'id': 'request-a', 'lease_token': 'lease-a'},
                     'action': 'complete', 'text': 'Saved priced answer'}
            worker.save(journal, state)
            with patch.object(worker, 'update', side_effect=TimeoutError):
                with self.assertRaises(TimeoutError):
                    worker.deliver(state, journal)
            self.assertEqual(json.loads(journal.read_text())['text'], 'Saved priced answer')
            with patch.object(worker, 'update') as update:
                worker.deliver(json.loads(journal.read_text()), journal)
            self.assertEqual(update.call_args.args[1:], ('complete', 'Saved priced answer'))
            self.assertFalse(journal.exists())

    def test_expired_result_is_retained_privately_not_replayed(self):
        with tempfile.TemporaryDirectory() as folder:
            journal = Path(folder) / 'current.json'
            state = {'job': {'id': 'request-a'}, 'action': 'complete', 'text': 'Answer'}
            worker.save(journal, state)
            with patch.object(worker, 'update', side_effect=worker.LeaseEnded):
                worker.deliver(state, journal)
            self.assertFalse(journal.exists())
            self.assertEqual(json.loads((Path(folder) / 'unacknowledged-request-a.json').read_text())['text'], 'Answer')

    def run_fake_engine(self, unexpected_tool=False):
        events, handlers, config_calls, conversations = [], {}, [], []
        class Channel:
            def send(self, value): events.append(value)
            def close(self): pass
        class Registry:
            def register(self, **kwargs): handlers[kwargs['name']] = kwargs['handler']
        class Agent:
            def __init__(self, **kwargs):
                config_calls.append(kwargs)
                names = list(handlers) + (['terminal'] if unexpected_tool else [])
                self.tools = [{'function': {'name': name}} for name in names]
            def run_conversation(self, message, **kwargs):
                conversations.append((message, kwargs))
                handlers['add_estimate_lines']({'estimate_id': 'wrong-estimate', 'lines': [{'line_id': 'source-1'}]})
                return {'completed': True, 'final_response': 'Proposed lines saved for review'}
        modules = {
            'hermes_cli.config': types.SimpleNamespace(load_config=lambda: {'model': {'default': 'existing-model'}}),
            'hermes_cli.runtime_provider': types.SimpleNamespace(resolve_runtime_provider=lambda **_: {'provider': 'existing-provider', 'api_key': 'model-secret'}),
            'run_agent': types.SimpleNamespace(AIAgent=Agent),
            'tools.registry': types.SimpleNamespace(registry=Registry()),
        }
        job = {'id': 'request-a', 'lease_token': 'lease-a', 'estimate_id': 'estimate-a',
               'message': 'Price this', 'history': [{'role': 'user', 'content': 'Earlier scope'}],
               'estimate': {'title': 'My estimate'},
               'tools': [{'name': name} for name in ('find_comparable_estimates', 'find_line_pricing', 'add_estimate_lines')]}
        with patch.dict(os.environ, {'HERMES_SOURCE': '/mock/hermes'}), patch.dict('sys.modules', modules), patch.object(worker, 'post', return_value={'proposed': 1}) as post:
            worker.run_hermes(job, Channel())
        return events, config_calls, conversations, post

    def test_hermes_uses_existing_provider_and_request_bound_tools(self):
        events, calls, conversations, post = self.run_fake_engine()
        self.assertEqual(calls[0]['model'], 'existing-model')
        self.assertEqual(calls[0]['provider'], 'existing-provider')
        self.assertTrue(calls[0]['skip_memory'])
        self.assertTrue(calls[0]['skip_context_files'])
        self.assertEqual(post.call_args.args[1]['params']['estimate_id'], 'estimate-a')
        self.assertEqual(post.call_args.args[2], 'fixer.request-a.lease-a')
        self.assertNotIn('lease-a', json.dumps(conversations))
        self.assertNotIn('model-secret', json.dumps(conversations))
        self.assertEqual(events[-1]['action'], 'complete')

    def test_unexpected_runtime_tool_fails_closed(self):
        events, _, conversations, post = self.run_fake_engine(unexpected_tool=True)
        self.assertEqual(events[-1]['action'], 'fail')
        self.assertEqual(conversations, [])
        post.assert_not_called()


if __name__ == '__main__':
    unittest.main()
