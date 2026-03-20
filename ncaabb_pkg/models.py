from .runtime import get_legacy_module

_EXPORTS = [
    "season_weights",
    "train_models",
    "save_models",
    "load_models",
    "check_and_retrain",
    "make_xgb_matrix",
    "predict_slate",
]


def __getattr__(name):
    if name in _EXPORTS:
        return getattr(get_legacy_module(), name)
    raise AttributeError(name)


__all__ = list(_EXPORTS)
