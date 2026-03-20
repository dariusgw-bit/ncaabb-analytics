from .runtime import get_dashboard_layout, get_legacy_module, load_legacy_app

_EXPORTS = [
    "refresh",
    "open_dashboard_clicked",
    "render_predictions_table",
    "_format_board_for_display",
    "data_status_note",
    "render_matchup",
    "run_bracket_simulation",
    "_render_static_hc_report",
]


def launch_dashboard(dev_mode=None):
    load_legacy_app(dev_mode=dev_mode)
    return get_dashboard_layout(dev_mode=dev_mode)


def __getattr__(name):
    if name in _EXPORTS:
        return getattr(get_legacy_module(), name)
    raise AttributeError(name)


__all__ = ["launch_dashboard"] + list(_EXPORTS)
