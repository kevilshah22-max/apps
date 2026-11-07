import importlib.util
import pathlib
import unittest
import tempfile

MODULE_PATH = pathlib.Path(__file__).parents[1] / "cartoonforge-agent" / "render_agent.py"
SPEC = importlib.util.spec_from_file_location("cartoonforge_render_agent", MODULE_PATH)
AGENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AGENT)


class CartoonForgeAgentTests(unittest.TestCase):
    def setUp(self):
        self.project = {
            "title": "The Moon Garden",
            "genre": "Whimsical adventure",
            "character": {"name": "Pip", "species": "fox", "color": "#ff9d55",
                          "face": "heart-shaped", "eyes": "large green eyes",
                          "hair_or_fur": "soft orange fur", "proportions": "small round body",
                          "outfit": "blue scarf", "markings": "white tail tip",
                          "accessories": "brass star pendant"},
        }

    def test_scene_prompt_preserves_character_bible(self):
        first = AGENT.build_scene_prompt(self.project, {"number": 1, "title": "Arrival", "visual": "A moonlit garden"})
        second = AGENT.build_scene_prompt(self.project, {"number": 2, "title": "Discovery", "visual": "A glowing flower"})
        for prompt in (first, second):
            self.assertIn("Pip", prompt)
            self.assertIn("fox", prompt)
            self.assertIn("#ff9d55", prompt)
            self.assertIn("widescreen 16:9", prompt)
            self.assertIn("heart-shaped", prompt)
            self.assertIn("large green eyes", prompt)
            self.assertIn("blue scarf", prompt)
            self.assertIn("white tail tip", prompt)
            self.assertIn("brass star pendant", prompt)
        self.assertNotEqual(first, second)

    def test_workflow_injection_is_copy_safe_and_sets_seed(self):
        template = {
            "4": {"class_type": "CLIPTextEncode", "inputs": {"text": "old positive"}},
            "5": {"class_type": "CLIPTextEncode", "inputs": {"text": "old negative"}},
            "6": {"class_type": "KSampler", "inputs": {"noise_seed": 123}},
        }
        result = AGENT.apply_workflow_inputs(template, "new prompt", 777, "4", "5", "6")
        self.assertEqual(result["4"]["inputs"]["text"], "new prompt")
        self.assertEqual(result["5"]["inputs"]["text"], "text, watermark, logo, malformed anatomy, extra limbs, inconsistent character")
        self.assertEqual(result["6"]["inputs"]["noise_seed"], 777)
        self.assertEqual(template["4"]["inputs"]["text"], "old positive")
        self.assertEqual(template["6"]["inputs"]["noise_seed"], 123)

    def test_reference_image_node_is_injected_without_mutating_template(self):
        template = {
            "4": {"class_type": "CLIPTextEncode", "inputs": {"text": "old"}},
            "8": {"class_type": "LoadImage", "inputs": {"image": "old-reference.png"}}
        }
        result = AGENT.apply_workflow_inputs(
            template, "new prompt", 12, "4",
            reference_image_node="8", reference_image_name="comfy-input/pip.png")
        self.assertEqual(result["8"]["inputs"]["image"], "comfy-input/pip.png")
        self.assertEqual(template["8"]["inputs"]["image"], "old-reference.png")

    def test_reference_image_node_requires_uploaded_asset_and_image_input(self):
        with self.assertRaisesRegex(ValueError, "requires an uploaded reference image"):
            AGENT.apply_workflow_inputs({"8": {"inputs": {"image": "x"}}}, "p", 1, "8",
                reference_image_node="8")
        with self.assertRaisesRegex(ValueError, "inputs.image"):
            AGENT.apply_workflow_inputs({"8": {"inputs": {"other": "x"}}}, "p", 1, "8",
                reference_image_node="8", reference_image_name="ref.png")

    def test_reference_upload_rejects_unsupported_file_type(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "reference.txt"
            path.write_text("not an image")
            with self.assertRaisesRegex(ValueError, "PNG, JPG, JPEG or WEBP"):
                AGENT.upload_reference_image("http://127.0.0.1:8188", path)

    def test_video_output_is_preferred_over_image_keyframe(self):
        history = {"outputs": {
            "1": {"images": [{"filename": "keyframe.png"}]},
            "2": {"gifs": [{"filename": "generated-shot.mp4", "type": "output"}]}
        }}
        kind, asset = AGENT.select_output_asset(history)
        self.assertEqual(kind, "video")
        self.assertEqual(asset["filename"], "generated-shot.mp4")

    def test_image_output_is_used_when_no_video_exists(self):
        history = {"outputs": {"1": {"images": [{"filename": "frame.png"}]}}}
        kind, asset = AGENT.select_output_asset(history)
        self.assertEqual(kind, "image")
        self.assertEqual(asset["filename"], "frame.png")

    def test_empty_output_is_rejected(self):
        self.assertIsNone(AGENT.select_output_asset({"outputs": {}}))

    def test_workflow_injection_rejects_unknown_node(self):
        with self.assertRaisesRegex(ValueError, "missing or malformed"):
            AGENT.apply_workflow_inputs({}, "prompt", 1, "99")

    def test_workflow_injection_rejects_wrong_prompt_node_shape(self):
        with self.assertRaisesRegex(ValueError, "inputs.text"):
            AGENT.apply_workflow_inputs({"1": {"inputs": {"other": "x"}}}, "prompt", 1, "1")


if __name__ == "__main__":
    unittest.main()
