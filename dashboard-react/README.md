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

The dashboard reads JSON from `public/data/season-dashboard-2026.json`.

Generate that file from your current parquet data with:

```bash
python ..\export_react_dashboard_data.py
```
