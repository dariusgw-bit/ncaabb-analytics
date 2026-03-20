"""Compatibility-first package facade for the working NCAA dashboard notebook."""

from .dashboard import launch_dashboard
from .runtime import get_legacy_module, load_legacy_app, set_dev_mode

__all__ = [
    "get_legacy_module",
    "launch_dashboard",
    "load_legacy_app",
    "set_dev_mode",
]
