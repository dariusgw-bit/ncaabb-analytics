from .runtime import get_legacy_module

_EXPORTS = [
    "build_board_for_date",
    "attach_actual_scores_from_schedule",
    "attach_actual_scores_from_team_box",
    "attach_fresh_scores_from_hoopr",
    "attach_espn_scoreboard_finals_patch",
    "compute_daily_accuracy",
    "compute_daily_accuracy_detailed",
    "render_accuracy_banner",
]


def __getattr__(name):
    if name in _EXPORTS:
        return getattr(get_legacy_module(), name)
    raise AttributeError(name)


__all__ = list(_EXPORTS)
