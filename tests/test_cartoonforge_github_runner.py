import importlib.util
import pathlib
import unittest

MODULE_PATH = pathlib.Path(__file__).parents[1] / "cartoonforge-agent" / "github_runner.py"
SPEC = importlib.util.spec_from_file_location("cartoonforge_github_runner", MODULE_PATH)
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


class CartoonForgeGitHubRunnerTests(unittest.TestCase):
    def test_prompt_includes_character_and_scene(self):
        prompt = RUNNER.scene_prompt(
            "2D cartoon",
            {"name": "Pip", "species": "fox", "color": "orange", "outfit": "blue scarf"},
            "Pip enters the forest.",
        )
        self.assertIn("Pip", prompt)
        self.assertIn("fox", prompt)
        self.assertIn("Pip enters the forest.", prompt)
        self.assertIn("blue scarf", prompt)

    def test_script_split_is_ordered_and_respects_scene_limit(self):
        beats = RUNNER.split_script(
            "Pip wakes up. He sees a star.\n\nHe follows it home.", 2
        )
        self.assertEqual(len(beats), 2)
        self.assertIn("Pip wakes up.", beats[0])
        self.assertIn("He follows it home.", beats[-1])


if __name__ == "__main__":
    unittest.main()
