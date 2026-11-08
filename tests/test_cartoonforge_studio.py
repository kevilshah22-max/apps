import importlib.util
import pathlib
import unittest
from unittest.mock import patch

MODULE_PATH = pathlib.Path(__file__).parents[1] / "cartoonforge-agent" / "studio_server.py"
SPEC = importlib.util.spec_from_file_location("cartoonforge_studio_server", MODULE_PATH)
STUDIO = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(STUDIO)


class CartoonForgeOneClickStudioTests(unittest.TestCase):
    def test_only_loopback_services_are_allowed(self):
        self.assertEqual(STUDIO.loopback_url("http://127.0.0.1:8188/", "ComfyUI"), "http://127.0.0.1:8188")
        self.assertEqual(STUDIO.loopback_url("http://localhost:11434", "Ollama"), "http://localhost:11434")
        with self.assertRaisesRegex(ValueError, "loopback"):
            STUDIO.loopback_url("https://example.com", "Ollama")
        with self.assertRaisesRegex(ValueError, "loopback"):
            STUDIO.loopback_url("http://192.168.1.20:8188", "ComfyUI")

    def test_config_requires_workflow_model_and_positive_node(self):
        with patch.object(STUDIO, "CONFIG_DIR", pathlib.Path("/tmp/cartoonforge-studio-test")), \
             patch.object(STUDIO, "CONFIG_FILE", pathlib.Path("/tmp/cartoonforge-studio-test/config.json")):
            with self.assertRaisesRegex(ValueError, "API-format workflow"):
                STUDIO.save_config({"model": "test", "positive_node": "6"})
            with self.assertRaisesRegex(ValueError, "model name"):
                STUDIO.save_config({"workflow": {"1": {"inputs": {}}}, "model": "", "positive_node": "6"})
            with self.assertRaisesRegex(ValueError, "positive prompt node"):
                STUDIO.save_config({"workflow": {"1": {"inputs": {}}}, "model": "qwen2.5:7b", "positive_node": ""})

    def test_job_script_limits_are_enforced(self):
        with patch.object(STUDIO, "load_config", return_value={"workflow": {}, "positive_node": "", "model": ""}), \
             patch.object(STUDIO, "dependency_status", return_value={"ffmpeg": True, "ollama": True, "comfyui": True, "model": True, "configured": True}):
            with self.assertRaisesRegex(ValueError, "20 to 50,000"):
                STUDIO.make_job({"script": "too short"})

    def test_local_ui_is_served_from_repository_site(self):
        self.assertTrue(STUDIO.SITE.name == "studio.html")
        self.assertTrue(STUDIO.SITE.exists())


if __name__ == "__main__":
    unittest.main()
