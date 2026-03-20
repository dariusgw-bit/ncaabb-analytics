from .runtime import get_legacy_module

_EXPORTS = [
    "DEV_MODE",
    "IN_COLAB",
    "CURRENT_SEASON",
    "BASE_DIR",
    "RAW_DIR",
    "ROTOWIRE_DIR",
    "INJURY_DIR",
    "MODEL_DIR",
    "METADATA_PATH",
    "TEAM_BOX_DIR",
    "SCHEDULE_DIR",
    "RETRAIN_DATA_HOURS",
    "RETRAIN_MODEL_DAYS",
    "HIST_SEASONS",
    "ROLL_WINDOW",
    "ELO_K",
    "ELO_INIT",
]


def __getattr__(name):
    if name in _EXPORTS:
        return getattr(get_legacy_module(), name)
    raise AttributeError(name)


__all__ = list(_EXPORTS)
