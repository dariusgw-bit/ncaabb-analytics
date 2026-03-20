import importlib.util
import os
import sys
from pathlib import Path


PACKAGE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = PACKAGE_DIR.parent
LEGACY_SCRIPT_PATH = PROJECT_ROOT / "ncaa_claudeai.py"
LEGACY_MODULE_NAME = "caabb_legacy_runtime"

_LEGACY_MODULE = None
_LEGACY_DEV_MODE = None


def _resolve_dev_mode(dev_mode=None) -> bool:
    if dev_mode is None:
        return str(os.environ.get("NCAABB_DEV_MODE", "1")).strip().lower() not in {"0", "false", "no", "off"}
    return bool(dev_mode)


def set_dev_mode(dev_mode: bool) -> bool:
    resolved = bool(dev_mode)
    os.environ["NCAABB_DEV_MODE"] = "1" if resolved else "0"
    return resolved


def load_legacy_app(dev_mode=None, force_reload: bool = False):
    global _LEGACY_MODULE, _LEGACY_DEV_MODE

    resolved = _resolve_dev_mode(dev_mode)
    set_dev_mode(resolved)

    if _LEGACY_MODULE is not None and not force_reload:
        _LEGACY_DEV_MODE = resolved
        try:
            setattr(_LEGACY_MODULE, "DEV_MODE", resolved)
        except Exception:
            pass
        return _LEGACY_MODULE

    spec = importlib.util.spec_from_file_location(LEGACY_MODULE_NAME, LEGACY_SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load legacy dashboard script: {LEGACY_SCRIPT_PATH}")

    if force_reload:
        sys.modules.pop(LEGACY_MODULE_NAME, None)

    module = importlib.util.module_from_spec(spec)
    sys.modules[LEGACY_MODULE_NAME] = module
    spec.loader.exec_module(module)

    _LEGACY_MODULE = module
    _LEGACY_DEV_MODE = resolved
    try:
        setattr(_LEGACY_MODULE, "DEV_MODE", resolved)
    except Exception:
        pass
    return module


def get_legacy_module():
    return load_legacy_app()


def get_dashboard_layout(dev_mode=None):
    module = load_legacy_app(dev_mode=dev_mode)
    return getattr(module, "dashboard_layout", module)


def get_runtime_globals(dev_mode=None):
    module = load_legacy_app(dev_mode=dev_mode)
    return module.__dict__
