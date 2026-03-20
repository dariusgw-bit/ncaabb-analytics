from .runtime import get_legacy_module

_EXPORTS = [
    "canonical_team",
    "compute_elo_ratings",
    "get_latest_elo_snapshot",
    "add_elo_asof_features",
    "attach_injury_features_to_board",
    "attach_injury_features_by_row_date",
    "ensure_board_team_columns",
    "build_pregame_dataset_for_slate",
    "normalize_board_for_downstream",
    "build_game_dataset_from_team_box",
]


def __getattr__(name):
    if name in _EXPORTS:
        return getattr(get_legacy_module(), name)
    raise AttributeError(name)


__all__ = list(_EXPORTS)
