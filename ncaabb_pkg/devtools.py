from .runtime import get_legacy_module, load_legacy_app, set_dev_mode

_EXPORTS = [
    "_dashboard_log",
    "_safe_execute",
    "_collect_startup_diagnostics",
    "_emit_startup_diagnostics",
]


def launch_dev_dashboard():
    set_dev_mode(True)
    return load_legacy_app(dev_mode=True)


def launch_quiet_dashboard():
    set_dev_mode(False)
    return load_legacy_app(dev_mode=False)


def __getattr__(name):
    if name in _EXPORTS:
        return getattr(get_legacy_module(), name)
    raise AttributeError(name)


__all__ = [
    "launch_dev_dashboard",
    "launch_quiet_dashboard",
    "load_legacy_app",
    "set_dev_mode",
] + list(_EXPORTS)
