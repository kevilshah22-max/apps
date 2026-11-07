from pathlib import Path
import unittest

HTML = Path(__file__).parents[1] / "site" / "cartoonforge" / "index.html"

class CartoonForgeBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = HTML.read_text(encoding="utf-8")

    def test_local_script_studio_controls_are_present(self):
        for element_id in ("fullScript", "ollamaUrl", "ollamaModel", "maxScenes",
                           "generateLocalStoryboard", "localAiStatus"):
            self.assertIn(f'id="{element_id}"', self.html)

    def test_browser_calls_local_ollama_and_uses_structured_output(self):
        self.assertIn('fetch(base+"/api/chat"', self.html)
        self.assertIn('format:schema', self.html)
        self.assertIn('stream:false', self.html)
        self.assertIn('provider:"local Ollama"', self.html)
        self.assertNotIn("api.openai.com", self.html)
        self.assertNotIn("generativelanguage.googleapis.com", self.html)

    def test_scene_validation_and_project_export_are_wired(self):
        for required in ('scene.title', 'scene.visual', 'scene.beat', 'scene.dialogue',
                         'scene.narration', 'scene.shot', 'scene.duration'):
            self.assertIn(required, self.html)
        self.assertIn('generation:window.cartoonForgeGeneration||null', self.html)
        self.assertIn('sourceScript:$("fullScript")?.value||""', self.html)
        self.assertIn('s.beat||s.visual||"A new scene begins…"', self.html)

    def test_ollama_errors_are_visible_and_button_is_reenabled(self):
        self.assertIn('catch(error){status.textContent="Generation failed:', self.html)
        self.assertIn('finally{button.disabled=false}', self.html)
        self.assertIn('role="status" aria-live="polite"', self.html)

if __name__ == "__main__":
    unittest.main()
