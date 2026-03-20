from .runtime import get_legacy_module

_EXPORTS = [
    "run_hoopr_refresh",
    "load_team_box_history",
    "load_schedule",
    "load_schedule_history",
    "build_team_rolling_snapshots",
    "find_injury_files_for_date",
    "load_injury_data_for_date",
    "compute_injury_impact",
    "_load_injury_impact_for_date",
    "find_rotowire_files_for_date",
    "load_rotowire_all_for_date",
]


def __getattr__(name):
    if name in _EXPORTS:
        return getattr(get_legacy_module(), name)
    raise AttributeError(name)


__all__ = list(_EXPORTS)
