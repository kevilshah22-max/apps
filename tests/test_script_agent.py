import json
import unittest
from unittest.mock import patch
from io import BytesIO
from urllib.request import Request

from cartoonforge_agent_test_loader import load_agent

AGENT = load_agent()

class FakeResponse:
    def __init__(self, payload):
        self.payload = payload
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False
    def read(self):
        return json.dumps(self.payload).encode("utf-8")

class ScriptAgentTests(unittest.TestCase):
    def setUp(self):
        self.script = "Pip finds a glowing seed. The forest is dying. Pip plants the seed and the forest blooms."
        self.character = {"name": "Pip", "species": "fox", "color": "#ff9d55",
                          "outfit": "blue scarf", "markings": "white tail tip"}
        self.model_output = {"scenes": [
            {"title": "The discovery", "visual": "Pip finds a glowing seed beneath an old tree.",
             "beat": "Pip discovers the seed.", "dialogue": "", "narration": "",
             "duration": 5, "shot": "Wide establishing shot"},
            {"title": "The forest blooms", "visual": "The seed glows as flowers spread through the forest.",
             "beat": "Pip plants the seed and the forest recovers.", "dialogue": "",
             "narration": "A small act brings the forest back to life.", "duration": 7, "shot": "Slow crane up"}
        ]}

    @patch("urllib.request.urlopen")
    def test_generates_valid_project_json_using_local_ollama(self, mock_urlopen):
        mock_urlopen.return_value = FakeResponse({"message": {"content": json.dumps(self.model_output)}})
        project = AGENT.generate_storyboard(self.script, self.character, "local-model", title="The Seed")
        self.assertEqual(project["title"], "The Seed")
        self.assertEqual(project["character"]["name"], "Pip")
        self.assertEqual(len(project["scenes"]), 2)
        self.assertEqual(project["scenes"][0]["number"], 1)
        self.assertEqual(project["generation"]["provider"], "local Ollama")
        request = mock_urlopen.call_args.args[0]
        self.assertIsInstance(request, Request)
        payload = json.loads(request.data)
        self.assertEqual(payload["model"], "local-model")
        self.assertFalse(payload["stream"])
        self.assertEqual(payload["format"]["type"], "object")
        self.assertIn("Pip finds a glowing seed", payload["messages"][1]["content"])

    def test_rejects_bad_script_and_character_bible(self):
        with self.assertRaisesRegex(ValueError, "at least 20"):
            AGENT.generate_storyboard("too short", self.character, "model")
        with self.assertRaisesRegex(ValueError, "species"):
            AGENT.generate_storyboard(self.script, {"name": "Pip", "color": "red"}, "model")

    def test_rejects_invalid_scene_count_duration_and_missing_visual(self):
        with self.assertRaisesRegex(ValueError, "expected 1 to 1"):
            AGENT.validate_scenes(self.model_output, 1)
        invalid = {"scenes": [{**self.model_output["scenes"][0], "duration": 0}]}
        with self.assertRaisesRegex(ValueError, "duration"):
            AGENT.validate_scenes(invalid, 12)
        invalid = {"scenes": [{**self.model_output["scenes"][0], "visual": ""}]}
        with self.assertRaisesRegex(ValueError, "visual"):
            AGENT.validate_scenes(invalid, 12)

    @patch("urllib.request.urlopen")
    def test_rejects_invalid_model_json(self, mock_urlopen):
        mock_urlopen.return_value = FakeResponse({"message": {"content": "not-json"}})
        with self.assertRaisesRegex(ValueError, "valid JSON"):
            AGENT.generate_storyboard(self.script, self.character, "local-model")

if __name__ == "__main__":
    unittest.main()
