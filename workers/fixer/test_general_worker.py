"""Run with python -m unittest workers/fixer/test_general_worker.py."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import types
import sys
import json
from contextlib import contextmanager
from unittest.mock import patch

PATH = Path(__file__).with_name("general_worker.py")

class GeneralWorkerTests(unittest.TestCase):
    def load(self):
        self.assertTrue(PATH.exists(), "Isolated employee research worker must exist")
        spec = importlib.util.spec_from_file_location("general_worker", PATH)
        worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(worker)
        return worker

    def test_lease_bound_tool_never_uses_broad_agent(self):
        worker = self.load()
        calls = []
        job = {"id": "request", "lease_token": "lease"}
        with patch.object(worker, "post", side_effect=lambda path, body, token: calls.append((path, body, token)) or {"data": []}):
            handler = worker.make_handler(job, "list_jobs", lambda event: None)
            handler({"search": "test"})
        self.assertEqual(calls, [("/api/hermes/privacy-tools", {"tool": "list_jobs", "params": {"search": "test"}}, "privacy.request.lease")])


    def test_agent_disables_context_memory_and_shared_history(self):
        worker = self.load()
        options, calls, events, raw_options, suppression = {}, [], [], {}, []
        tools = [{"name": n, "parameters": {"type": "object"}} for n in sorted(worker.ALLOWED)]
        @contextmanager
        def suppress_plugins():
            suppression.append(True)
            try:
                yield
            finally:
                suppression.pop()
        class Agent:
            def __init__(self, **kwargs):
                options.update(kwargs)
                self.tools = [{"function": t} for t in tools]
            def run_conversation(self, message, **kwargs):
                assert suppression
                assert self.valid_tool_names == worker.ALLOWED
                calls.append((message, kwargs))
                return {"completed": True, "final_response": "Fixture answer"}
        def raw_tools(**kwargs):
            raw_options.update(kwargs)
            return [{"type":"function", "function":{**t,"parameters":{"required":[],**t["parameters"]}}} for t in tools]
        modules = {
            "hermes_cli.config": types.SimpleNamespace(load_config=lambda: {"model": {"default": "test-model"}}),
            "hermes_cli.runtime_provider": types.SimpleNamespace(resolve_runtime_provider=lambda **kwargs: {"provider": "test"}),
            "hermes_cli.plugins_discovery": types.SimpleNamespace(suppress_plugin_discovery=suppress_plugins),
            "run_agent": types.SimpleNamespace(AIAgent=Agent),
            "model_tools": types.SimpleNamespace(get_tool_definitions=raw_tools),
            "tools.registry": types.SimpleNamespace(registry=types.SimpleNamespace(register=lambda **kwargs: None)),
        }
        channel = types.SimpleNamespace(send=events.append, close=lambda: None)
        with patch.dict(sys.modules, modules), patch.dict("os.environ", {"HERMES_SOURCE": "."}):
            worker.run_hermes({"id": "request", "lease_token": "lease", "message": "What is scheduled?", "scope": {"category": "operational"}, "tools": tools}, channel)
        self.assertTrue(options["skip_context_files"])
        self.assertTrue(options["skip_memory"])
        self.assertTrue(options["skip_background_review"])
        self.assertTrue(raw_options["skip_tool_search_assembly"])
        self.assertEqual(options["enabled_toolsets"], ["buildos_employee"])
        self.assertEqual(calls[0][1]["conversation_history"], [])
        self.assertEqual(events[-1], {"action": "complete", "text": "Fixture answer"})


    def test_journal_replays_persisted_result_without_research(self):
        worker = self.load()
        with tempfile.TemporaryDirectory() as folder:
            journal = Path(folder) / "current.json"
            state = {"job": {"id": "request", "lease_token": "lease"}, "action": "complete", "text": "Saved answer"}
            worker.save(journal, state)
            with patch.object(worker, "update", return_value={"saved": True}) as update:
                worker.deliver(json.loads(journal.read_text()), journal)
            self.assertFalse(journal.exists())
            update.assert_called_once_with(state["job"], "complete", "Saved answer")

    def test_restart_without_result_fails_instead_of_reexecuting(self):
        worker = self.load()
        with tempfile.TemporaryDirectory() as folder:
            journal = Path(folder) / "current.json"
            state = {"job": {"id": "request", "lease_token": "lease"}}
            worker.save(journal, state)
            with patch.object(worker, "update", return_value={"saved": True}) as update:
                worker.deliver(state, journal)
            self.assertEqual(update.call_args.args[1], "fail")


    def test_supervisor_saves_final_event_and_stops_child(self):
        worker = self.load()
        event = {"action": "complete", "text": "Final answer"}
        parent = types.SimpleNamespace(poll=lambda timeout: True, recv=lambda: event, close=lambda: None)
        child = types.SimpleNamespace(close=lambda: None)
        proc = types.SimpleNamespace(start=lambda: None, is_alive=lambda: False, join=lambda **kwargs: None)
        ctx = types.SimpleNamespace(Process=lambda **kwargs: proc)
        with tempfile.TemporaryDirectory() as folder, patch.object(worker.multiprocessing, "Pipe", return_value=(parent, child)), patch.object(worker.multiprocessing, "get_context", return_value=ctx):
            journal = Path(folder) / "current.json"
            result = worker.execute({"id": "request", "lease_token": "lease"}, journal)
            self.assertEqual(result["text"], "Final answer")
            self.assertEqual(json.loads(journal.read_text())["action"], "complete")

    def test_once_entrypoint_claims_dedicated_queue(self):
        worker = self.load()
        with tempfile.TemporaryDirectory() as folder, patch.dict("os.environ", {"FIXER_PRIVACY_WORKER_KEY": "k" * 32, "FIXER_PRIVACY_STATE_DIR": folder}), patch.object(worker, "post", return_value={"job": None}) as post:
            worker.main(once=True)
        post.assert_called_once_with("/api/hermes/privacy-worker", {"action": "claim"}, "k" * 32)


    def test_private_topic_remains_unsupported_after_owner_approval(self):
        worker = self.load()
        events=[]
        channel=types.SimpleNamespace(send=events.append, close=lambda: None)
        with patch.dict("os.environ", {"HERMES_SOURCE": "."}):
            worker.run_hermes({"scope":{"category":"blocked"}}, channel)
        self.assertEqual(events[-1]["action"], "complete")
        self.assertIn("not available", events[-1]["text"])
        self.assertIn("approval does not", events[-1]["text"])

if __name__ == "__main__":
    unittest.main()
