import importlib.util
import pathlib
import unittest
from unittest.mock import patch

MODULE_PATH = pathlib.Path(__file__).parents[1] / "cartoonforge-agent" / "studio_server.py"
SPEC = importlib.util.spec_from_file_location("cartoonforge_studio_server", MODULE_PATH)
STUDIO = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(STUDIO)


class CartoonForgeCloudStudioTests(unittest.TestCase):
    def test_only_loopback_services_are_allowed_for_legacy_local_mode(self):
        self.assertEqual(STUDIO.loopback_url("http://127.0.0.1:8188/", "ComfyUI"), "http://127.0.0.1:8188")
        with self.assertRaisesRegex(ValueError, "loopback"):
            STUDIO.loopback_url("https://example.com", "Ollama")

    def test_cloud_config_needs_no_gpu_or_api_token(self):
        with patch.object(STUDIO, "CONFIG_DIR", pathlib.Path("/tmp/cartoonforge-cloud-test")), \
             patch.object(STUDIO, "CONFIG_FILE", pathlib.Path("/tmp/cartoonforge-cloud-test/config.json")):
            STUDIO.save_config({"provider": "huggingface_ltx", "hf_token": ""})
            self.assertEqual(STUDIO.load_config()["provider"], "huggingface_ltx")

    def test_cloud_status_only_requires_ffmpeg_for_assembly(self):
        with patch.object(STUDIO.shutil, "which", return_value="/usr/bin/ffmpeg"):
            status = STUDIO.dependency_status({"provider": "huggingface_ltx"})
        self.assertTrue(status["ffmpeg"])
        self.assertTrue(status["cloud"])
        self.assertTrue(status["configured"])
        self.assertNotIn("ollama", status)
        self.assertNotIn("comfyui", status)

    def test_script_is_split_into_ordered_beats(self):
        beats = STUDIO.split_script("Pip wakes up. He sees a star.\\n\\nHe follows it into the forest.", 3)
        self.assertEqual(beats, ["Pip wakes up.", "He sees a star.", "He follows it into the forest."])

    def test_script_can_be_grouped_to_scene_limit(self):
        beats = STUDIO.split_script("One. Two. Three. Four. Five. Six.", 2)
        self.assertEqual(len(beats), 2)
        self.assertIn("One.", beats[0])
        self.assertIn("Six.", beats[-1])

    def test_job_script_limits_are_enforced(self):
        with patch.object(STUDIO, "load_config", return_value={"provider": "huggingface_ltx"}), \
             patch.object(STUDIO, "dependency_status", return_value={"ffmpeg": True, "cloud": True, "configured": True}):
            with self.assertRaisesRegex(ValueError, "20 to 50,000"):
                STUDIO.make_job({"script": "too short", "character": {}})

    def test_local_ui_is_served_from_repository_site(self):
        self.assertEqual(STUDIO.SITE.name, "studio.html")
        self.assertTrue(STUDIO.SITE.exists())


if __name__ == "__main__":
    unittest.main()
