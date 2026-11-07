"""Test helper to import script_agent.py without requiring a package install."""
import importlib.util
from pathlib import Path

def load_agent():
    path = Path(__file__).parents[1] / "cartoonforge-agent" / "script_agent.py"
    spec = importlib.util.spec_from_file_location("cartoonforge_script_agent", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
