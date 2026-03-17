# AGENTS.md

## Repository Purpose
This repository contains an NCAA basketball prediction dashboard used to generate game predictions and evaluate model performance.

The system integrates:
- historical NCAA data from hoopR
- locally cached team box scores
- Rotowire odds CSV ingestion
- XGBoost / LightGBM prediction models
- an interactive Jupyter dashboard

The system is used during live tournaments, so stability is critical.

Agents must prefer **small, reversible backend patches** and must not introduce breaking changes.

---

## Main Code File

The primary logic for the project exists in:

ncaa_claudeai.py

This file contains:
- data loading
- feature engineering
- model inference
- dashboard rendering
- odds ingestion
- season accuracy grading

The system is not modularized into packages, so careless edits can break the pipeline.

Agents must only modify the minimal section necessary.

---

## Data Sources

### Historical data
Loaded from hoopR exports:

- team_box_hist
- schedule_cur

### Odds data
Rotowire CSV files stored at:

NCAABB/roto-odds/

Example file:
cbb-odds-rotowire-0317.csv

These files may occasionally be mislabeled, so code includes safeguards for row-level date validation.

---

## Prediction Pipeline

Prediction flow:

schedule → build slate → attach odds → create features → run models → generate board

Key functions involved:

- build_board_for_date(...)
- predict_slate(...)
- _attach_rotowire_to_board(...)
- compute_daily_accuracy(...)
- build_or_update_season_accuracy_cache(...)

Agents must never change the logical order of this pipeline.

---

## Model Rules

Models are trained separately and loaded from disk.

Models include:
- XGBoost margin model
- XGBoost win probability model
- LightGBM stacking model
- Isotonic calibration

Agents must NOT:
- retrain models
- modify feature columns
- change model hyperparameters
- alter calibration behavior

unless explicitly instructed.

---

## Allowed Changes

Agents may modify:

- Rotowire CSV parsing
- odds attachment logic
- schedule reconstruction safeguards
- caching logic
- accuracy calculations
- data validation checks

All changes must be minimal and reversible.

---

## Forbidden Changes

Agents must NOT modify:

- existing Predictions tab behavior unless explicitly instructed
- existing Matchup tab behavior unless explicitly instructed
- prediction column names
- model training logic
- existing training feature engineering logic
- prediction output schema

Agents MAY add:
- new isolated dashboard tabs
- new widget controls for new tabs
- new helper functions for separate features such as bracket simulation

Any such additions must not alter the existing daily prediction pipeline.

---

## Schedule Edge Cases

The schedule may contain placeholder rows such as:

home_team = TBD  
away_team = TBD  
home_id = -1  
away_id = -2  

These rows should be treated as invalid games.

Fallback slates should rely on Rotowire odds when real teams are not available.

---

## Rotowire Safeguards

Rotowire CSV files may be mislabeled.

Row-level date validation must ensure:

row_date == selected_ET_date

If rows do not match the selected slate date, they must be ignored.

Fallback slates must never generate fake games.

---

## Local vs Colab Behavior

Local Windows runs must NOT attempt live hoopR scoreboard fetches using rpy2.

The function:

attach_fresh_scores_from_hoopr(...)

must safely exit when running locally.

This prevents rpy2 conversion errors during dashboard refresh.

---

## Confidence Adjustment

Neutral-site games apply a confidence compression toward 0.5.

Example logic:

p_adjusted = 0.5 + (p_raw - 0.5) * 0.88

If abs(pred_margin_home) < 10, stronger compression may be used.

Winner picks must not change due to this adjustment.

---

## Accuracy Caching

Season accuracy is cached weekly.

Cache entries are valid if they contain:

- games_graded
- winner totals
- spread totals
- margin totals
- within-5 totals
- ATS totals

Weeks with ATS_total = 0 are still valid and must not be recomputed.

---

## Editing Rules for AI Agents

When editing code:

1. Do not refactor large sections.
2. Do not rename functions unnecessarily.
3. Do not rename prediction columns.
4. Prefer minimal patches.
5. Avoid adding new dependencies.
6. Maintain compatibility with both local and Colab runs.

---

## Testing Requirements

Before finalizing edits, agents must verify:

Historical slate builds correctly:
build_board_for_date(past_date)

Future slate builds correctly:
build_board_for_date(future_date)

Rotowire odds attach correctly.

ATS grading produces valid totals.

---

## Performance Constraints

Startup time should remain under ~10 seconds.

Avoid:
- rebuilding historical features unnecessarily
- retraining models at startup
- recalculating cached accuracy weeks

Caching should be used whenever possible.

---

## Bracket Simulator Rules

A bracket simulator may be added as a separate feature, but it must remain isolated from the daily prediction pipeline.

Agents may:
- add a new standalone dashboard tab for bracket simulation
- load a separate bracket workbook
- build hypothetical neutral-site matchup helpers for simulation
- save bracket simulation cache/results in the bracket folder

Agents must NOT:
- route bracket simulation through the normal daily board refresh flow
- retrain models for bracket simulation unless explicitly instructed
- alter existing Predictions or Matchup tab behavior
- change the existing prediction output schema for daily slate views

Bracket simulation should reuse existing canonical team mapping and existing model inference paths whenever possible.

---

## Repository Goal

The purpose of this repository is to produce **stable NCAA tournament predictions**.

Agents must prioritize:

stability > performance tweaks > new features

Breaking the dashboard during live tournament play must be avoided.