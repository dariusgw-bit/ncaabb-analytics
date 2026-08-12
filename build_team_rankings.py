import os
from pathlib import Path

import pandas as pd

CURRENT_SEASON = int(os.environ.get("NCAABB_CURRENT_SEASON", "2026"))
BASE_DIR = os.environ.get("NCAABB_BASE_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "NCAABB")
RAW_DIR = os.path.join(BASE_DIR, "raw_hoopr_parquets")
TEAM_BOX_DIR = os.path.join(RAW_DIR, "team_box")
OUT_DIR = os.path.join(RAW_DIR, "derived", "team_rankings")


def build_summary(team_box_df: pd.DataFrame, season: int) -> pd.DataFrame:
    games = team_box_df.copy()
    if "season" in games.columns:
        games = games[pd.to_numeric(games["season"], errors="coerce") == int(season)].copy()
    games["team_id"] = pd.to_numeric(games.get("team_id"), errors="coerce")
    games = games[games["team_id"].notna()].copy()
    games["team_id"] = games["team_id"].astype(int)
    num_cols = ["team_score", "opponent_team_score", "assists", "total_rebounds", "turnovers"]
    for col in num_cols:
        if col in games.columns:
            games[col] = pd.to_numeric(games[col], errors="coerce")
    games["point_diff"] = pd.to_numeric(games.get("team_score"), errors="coerce") - pd.to_numeric(games.get("opponent_team_score"), errors="coerce")
    games["win"] = pd.to_numeric(games.get("team_score"), errors="coerce").gt(pd.to_numeric(games.get("opponent_team_score"), errors="coerce")).fillna(False).astype(int)
    summary = (
        games.groupby("team_id", dropna=False)
        .agg(
            games=("game_id", "nunique"),
            wins=("win", "sum"),
            points_for=("team_score", "mean"),
            points_against=("opponent_team_score", "mean"),
            point_diff=("point_diff", "mean"),
            assists=("assists", "mean"),
            rebounds=("total_rebounds", "mean"),
            turnovers=("turnovers", "mean"),
        )
        .reset_index()
    )
    summary["losses"] = summary["games"] - summary["wins"]
    summary["win_pct"] = summary["wins"] / summary["games"].replace(0, pd.NA)
    return summary


def ranking_grade(rank, total_teams: int) -> str:
    rank_num = pd.to_numeric(pd.Series([rank]), errors="coerce").iloc[0]
    total_num = pd.to_numeric(pd.Series([total_teams]), errors="coerce").iloc[0]
    if pd.isna(rank_num) or pd.isna(total_num) or float(total_num) <= 0:
        return "--"
    pct = 1.0 - ((float(rank_num) - 1.0) / max(float(total_num) - 1.0, 1.0))
    if pct >= 0.97:
        return "A+"
    if pct >= 0.90:
        return "A"
    if pct >= 0.82:
        return "A-"
    if pct >= 0.72:
        return "B+"
    if pct >= 0.62:
        return "B"
    if pct >= 0.52:
        return "B-"
    if pct >= 0.40:
        return "C+"
    if pct >= 0.30:
        return "C"
    if pct >= 0.20:
        return "C-"
    return "D"


def build_rankings(summary_df: pd.DataFrame, season: int) -> pd.DataFrame:
    s = summary_df.copy()
    total_teams = int(s["team_id"].nunique())
    s["overall_score_model"] = (
        pd.to_numeric(s.get("win_pct"), errors="coerce").fillna(0) * 0.60 +
        pd.to_numeric(s.get("point_diff"), errors="coerce").fillna(0).rank(pct=True, method="average") * 0.25 +
        pd.to_numeric(s.get("points_for"), errors="coerce").fillna(0).rank(pct=True, method="average") * 0.10 +
        (1.0 - pd.to_numeric(s.get("points_against"), errors="coerce").fillna(0).rank(pct=True, method="average")) * 0.05
    )
    s["overall_rank"] = pd.to_numeric(s["overall_score_model"], errors="coerce").rank(ascending=False, method="min")
    s["offense_rank"] = pd.to_numeric(s.get("points_for"), errors="coerce").rank(ascending=False, method="min")
    s["defense_rank"] = pd.to_numeric(s.get("points_against"), errors="coerce").rank(ascending=True, method="min")
    s["rebounds_rank"] = pd.to_numeric(s.get("rebounds"), errors="coerce").rank(ascending=False, method="min")
    s["assists_rank"] = pd.to_numeric(s.get("assists"), errors="coerce").rank(ascending=False, method="min")
    s["turnovers_rank"] = pd.to_numeric(s.get("turnovers"), errors="coerce").rank(ascending=True, method="min")
    out = s[["team_id", "overall_rank", "offense_rank", "defense_rank", "rebounds_rank", "assists_rank", "turnovers_rank"]].copy()
    for col in ["overall_rank", "offense_rank", "defense_rank", "rebounds_rank", "assists_rank", "turnovers_rank"]:
        out[col] = pd.to_numeric(out[col], errors="coerce").astype("Int64")
    out["season"] = int(season)
    out["teams_tracked"] = total_teams
    out["overall_grade"] = out["overall_rank"].apply(lambda x: ranking_grade(x, total_teams))
    out["offense_grade"] = out["offense_rank"].apply(lambda x: ranking_grade(x, total_teams))
    out["defense_grade"] = out["defense_rank"].apply(lambda x: ranking_grade(x, total_teams))
    out["rebounds_grade"] = out["rebounds_rank"].apply(lambda x: ranking_grade(x, total_teams))
    out["assists_grade"] = out["assists_rank"].apply(lambda x: ranking_grade(x, total_teams))
    out["turnovers_grade"] = out["turnovers_rank"].apply(lambda x: ranking_grade(x, total_teams))
    return out


def main() -> None:
    src = Path(TEAM_BOX_DIR) / f"mbb_team_box_{CURRENT_SEASON}.parquet"
    out = Path(OUT_DIR) / f"mbb_team_rankings_{CURRENT_SEASON}.parquet"
    if not src.exists():
        raise FileNotFoundError(f"Missing team box parquet: {src}")
    df = pd.read_parquet(src)
    summary = build_summary(df, CURRENT_SEASON)
    rankings = build_rankings(summary, CURRENT_SEASON)
    out.parent.mkdir(parents=True, exist_ok=True)
    rankings.to_parquet(out, index=False)
    print(f"Wrote {len(rankings):,} team rankings to {out}")


if __name__ == "__main__":
    main()
