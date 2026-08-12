import os
from pathlib import Path

import pandas as pd

CURRENT_SEASON = int(os.environ.get("NCAABB_CURRENT_SEASON", "2026"))
BASE_DIR = os.environ.get("NCAABB_BASE_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "NCAABB")
RAW_DIR = os.path.join(BASE_DIR, "raw_hoopr_parquets")
TEAM_BOX_DIR = os.path.join(RAW_DIR, "team_box")
DERIVED_DIR = os.path.join(RAW_DIR, "derived", "home_away_records")


def build_home_away_record_table(team_box_df: pd.DataFrame, season: int) -> pd.DataFrame:
    if team_box_df is None or len(team_box_df) == 0:
        return pd.DataFrame(columns=["team_id", "home_wins", "home_losses", "away_wins", "away_losses", "home_record", "away_record"])
    games = team_box_df.copy()
    if "season" in games.columns:
        games = games[pd.to_numeric(games["season"], errors="coerce") == int(season)].copy()
    games["team_id"] = pd.to_numeric(games.get("team_id"), errors="coerce")
    games = games[games["team_id"].notna()].copy()
    if len(games) == 0 or "team_home_away" not in games.columns:
        return pd.DataFrame(columns=["team_id", "home_wins", "home_losses", "away_wins", "away_losses", "home_record", "away_record"])
    games["team_id"] = games["team_id"].astype(int)
    games["team_home_away"] = games["team_home_away"].fillna("").astype(str).str.strip().str.lower()
    if "team_winner" in games.columns:
        win_mask = games["team_winner"].astype(str).str.strip().str.lower().isin(["true", "1", "yes"])
    else:
        win_mask = pd.to_numeric(games.get("team_score"), errors="coerce").gt(pd.to_numeric(games.get("opponent_team_score"), errors="coerce")).fillna(False)
    games["win"] = win_mask.astype(int)
    home = games[games["team_home_away"] == "home"].copy()
    away = games[games["team_home_away"] == "away"].copy()
    home_summary = home.groupby("team_id", dropna=False).agg(home_games=("game_id", "nunique"), home_wins=("win", "sum")).reset_index() if len(home) else pd.DataFrame(columns=["team_id", "home_games", "home_wins"])
    away_summary = away.groupby("team_id", dropna=False).agg(away_games=("game_id", "nunique"), away_wins=("win", "sum")).reset_index() if len(away) else pd.DataFrame(columns=["team_id", "away_games", "away_wins"])
    out = pd.DataFrame({"team_id": sorted(games["team_id"].dropna().astype(int).unique().tolist())})
    out = out.merge(home_summary, on="team_id", how="left").merge(away_summary, on="team_id", how="left")
    for col in ["home_games", "home_wins", "away_games", "away_wins"]:
        out[col] = pd.to_numeric(out.get(col), errors="coerce").fillna(0).astype(int)
    out["home_losses"] = out["home_games"] - out["home_wins"]
    out["away_losses"] = out["away_games"] - out["away_wins"]
    out["home_record"] = out["home_wins"].astype(str) + "-" + out["home_losses"].astype(str)
    out["away_record"] = out["away_wins"].astype(str) + "-" + out["away_losses"].astype(str)
    return out[["team_id", "home_wins", "home_losses", "away_wins", "away_losses", "home_record", "away_record"]]


def main() -> None:
    src = Path(TEAM_BOX_DIR) / f"mbb_team_box_{CURRENT_SEASON}.parquet"
    out = Path(DERIVED_DIR) / f"mbb_home_away_records_{CURRENT_SEASON}.parquet"
    if not src.exists():
        raise FileNotFoundError(f"Missing team box parquet: {src}")
    df = pd.read_parquet(src)
    built = build_home_away_record_table(df, CURRENT_SEASON)
    out.parent.mkdir(parents=True, exist_ok=True)
    built.to_parquet(out, index=False)
    print(f"Wrote {len(built):,} team records to {out}")


if __name__ == "__main__":
    main()
