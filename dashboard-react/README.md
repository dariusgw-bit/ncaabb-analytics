# NCAABB React Dashboard

This is a standalone React/Vite dashboard scaffold designed to sit beside the notebook workflow.

## What you need

- Node.js
- npm

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

## Data flow

The dashboard reads JSON from the season-neutral `public/data/season-dashboard.json` endpoint. The exporter also keeps a season-specific copy for auditing.

Generate that file from your current parquet data with:

```bash
python ..\export_react_dashboard_data.py
```

The exporter uses the same official NFL GSIS/NFLFSIS NCAA `Club_Cod` resolver as NCAAFB. Codes are matched by school name, not reverse-mapped, so duplicate official codes remain associated with the correct school. Unmatched or ambiguous schools are left unresolved for confirmation rather than assigned a guessed abbreviation.
