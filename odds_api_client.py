"""Small, optional client for The Odds API.

The client is deliberately dependency-light and returns an empty frame when
ODDS_API_KEY is not configured or when the provider is unavailable.
"""
import os
import re
from datetime import datetime, timezone

import pandas as pd
import requests

ODDS_API_URL = "https://api.the-odds-api.com/v4/sports/{sport}/odds"
_CACHE = {}

def _load_api_key():
    value = os.environ.get("ODDS_API_KEY", "").strip()
    if value:
        return value
    path = os.environ.get(
        "ODDS_API_KEY_FILE",
        r"C:\Users\dariu\Documents\Codex\oddsapi\apikey.txt",
    )
    try:
        return open(path, encoding="utf-8").read().strip()
    except OSError:
        return ""



def _key(value):
    value = re.sub(r"[^a-z0-9]", "", str(value).lower())
    aliases = {
        "uconn": "connecticuthuskies", "connecticut": "connecticuthuskies",
        "olemiss": "olemissrebels", "mississippi": "olemissrebels",
        "miami": "miamihurricanes",
    }
    return aliases.get(value, value)


def _market(event, name):
    values = []
    for bookmaker in event.get("bookmakers", []) or []:
        for market in bookmaker.get("markets", []) or []:
            if market.get("key") == name:
                values.extend(market.get("outcomes", []) or [])
    return values


def _best(values, name):
    values = [v for v in values if v.get("name")]
    if not values:
        return {}
    # Prefer the first widely available book; all values are still provider data.
    return values[0]


def fetch_odds(sport, start=None, end=None):
    api_key = _load_api_key()
    if not api_key:
        return pd.DataFrame()
    cache_key = (sport, str(start), str(end))
    if cache_key in _CACHE:
        return _CACHE[cache_key].copy()
    params = {
        "apiKey": api_key, "regions": os.environ.get("ODDS_API_REGIONS", "us"),
        "markets": os.environ.get("ODDS_API_MARKETS", "h2h,spreads,totals"),
        "oddsFormat": "american", "dateFormat": "iso",
    }
    if start is not None:
        params["commenceTimeFrom"] = pd.Timestamp(start).tz_convert("UTC").isoformat() if pd.Timestamp(start).tzinfo else pd.Timestamp(start, tz="UTC").isoformat()
    if end is not None:
        params["commenceTimeTo"] = pd.Timestamp(end).tz_convert("UTC").isoformat() if pd.Timestamp(end).tzinfo else pd.Timestamp(end, tz="UTC").isoformat()
    try:
        response = requests.get(ODDS_API_URL.format(sport=sport), params=params, timeout=30)
        response.raise_for_status()
        events = response.json()
    except Exception as exc:
        print(f"The Odds API unavailable ({sport}): {exc}")
        return pd.DataFrame()
    rows = []
    for event in events if isinstance(events, list) else []:
        away, home = event.get("away_team"), event.get("home_team")
        h2h = {_key(o.get("name")): o.get("price") for o in _market(event, "h2h")}
        spreads = {_key(o.get("name")): o for o in _market(event, "spreads")}
        totals = _market(event, "totals")
        home_spread = spreads.get(_key(home), {})
        away_spread = spreads.get(_key(away), {})
        total = next((o for o in totals if o.get("name", "").lower() == "over"), {})
        rows.append({
            "away_team": away, "home_team": home,
            "commence_time": event.get("commence_time"),
            "odds_api_away_ml": h2h.get(_key(away)), "odds_api_home_ml": h2h.get(_key(home)),
            "odds_api_spread_home": home_spread.get("point"),
            "odds_api_total": total.get("point"),
            "odds_api_source": "The Odds API",
        })
    out = pd.DataFrame(rows)
    _CACHE[cache_key] = out.copy()
    return out


def lookup_schedule(schedule, sport, season=None, week=None):
    if schedule is None or schedule.empty:
        return pd.DataFrame()
    work = schedule.copy()
    if season is not None and "season" in work:
        work = work[pd.to_numeric(work["season"], errors="coerce") == int(season)]
    if week is not None and "week" in work:
        work = work[pd.to_numeric(work["week"], errors="coerce") == int(week)]
    if work.empty or not {"home_team", "away_team"}.issubset(work.columns):
        return pd.DataFrame()
    starts = pd.to_datetime(work.get("start_date", work.get("gameday")), errors="coerce", utc=True)
    start = starts.min() - pd.Timedelta(days=1) if starts.notna().any() else None
    end = starts.max() + pd.Timedelta(days=1) if starts.notna().any() else None
    odds = fetch_odds(sport, start, end)
    if odds.empty:
        return pd.DataFrame()
    odds["_pair"] = odds.apply(lambda r: frozenset((_key(r.away_team), _key(r.home_team))), axis=1)
    work["_pair"] = work.apply(lambda r: frozenset((_key(r.away_team), _key(r.home_team))), axis=1)
    matched = []
    for idx, row in work.iterrows():
        candidates = odds[odds["_pair"] == row["_pair"]]
        if candidates.empty:
            continue
        candidate = candidates.iloc[0]
        item = {"_row_index": idx, **candidate.to_dict()}
        matched.append(item)
    return pd.DataFrame(matched)
