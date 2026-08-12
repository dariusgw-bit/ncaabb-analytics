import json
import math
import os
from pathlib import Path

import pandas as pd

CURRENT_SEASON = int(os.environ.get("NCAABB_CURRENT_SEASON", "2026"))
BASE_DIR = os.environ.get("NCAABB_BASE_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "NCAABB")
RAW_DIR = os.path.join(BASE_DIR, "raw_hoopr_parquets")
TEAM_BOX_PATH = os.path.join(RAW_DIR, "team_box", f"mbb_team_box_{CURRENT_SEASON}.parquet")
TEAM_BOX_DIR = os.path.join(RAW_DIR, "team_box")
STANDINGS_PATH = os.path.join(RAW_DIR, "standings", "mbb_standings.parquet")
SCHEDULE_PATH = os.path.join(RAW_DIR, "schedule", f"mbb_schedule_{CURRENT_SEASON}.parquet")
HOME_AWAY_PATH = os.path.join(RAW_DIR, "derived", "home_away_records", f"mbb_home_away_records_{CURRENT_SEASON}.parquet")
TEAM_RANKINGS_PATH = os.path.join(RAW_DIR, "derived", "team_rankings", f"mbb_team_rankings_{CURRENT_SEASON}.parquet")
OFFICIAL_RANKINGS_PATH = os.path.join(RAW_DIR, "rankings", "mbb_rankings.parquet")
OUT_PATH = Path(__file__).parent / "dashboard-react" / "public" / "data" / f"season-dashboard-{CURRENT_SEASON}.json"


def safe_hex(value, default="#f5a623"):
    raw = str(value or "").strip()
    if not raw:
        return default
    if not raw.startswith("#"):
        raw = f"#{raw}"
    if len(raw) == 4:
        raw = "#" + "".join(ch * 2 for ch in raw[1:])
    if len(raw) != 7:
        return default
    try:
        int(raw[1:], 16)
    except Exception:
        return default
    return raw.lower()


def load_optional(path):
    try:
        if path and os.path.exists(path):
            return pd.read_parquet(path)
    except Exception:
        return pd.DataFrame()
    return pd.DataFrame()


def load_ranking_preference():
    official = load_optional(OFFICIAL_RANKINGS_PATH)
    if len(official):
        official = official.copy()
        official["team_id"] = pd.to_numeric(official.get("team_id"), errors="coerce")
        official["poll_rank"] = pd.to_numeric(official.get("current"), errors="coerce")
        official = official[official["team_id"].notna() & official["poll_rank"].between(1, 25)].copy()
        if len(official):
            official["poll_priority"] = official.get("type", "").astype(str).str.lower().eq("ap").astype(int)
            official = official.sort_values(["team_id", "poll_priority"], ascending=[True, False]).drop_duplicates("team_id", keep="first")
            official["team_id"] = official["team_id"].astype(int)
            official["ranking_source"] = "official API"
            return official[["team_id", "poll_rank", "ranking_source"]]
    derived = load_optional(TEAM_RANKINGS_PATH)
    if len(derived):
        derived = derived.copy()
        derived["team_id"] = pd.to_numeric(derived.get("team_id"), errors="coerce")
        derived["poll_rank"] = pd.to_numeric(derived.get("overall_rank"), errors="coerce")
        derived = derived[derived["team_id"].notna() & derived["poll_rank"].notna()].copy()
        if len(derived):
            derived["team_id"] = derived["team_id"].astype(int)
            derived["ranking_source"] = "derived-rankings"
            return derived[["team_id", "poll_rank", "ranking_source"]]
    return pd.DataFrame(columns=["team_id", "poll_rank", "ranking_source"])


def build_games(team_box_df):
    games = team_box_df.copy()
    if "season" in games.columns:
        games = games[pd.to_numeric(games["season"], errors="coerce") == int(CURRENT_SEASON)].copy()
    games["team_id"] = pd.to_numeric(games.get("team_id"), errors="coerce")
    games = games[games["team_id"].notna()].copy()
    games["team_id"] = games["team_id"].astype(int)
    games["game_dt_et"] = pd.to_datetime(games.get("game_date_time"), errors="coerce")
    for col in [
        "team_score", "opponent_team_score", "assists", "blocks", "steals",
        "field_goal_pct", "three_point_field_goal_pct", "free_throw_pct",
        "total_rebounds", "offensive_rebounds", "defensive_rebounds",
        "field_goals_made", "field_goals_attempted", "three_point_field_goals_made",
        "three_point_field_goals_attempted", "turnovers"
    ]:
        if col in games.columns:
            games[col] = pd.to_numeric(games[col], errors="coerce")
    games["point_diff"] = pd.to_numeric(games.get("team_score"), errors="coerce") - pd.to_numeric(games.get("opponent_team_score"), errors="coerce")
    games["win"] = games["point_diff"].gt(0).fillna(False).astype(int)
    games = games.sort_values(["team_id", "game_dt_et", "game_id"], kind="stable").reset_index(drop=True)
    games["game_no"] = games.groupby("team_id").cumcount() + 1
    games["rolling_points_for"] = games.groupby("team_id")["team_score"].transform(lambda s: s.rolling(5, min_periods=1).mean())

    games["prev_game_dt_et"] = games.groupby("team_id")["game_dt_et"].shift(1)
    games["rest_days"] = ((games["game_dt_et"] - games["prev_game_dt_et"]).dt.total_seconds() / 86400.0).clip(lower=0)

    rolling_map = {
        "team_score": "r10_mean_points_for",
        "opponent_team_score": "r10_mean_points_against",
        "point_diff": "r10_mean_point_diff",
        "field_goal_pct": "r10_mean_field_goal_pct",
        "three_point_field_goal_pct": "r10_mean_three_point_field_goal_pct",
        "free_throw_pct": "r10_mean_free_throw_pct",
        "total_rebounds": "r10_mean_total_rebounds",
        "offensive_rebounds": "r10_mean_offensive_rebounds",
        "steals": "r10_mean_steals",
        "blocks": "r10_mean_blocks",
        "turnovers": "r10_mean_turnovers",
    }
    for source_col, target_col in rolling_map.items():
        if source_col in games.columns:
            games[target_col] = games.groupby("team_id")[source_col].transform(lambda s: s.rolling(10, min_periods=1).mean())

    games["r10_gp"] = games.groupby("team_id").cumcount().add(1).clip(upper=10)
    return games


def season_team_box_path(season):
    return os.path.join(TEAM_BOX_DIR, f"mbb_team_box_{int(season)}.parquet")


def build_historical_games(seasons):
    frames = []
    for season in seasons:
        path = season_team_box_path(season)
        if not os.path.exists(path):
            continue
        frame = load_optional(path)
        if len(frame) == 0:
            continue
        frame = frame.copy()
        frame["season"] = pd.to_numeric(frame.get("season"), errors="coerce").fillna(int(season))
        frame["team_id"] = pd.to_numeric(frame.get("team_id"), errors="coerce")
        frame = frame[frame["team_id"].notna()].copy()
        if len(frame) == 0:
            continue
        frame["team_id"] = frame["team_id"].astype(int)
        frame["game_dt_et"] = pd.to_datetime(frame.get("game_date_time"), errors="coerce")
        frame["team_score"] = pd.to_numeric(frame.get("team_score"), errors="coerce")
        frame["opponent_team_score"] = pd.to_numeric(frame.get("opponent_team_score"), errors="coerce")
        frame["point_diff"] = frame["team_score"] - frame["opponent_team_score"]
        frame["win"] = frame["point_diff"].gt(0).fillna(False).astype(int)
        frames.append(frame)
    if not frames:
        return pd.DataFrame()
    games = pd.concat(frames, ignore_index=True)
    games = games.sort_values(["season", "team_id", "game_dt_et", "game_id"], kind="stable").reset_index(drop=True)
    return games


def current_streak_payload(team_games):
    """Return the current completed-game streak for one basketball team."""
    if len(team_games) == 0:
        return None
    ordered = team_games.sort_values(["game_dt_et", "game_id"], kind="stable").copy()
    results = ordered["point_diff"].map(lambda value: "W" if pd.notna(value) and float(value) > 0 else "L" if pd.notna(value) and float(value) < 0 else None).dropna()
    if len(results) == 0:
        return None
    latest = str(results.iloc[-1])
    length = 0
    for result in reversed(results.tolist()):
        if result != latest:
            break
        length += 1
    return f"{latest}{length}"


def monthly_wins_payload(team_games):
    month_order = ["Nov.", "Dec.", "Jan.", "Feb.", "Mar.", "Apr.", "May.", "Jun.", "Jul.", "Aug.", "Sept.", "Oct."]
    wins_by_month = {label: 0 for label in month_order}
    if len(team_games):
        dated = team_games.dropna(subset=["game_dt_et"]).copy()
        if len(dated):
            month_labels = dated["game_dt_et"].dt.month.map({
                1: "Jan.", 2: "Feb.", 3: "Mar.", 4: "Apr.", 5: "May.", 6: "Jun.",
                7: "Jul.", 8: "Aug.", 9: "Sept.", 10: "Oct.", 11: "Nov.", 12: "Dec."
            })
            monthly = dated.assign(month_label=month_labels).groupby("month_label", dropna=False)["win"].sum()
            for label, value in monthly.items():
                if label in wins_by_month:
                    wins_by_month[label] = int(value)
    return [{"label": label, "wins": wins_by_month[label]} for label in month_order]


def recent_season_wins_payload(history_games, team_id):
    seasons = list(range(CURRENT_SEASON - 3, CURRENT_SEASON + 1))
    if len(history_games) == 0:
        return [{"season": season, "wins": 0} for season in seasons]
    team_history = history_games.loc[history_games["team_id"].astype(int) == int(team_id)].copy()
    wins = team_history.groupby("season", dropna=False)["win"].sum().to_dict()
    return [{"season": season, "wins": int(wins.get(season, 0))} for season in seasons]


def conference_lookup(schedule_df):
    rows = []
    conf_name = schedule_df.get("groups_name", pd.Series(index=schedule_df.index, dtype=object))
    conf_short = schedule_df.get("groups_short_name", pd.Series(index=schedule_df.index, dtype=object))
    conf_is_conference = schedule_df.get("groups_is_conference", pd.Series(index=schedule_df.index, dtype=object))
    conf_mask = conf_is_conference.fillna(False).astype(bool) if len(schedule_df) else pd.Series(dtype=bool)

    for side in ["home", "away"]:
        id_col = f"{side}_id"
        if id_col not in schedule_df.columns:
            continue
        label = conf_short.where(conf_short.astype(str).str.strip().ne(""), conf_name)
        x = pd.DataFrame({
            "team_id": pd.to_numeric(schedule_df.get(id_col), errors="coerce"),
            "conference_display": label.fillna("").astype(str).str.strip(),
            "is_conference_game": conf_mask if len(conf_mask) == len(schedule_df) else False,
        })
        rows.append(x)

    if not rows:
        return pd.DataFrame(columns=["team_id", "conference_display"])

    out = pd.concat(rows, ignore_index=True)
    out = out[out["team_id"].notna()].copy()
    out["team_id"] = out["team_id"].astype(int)
    out["conference_display"] = out["conference_display"].replace("", pd.NA)

    preferred = out[out["is_conference_game"].astype(bool)].copy()
    if len(preferred) == 0:
        preferred = out.copy()

    preferred = preferred.dropna(subset=["conference_display"]).copy()
    if len(preferred) == 0:
        return pd.DataFrame(columns=["team_id", "conference_display"])

    counts = (
        preferred.groupby(["team_id", "conference_display"], dropna=False)
        .size()
        .reset_index(name="games")
        .sort_values(["team_id", "games", "conference_display"], ascending=[True, False, True])
        .drop_duplicates(subset=["team_id"], keep="first")
        .reset_index(drop=True)
    )
    return counts[["team_id", "conference_display"]]


def build_summary(games, standings, schedule, home_away, rankings):
    summary = (
        games.groupby("team_id", dropna=False)
        .agg(
            team_name=("team_display_name", "last"),
            team_short_name=("team_short_display_name", "last"),
            team_location=("team_location", "last"),
            games=("game_id", "nunique"),
            wins=("win", "sum"),
            points_for=("team_score", "mean"),
            points_against=("opponent_team_score", "mean"),
            point_diff=("point_diff", "mean"),
            assists=("assists", "mean"),
            rebounds=("total_rebounds", "mean"),
            offensive_rebounds=("offensive_rebounds", "mean"),
            defensive_rebounds=("defensive_rebounds", "mean"),
            blocks=("blocks", "mean"),
            steals=("steals", "mean"),
            turnovers=("turnovers", "mean"),
            fg_pct=("field_goal_pct", "mean"),
            three_pct=("three_point_field_goal_pct", "mean"),
            field_goals_made=("field_goals_made", "mean"),
            field_goals_attempted=("field_goals_attempted", "mean"),
            three_point_made=("three_point_field_goals_made", "mean"),
            three_point_attempted=("three_point_field_goals_attempted", "mean"),
            ft_pct=("free_throw_pct", "mean"),
            pace=("field_goals_attempted", "mean"),
            team_color=("team_color", "last"),
        )
        .reset_index()
    )
    summary["losses"] = summary["games"] - summary["wins"]
    summary["record"] = summary["wins"].astype(int).astype(str) + "-" + summary["losses"].astype(int).astype(str)
    summary["win_pct"] = summary["wins"] / summary["games"].replace(0, pd.NA)

    if len(standings):
      stand = standings.copy()
      stand["team_id"] = pd.to_numeric(stand.get("team_id"), errors="coerce")
      stand = stand[stand["team_id"].notna()].copy()
      stand["team_id"] = stand["team_id"].astype(int)
      keep = [c for c in ["team_id", "avgpointsfor", "avgpointsagainst", "pointdifferential", "home_wins", "home_losses", "road_wins", "road_losses", "home", "road", "winpercent"] if c in stand.columns]
      summary = summary.merge(stand[keep].drop_duplicates("team_id", keep="last"), on="team_id", how="left")
      summary["points_for"] = pd.to_numeric(summary.get("avgpointsfor"), errors="coerce").fillna(summary["points_for"])
      summary["points_against"] = pd.to_numeric(summary.get("avgpointsagainst"), errors="coerce").fillna(summary["points_against"])
      summary["point_diff"] = pd.to_numeric(summary.get("pointdifferential"), errors="coerce").fillna(summary["point_diff"])
      summary["win_pct"] = pd.to_numeric(summary.get("winpercent"), errors="coerce").fillna(summary["win_pct"])

    lookup = conference_lookup(schedule)
    summary = summary.merge(lookup, on="team_id", how="left")

    if len(home_away):
      ha = home_away.copy()
      ha["team_id"] = pd.to_numeric(ha.get("team_id"), errors="coerce")
      ha = ha[ha["team_id"].notna()].copy()
      ha["team_id"] = ha["team_id"].astype(int)
      summary = summary.merge(ha, on="team_id", how="left")

    if len(rankings):
      rk = rankings.copy()
      rk["team_id"] = pd.to_numeric(rk.get("team_id"), errors="coerce")
      rk = rk[rk["team_id"].notna()].copy()
      rk["team_id"] = rk["team_id"].astype(int)
      summary = summary.merge(rk, on="team_id", how="left")

    current_ranks = []
    if len(schedule):
      for side in ["home", "away"]:
        rank_col = f"{side}_current_rank"
        id_col = f"{side}_id"
        if rank_col in schedule.columns and id_col in schedule.columns:
          x = pd.DataFrame({"team_id": pd.to_numeric(schedule[id_col], errors="coerce"), "poll_rank": pd.to_numeric(schedule[rank_col], errors="coerce")})
          current_ranks.append(x)
    if current_ranks:
      poll = pd.concat(current_ranks, ignore_index=True)
      poll = poll[poll["team_id"].notna()].copy()
      poll["team_id"] = poll["team_id"].astype(int)
      poll = poll.dropna(subset=["poll_rank"]).drop_duplicates("team_id", keep="last")
      summary = summary.merge(poll, on="team_id", how="left")

    summary["conference_display"] = summary.get("conference_display", pd.Series("Independent / Unknown", index=summary.index)).fillna("Independent / Unknown")
    summary["team_color"] = summary["team_color"].apply(safe_hex)
    summary["home_record"] = summary.get("home_record", summary.get("home", pd.Series("--", index=summary.index))).fillna("--")
    summary["away_record"] = summary.get("away_record", summary.get("road", pd.Series("--", index=summary.index))).fillna("--")
    return summary


def percentile_score(summary, column, team_value, invert=False):
    series = pd.to_numeric(summary.get(column), errors="coerce").dropna()
    if len(series) == 0 or pd.isna(team_value):
        return None
    team_value = float(team_value)
    if invert:
        score = (series >= team_value).mean() * 100
    else:
        score = (series <= team_value).mean() * 100
    return round(float(score), 1)


def season_history_payload(history_games, team_id):
    if len(history_games) == 0:
        return []
    team_history = history_games.loc[history_games["team_id"].astype(int) == int(team_id)].copy()
    if len(team_history) == 0:
        return []
    season_summary = (
        team_history.groupby("season", dropna=False)
        .agg(
            offense=("team_score", "mean"),
            defense=("opponent_team_score", "mean"),
            useful_stat=("point_diff", "mean"),
        )
        .reset_index()
        .sort_values("season")
    )
    return [
        {
            "season": int(row["season"]),
            "offense": round(float(row["offense"]), 2) if pd.notna(row["offense"]) else None,
            "defense": round(float(row["defense"]), 2) if pd.notna(row["defense"]) else None,
            "useful_stat": round(float(row["useful_stat"]), 2) if pd.notna(row["useful_stat"]) else None,
        }
        for _, row in season_summary.iterrows()
    ]


def radar_payload(team_row, summary):
    total = max(int(summary["team_id"].nunique()), 1)
    def score_from_rank(rank):
      if pd.isna(rank):
        return 0
      return round(100 * (1 - ((float(rank) - 1) / max(total - 1, 1))), 1)
    return {
      "two_pt_pct_score": score_from_rank(team_row.get("offense_rank")),
      "two_pt_pct_rank_label": f"#{int(team_row['offense_rank'])}" if pd.notna(team_row.get("offense_rank")) else "--",
      "three_pt_pct_score": score_from_rank(team_row.get("offense_rank")),
      "three_pt_pct_rank_label": f"#{int(team_row['offense_rank'])}" if pd.notna(team_row.get("offense_rank")) else "--",
      "rebounds_score": score_from_rank(team_row.get("rebounds_rank")),
      "rebounds_rank_label": f"#{int(team_row['rebounds_rank'])}" if pd.notna(team_row.get("rebounds_rank")) else "--",
      "blocks_score": score_from_rank(team_row.get("defense_rank")),
      "blocks_rank_label": f"#{int(team_row['defense_rank'])}" if pd.notna(team_row.get("defense_rank")) else "--",
      "steals_score": score_from_rank(team_row.get("defense_rank")),
      "steals_rank_label": f"#{int(team_row['defense_rank'])}" if pd.notna(team_row.get("defense_rank")) else "--",
      "pace_score": score_from_rank(team_row.get("overall_rank")),
      "pace_rank_label": f"#{int(team_row['overall_rank'])}" if pd.notna(team_row.get("overall_rank")) else "--"
    }



def _clamp(value, low, high):
    return max(low, min(high, value))


def _schedule_tip_dt(schedule_df: pd.DataFrame) -> pd.Series:
    for col in ["game_date_time", "start_date", "date"]:
        if col in schedule_df.columns:
            series = pd.to_datetime(schedule_df[col], errors="coerce", utc=True)
            if pd.api.types.is_datetime64tz_dtype(series):
                return series.dt.tz_convert("America/New_York").dt.tz_localize(None)
            return pd.to_datetime(series, errors="coerce")
    return pd.Series(pd.NaT, index=schedule_df.index)


def _normalize_metric_value(value, min_val, max_val, invert=False):
    if pd.isna(value):
        return 0.5
    span = (max_val - min_val) if pd.notna(max_val) and pd.notna(min_val) else 0
    if not span:
        score = 0.5
    else:
        score = (float(value) - float(min_val)) / float(span)
    if invert:
        score = 1.0 - score
    return _clamp(score, 0.0, 1.0)


def _build_prediction_stat_ranges(summary: pd.DataFrame) -> dict:
    ranges = {}
    for col in ["win_pct", "point_diff", "points_for", "points_against", "rebounds", "assists", "turnovers", "steals"]:
        series = pd.to_numeric(summary.get(col), errors="coerce").dropna()
        if len(series) == 0:
            ranges[col] = (0.0, 1.0)
        else:
            ranges[col] = (float(series.min()), float(series.max()))
    return ranges


def _project_schedule_game(home_row: pd.Series, away_row: pd.Series, ranges: dict) -> dict:
    metric_defs = [
        {"key": "win_pct", "weight": 0.24, "invert": False},
        {"key": "point_diff", "weight": 0.22, "invert": False},
        {"key": "points_for", "weight": 0.16, "invert": False},
        {"key": "points_against", "weight": 0.16, "invert": True},
        {"key": "rebounds", "weight": 0.08, "invert": False},
        {"key": "assists", "weight": 0.06, "invert": False},
        {"key": "turnovers", "weight": 0.05, "invert": True},
        {"key": "steals", "weight": 0.03, "invert": False},
    ]

    home_edge = 0.035
    for metric in metric_defs:
        mn, mx = ranges.get(metric["key"], (0.0, 1.0))
        home_score = _normalize_metric_value(home_row.get(metric["key"]), mn, mx, invert=metric["invert"])
        away_score = _normalize_metric_value(away_row.get(metric["key"]), mn, mx, invert=metric["invert"])
        home_edge += (home_score - away_score) * float(metric["weight"])

    home_prob = _clamp(1.0 / (1.0 + math.exp(-home_edge * 7.5)), 0.05, 0.95)
    away_prob = 1.0 - home_prob
    projected_home = ((float(home_row.get("points_for") or 0.0) + float(away_row.get("points_against") or 0.0)) / 2.0) + home_edge * 10.0
    projected_away = ((float(away_row.get("points_for") or 0.0) + float(home_row.get("points_against") or 0.0)) / 2.0) - home_edge * 10.0
    projected_home = max(40.0, projected_home)
    projected_away = max(40.0, projected_away)
    pred_margin_home = projected_home - projected_away
    confidence = max(home_prob, away_prob)

    if home_prob >= 0.5:
        winner_pick = str(home_row.get("team_name") or "Home Team")
        model_line = f"{winner_pick} -{abs(pred_margin_home):.1f}"
    else:
        winner_pick = str(away_row.get("team_name") or "Away Team")
        model_line = f"{winner_pick} -{abs(pred_margin_home):.1f}"

    return {
        "home_win_prob": round(home_prob, 4),
        "away_win_prob": round(away_prob, 4),
        "confidence": round(confidence, 4),
        "pred_margin_home": round(pred_margin_home, 1),
        "projected_home_score": round(projected_home, 1),
        "projected_away_score": round(projected_away, 1),
        "winner_pick": winner_pick,
        "model_line": model_line,
    }


def _derive_schedule_status(row: pd.Series) -> str:
    detail = str(row.get("status_type_short_detail") or "").strip()
    if detail:
        return detail
    state = str(row.get("status_type_state") or "").strip().lower()
    if state in {"post", "postgame", "final"}:
        return "Final"
    if state == "in":
        return "Live"
    name = str(row.get("status_type_name") or "").strip()
    if name:
        return name.replace("STATUS_", "").replace("_", " ").title()
    return "Scheduled"


def _final_score_text(row: pd.Series, away_name: str, home_name: str) -> str:
    away_score = pd.to_numeric(pd.Series([row.get("away_score")]), errors="coerce").iloc[0]
    home_score = pd.to_numeric(pd.Series([row.get("home_score")]), errors="coerce").iloc[0]
    if pd.isna(away_score) or pd.isna(home_score):
        return ""
    return f"{away_name} {int(round(float(away_score)))} - {home_name} {int(round(float(home_score)))}"


def _slate_summary(rows: list[dict]) -> dict:
    games = len(rows)
    graded = [row for row in rows if row.get("final_score") and row.get("status") == "Final"]
    winner_acc = None
    margin_mae = None
    if graded:
        winner_hits = 0
        abs_errors = []
        for row in graded:
            away_score = row.get("away_score")
            home_score = row.get("home_score")
            if away_score is None or home_score is None:
                continue
            actual_winner = row.get("home_team") if float(home_score) > float(away_score) else row.get("away_team")
            winner_hits += int(str(row.get("winner_pick")) == str(actual_winner))
            abs_errors.append(abs(float(row.get("pred_margin_home") or 0.0) - (float(home_score) - float(away_score))))
        if graded:
            winner_acc = round(winner_hits / len(graded), 4) if len(graded) else None
        if abs_errors:
            margin_mae = round(sum(abs_errors) / len(abs_errors), 2)
    return {
        "games": games,
        "games_graded": len(graded),
        "winner_acc": winner_acc,
        "margin_mae": margin_mae,
        "completed_games": sum(1 for row in rows if row.get("status") == "Final"),
        "upcoming_games": sum(1 for row in rows if row.get("status") != "Final"),
    }


def build_prediction_slates(schedule_df: pd.DataFrame, summary: pd.DataFrame) -> tuple[list, str | None]:
    if len(schedule_df) == 0 or len(summary) == 0:
        return [], None

    s = schedule_df.copy()
    s["game_dt_et"] = _schedule_tip_dt(s)
    s = s.dropna(subset=["game_dt_et"]).copy()
    s["home_id"] = pd.to_numeric(s.get("home_id"), errors="coerce")
    s["away_id"] = pd.to_numeric(s.get("away_id"), errors="coerce")
    s = s.dropna(subset=["home_id", "away_id"]).copy()
    s["home_id"] = s["home_id"].astype(int)
    s["away_id"] = s["away_id"].astype(int)
    if "game_id" in s.columns:
        s["game_id"] = s["game_id"].astype(str)
        s = s.sort_values(["game_dt_et", "game_id"], kind="stable").drop_duplicates("game_id", keep="last")
    else:
        s = s.sort_values(["game_dt_et", "away_id", "home_id"], kind="stable")
    team_lookup = summary.set_index("team_id").to_dict("index")
    ranges = _build_prediction_stat_ranges(summary)

    rows = []
    for _, row in s.iterrows():
        home = team_lookup.get(int(row["home_id"]))
        away = team_lookup.get(int(row["away_id"]))
        if home is None or away is None:
            continue
        home_row = pd.Series(home)
        away_row = pd.Series(away)
        projection = _project_schedule_game(home_row, away_row, ranges)
        away_name = str(row.get("away_team") or row.get("away_short_display_name") or away.get("team_name") or "Away Team")
        home_name = str(row.get("home_team") or row.get("home_short_display_name") or home.get("team_name") or "Home Team")
        tip_dt = pd.Timestamp(row.get("game_dt_et"))
        status = _derive_schedule_status(row)
        final_score = _final_score_text(row, away_name, home_name)
        home_score = pd.to_numeric(pd.Series([row.get("home_score")]), errors="coerce").iloc[0]
        away_score = pd.to_numeric(pd.Series([row.get("away_score")]), errors="coerce").iloc[0]
        vegas_spread_home = pd.to_numeric(pd.Series([row.get("vegas_spread_home", row.get("rw_spread_home"))]), errors="coerce").iloc[0]
        rows.append({
            "game_id": str(row.get("game_id") or f"{tip_dt.isoformat()}_{row['away_id']}_{row['home_id']}"),
            "slate_date": tip_dt.date().isoformat(),
            "tip_et": tip_dt.strftime("%m/%d %I:%M %p"),
            "tip_sort": tip_dt.isoformat(),
            "away_team": away_name,
            "home_team": home_name,
            "winner_pick": projection["winner_pick"],
            "confidence": projection["confidence"],
            "pred_margin_home": projection["pred_margin_home"],
            "pred_margin_display": f"{projection['pred_margin_home']:+.1f}",
            "model_line": projection["model_line"],
            "vegas_spread_home": None if pd.isna(vegas_spread_home) else float(vegas_spread_home),
            "projected_home_score": projection["projected_home_score"],
            "projected_away_score": projection["projected_away_score"],
            "final_score": final_score,
            "status": status,
            "home_score": None if pd.isna(home_score) else float(home_score),
            "away_score": None if pd.isna(away_score) else float(away_score),
        })

    if not rows:
        return [], None

    slates = []
    for slate_date in sorted({row["slate_date"] for row in rows}, reverse=True):
        slate_rows = [row for row in rows if row["slate_date"] == slate_date]
        slate_rows.sort(key=lambda item: (item.get("tip_sort") or "", item.get("away_team") or "", item.get("home_team") or ""))
        slates.append({
            "date": slate_date,
            "summary": _slate_summary(slate_rows),
            "games": slate_rows,
        })

    default_date = slates[0]["date"] if slates else None
    return slates, default_date

def main():
    team_box = load_optional(TEAM_BOX_PATH)
    standings = load_optional(STANDINGS_PATH)
    schedule = load_optional(SCHEDULE_PATH)
    home_away = load_optional(HOME_AWAY_PATH)
    rankings = load_ranking_preference()
    games = build_games(team_box)
    historical_games = build_historical_games(range(CURRENT_SEASON - 3, CURRENT_SEASON + 1))
    summary = build_summary(games, standings, schedule, home_away, rankings).sort_values(["win_pct", "point_diff"], ascending=[False, False]).reset_index(drop=True)

    teams = []
    for _, row in summary.iterrows():
      team_games = games.loc[games["team_id"].astype(int) == int(row["team_id"])].copy().sort_values("game_dt_et")
      latest_team_game = team_games.iloc[-1] if len(team_games) else pd.Series(dtype=object)
      teams.append({
        "team_id": int(row["team_id"]),
        "team_name": str(row.get("team_name") or "Team"),
        "team_short_name": str(row.get("team_short_name") or row.get("team_name") or "Team"),
        "team_location": str(row.get("team_location") or row.get("team_short_name") or row.get("team_name") or "Team"),
        "conference_display": str(row.get("conference_display") or "Independent / Unknown"),
        "record": str(row.get("record") or "--"),
        "current_streak": current_streak_payload(team_games),
        "win_pct": float(row["win_pct"]) if pd.notna(row.get("win_pct")) else None,
        "points_for": float(row["points_for"]) if pd.notna(row.get("points_for")) else None,
        "points_against": float(row["points_against"]) if pd.notna(row.get("points_against")) else None,
        "point_diff": float(row["point_diff"]) if pd.notna(row.get("point_diff")) else None,
        "rebounds": float(row["rebounds"]) if pd.notna(row.get("rebounds")) else None,
        "assists": float(row["assists"]) if pd.notna(row.get("assists")) else None,
        "blocks": float(row["blocks"]) if pd.notna(row.get("blocks")) else None,
        "steals": float(row["steals"]) if pd.notna(row.get("steals")) else None,
        "turnovers": float(row["turnovers"]) if pd.notna(row.get("turnovers")) else None,
        "fg_pct": float(row["fg_pct"]) if pd.notna(row.get("fg_pct")) else None,
        "three_pct": float(row["three_pct"]) if pd.notna(row.get("three_pct")) else None,
        "offensive_rebounds": float(row["offensive_rebounds"]) if pd.notna(row.get("offensive_rebounds")) else None,
        "defensive_rebounds": float(row["defensive_rebounds"]) if pd.notna(row.get("defensive_rebounds")) else None,
        "three_point_made": float(row["three_point_made"]) if pd.notna(row.get("three_point_made")) else None,
        "three_point_attempted": float(row["three_point_attempted"]) if pd.notna(row.get("three_point_attempted")) else None,
        "two_point_made": float(row["field_goals_made"] - row["three_point_made"]) if pd.notna(row.get("field_goals_made")) and pd.notna(row.get("three_point_made")) else None,
        "two_point_attempted": float(row["field_goals_attempted"] - row["three_point_attempted"]) if pd.notna(row.get("field_goals_attempted")) and pd.notna(row.get("three_point_attempted")) else None,
        "team_color": safe_hex(row.get("team_color")),
        "home_record": str(row.get("home_record") or "--"),
        "away_record": str(row.get("away_record") or "--"),
        "poll_rank": int(row["poll_rank"]) if pd.notna(row.get("poll_rank")) else None,
        "overall_rank": int(row["overall_rank"]) if pd.notna(row.get("overall_rank")) else None,
        "overall_grade": row.get("overall_grade"),
        "offense_rank": int(row["offense_rank"]) if pd.notna(row.get("offense_rank")) else None,
        "offense_grade": row.get("offense_grade"),
        "defense_rank": int(row["defense_rank"]) if pd.notna(row.get("defense_rank")) else None,
        "defense_grade": row.get("defense_grade"),
        "rebounds_rank": int(row["rebounds_rank"]) if pd.notna(row.get("rebounds_rank")) else None,
        "rebounds_grade": row.get("rebounds_grade"),
        "assists_rank": int(row["assists_rank"]) if pd.notna(row.get("assists_rank")) else None,
        "assists_grade": row.get("assists_grade"),
        "turnovers_rank": int(row["turnovers_rank"]) if pd.notna(row.get("turnovers_rank")) else None,
        "turnovers_grade": row.get("turnovers_grade"),
        "last10_points_for": float(latest_team_game.get("r10_mean_points_for")) if pd.notna(latest_team_game.get("r10_mean_points_for")) else None,
        "last10_points_against": float(latest_team_game.get("r10_mean_points_against")) if pd.notna(latest_team_game.get("r10_mean_points_against")) else None,
        "last10_point_diff": float(latest_team_game.get("r10_mean_point_diff")) if pd.notna(latest_team_game.get("r10_mean_point_diff")) else None,
        "last10_fg_pct": float(latest_team_game.get("r10_mean_field_goal_pct")) if pd.notna(latest_team_game.get("r10_mean_field_goal_pct")) else None,
        "last10_three_pct": float(latest_team_game.get("r10_mean_three_point_field_goal_pct")) if pd.notna(latest_team_game.get("r10_mean_three_point_field_goal_pct")) else None,
        "last10_ft_pct": float(latest_team_game.get("r10_mean_free_throw_pct")) if pd.notna(latest_team_game.get("r10_mean_free_throw_pct")) else None,
        "last10_rebounds": float(latest_team_game.get("r10_mean_total_rebounds")) if pd.notna(latest_team_game.get("r10_mean_total_rebounds")) else None,
        "last10_offensive_rebounds": float(latest_team_game.get("r10_mean_offensive_rebounds")) if pd.notna(latest_team_game.get("r10_mean_offensive_rebounds")) else None,
        "last10_steals": float(latest_team_game.get("r10_mean_steals")) if pd.notna(latest_team_game.get("r10_mean_steals")) else None,
        "last10_blocks": float(latest_team_game.get("r10_mean_blocks")) if pd.notna(latest_team_game.get("r10_mean_blocks")) else None,
        "last10_turnovers": float(latest_team_game.get("r10_mean_turnovers")) if pd.notna(latest_team_game.get("r10_mean_turnovers")) else None,
        "rest_days": float(latest_team_game.get("rest_days")) if pd.notna(latest_team_game.get("rest_days")) else None,
        "games_in_window": int(latest_team_game.get("r10_gp")) if pd.notna(latest_team_game.get("r10_gp")) else None,
        "trend_points_for": [round(float(v), 2) for v in team_games["rolling_points_for"].dropna().tail(16).tolist()],
        "season_history": season_history_payload(historical_games, row["team_id"]),
        "monthly_wins": monthly_wins_payload(team_games),
        "recent_season_wins": recent_season_wins_payload(historical_games, row["team_id"]),
        "assist_score": percentile_score(summary, "assists", row.get("assists")),
        "steal_score": percentile_score(summary, "steals", row.get("steals")),
        "block_score": percentile_score(summary, "blocks", row.get("blocks")),
        "turnover_score": percentile_score(summary, "turnovers", row.get("turnovers"), invert=True),
        "radar": radar_payload(row, summary)
      })

    numeric = summary[["points_for", "points_against", "rebounds", "assists", "blocks", "steals", "turnovers", "fg_pct", "three_pct", "win_pct"]].apply(pd.to_numeric, errors="coerce")
    nat = numeric.mean(numeric_only=True)
    latest_team_rows = games.sort_values(["team_id", "game_dt_et", "game_id"], kind="stable").drop_duplicates(subset=["team_id"], keep="last") if len(games) else pd.DataFrame()
    latest_team_numeric = latest_team_rows[[
      "r10_mean_points_for", "r10_mean_points_against", "r10_mean_point_diff",
      "r10_mean_field_goal_pct", "r10_mean_three_point_field_goal_pct", "r10_mean_free_throw_pct",
      "r10_mean_total_rebounds", "r10_mean_offensive_rebounds", "r10_mean_steals", "r10_mean_blocks",
      "r10_mean_turnovers", "rest_days", "r10_gp"
    ]].apply(pd.to_numeric, errors="coerce") if len(latest_team_rows) else pd.DataFrame()
    latest_team_means = latest_team_numeric.mean(numeric_only=True) if len(latest_team_numeric) else pd.Series(dtype=float)

    national_average = {
      "team_name": "National Average",
      "points_for": float(nat.get("points_for")) if pd.notna(nat.get("points_for")) else None,
      "points_against": float(nat.get("points_against")) if pd.notna(nat.get("points_against")) else None,
      "rebounds": float(nat.get("rebounds")) if pd.notna(nat.get("rebounds")) else None,
      "assists": float(nat.get("assists")) if pd.notna(nat.get("assists")) else None,
      "blocks": float(nat.get("blocks")) if pd.notna(nat.get("blocks")) else None,
      "steals": float(nat.get("steals")) if pd.notna(nat.get("steals")) else None,
      "turnovers": float(nat.get("turnovers")) if pd.notna(nat.get("turnovers")) else None,
      "fg_pct": float(nat.get("fg_pct")) if pd.notna(nat.get("fg_pct")) else None,
      "three_pct": float(nat.get("three_pct")) if pd.notna(nat.get("three_pct")) else None,
      "win_pct": float(nat.get("win_pct")) if pd.notna(nat.get("win_pct")) else None,
      "last10_points_for": float(latest_team_means.get("r10_mean_points_for")) if pd.notna(latest_team_means.get("r10_mean_points_for")) else None,
      "last10_points_against": float(latest_team_means.get("r10_mean_points_against")) if pd.notna(latest_team_means.get("r10_mean_points_against")) else None,
      "last10_point_diff": float(latest_team_means.get("r10_mean_point_diff")) if pd.notna(latest_team_means.get("r10_mean_point_diff")) else None,
      "last10_fg_pct": float(latest_team_means.get("r10_mean_field_goal_pct")) if pd.notna(latest_team_means.get("r10_mean_field_goal_pct")) else None,
      "last10_three_pct": float(latest_team_means.get("r10_mean_three_point_field_goal_pct")) if pd.notna(latest_team_means.get("r10_mean_three_point_field_goal_pct")) else None,
      "last10_ft_pct": float(latest_team_means.get("r10_mean_free_throw_pct")) if pd.notna(latest_team_means.get("r10_mean_free_throw_pct")) else None,
      "last10_rebounds": float(latest_team_means.get("r10_mean_total_rebounds")) if pd.notna(latest_team_means.get("r10_mean_total_rebounds")) else None,
      "last10_offensive_rebounds": float(latest_team_means.get("r10_mean_offensive_rebounds")) if pd.notna(latest_team_means.get("r10_mean_offensive_rebounds")) else None,
      "last10_steals": float(latest_team_means.get("r10_mean_steals")) if pd.notna(latest_team_means.get("r10_mean_steals")) else None,
      "last10_blocks": float(latest_team_means.get("r10_mean_blocks")) if pd.notna(latest_team_means.get("r10_mean_blocks")) else None,
      "last10_turnovers": float(latest_team_means.get("r10_mean_turnovers")) if pd.notna(latest_team_means.get("r10_mean_turnovers")) else None,
      "rest_days": float(latest_team_means.get("rest_days")) if pd.notna(latest_team_means.get("rest_days")) else None,
      "games_in_window": float(latest_team_means.get("r10_gp")) if pd.notna(latest_team_means.get("r10_gp")) else None,
      "team_color": "#ff6b7f",
      "trend_points_for": [round(float(v), 2) for v in games.groupby("game_no")["rolling_points_for"].mean().dropna().tail(16).tolist()]
    }

    prediction_slates, prediction_default_date = build_prediction_slates(schedule, summary)

    payload = {
      "season": CURRENT_SEASON,
      "generated_at": pd.Timestamp.now("UTC").isoformat(),
      "conference_options": sorted(summary["conference_display"].dropna().astype(str).unique().tolist()),
      "teams": teams,
      "national_average": national_average,
      "prediction_slates": prediction_slates,
      "prediction_default_date": prediction_default_date,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote dashboard JSON to {OUT_PATH}")


if __name__ == "__main__":
    main()
