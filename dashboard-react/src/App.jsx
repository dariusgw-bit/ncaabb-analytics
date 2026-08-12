import React, { useEffect, useMemo, useState } from "react";
import { getConferenceLogoEntry } from "./conferenceLogoMap";
import { useDeferredValue } from "react";

const DATA_URL = "/data/season-dashboard-2026.json";
const PLAYER_DATA_URL = "/data/player-stats-2026.json";
const PICKS_STORAGE_KEY = "ncaabb-dashboard-picks-v1";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toFixed(digits);
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  const numeric = Number(value);
  const pct = Math.abs(numeric) <= 1.5 ? numeric * 100 : numeric;
  return `${pct.toFixed(1)}%`;
}

function formatSlateDate(value) {
  if (!value) return "--";
  const dt = new Date(`${value}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function formatTipTime24(value) {
  if (!value) return "--";
  const match = String(value).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return String(value);
  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem = match[3].toUpperCase();
  if (meridiem === "AM") {
    if (hour === 12) hour = 0;
  } else if (hour != 12) {
    hour += 12;
  }
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function normalizeTeamKey(value) {
  return String(value || "").trim().toLowerCase();
}

function getPredictionOutcome(row) {
  const homeScore = Number(row?.home_score);
  const awayScore = Number(row?.away_score);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    return { isFinal: false, actualWinner: null, actualMarginHome: null, winnerCorrect: false, spreadCorrect: false };
  }
  const actualWinner = homeScore === awayScore ? null : (homeScore > awayScore ? row.home_team : row.away_team);
  const actualMarginHome = homeScore - awayScore;
  return { isFinal: true, actualWinner, actualMarginHome, winnerCorrect: false, spreadCorrect: false };
}

function gradeColor(grade) {
  if (String(grade).startsWith("A")) return "#5fd6c5";
  if (String(grade).startsWith("B")) return "#7ed957";
  if (String(grade).startsWith("C")) return "#f1b14a";
  return "#ff6b7f";
}


function dropdownLabel(team) {
  if (!team) return "";
  const locationName = String(team.team_location || "").trim();
  if (locationName) return locationName;
  const shortName = String(team.team_short_name || "").trim();
  if (shortName) return shortName;
  return String(team.team_name || "").trim();
}

function getTeamLogoUrl(team) {
  if (!team || team.team_id == null) return null;
  return `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.team_id}.png`;
}

function conferenceBadgeText(value) {
  const conf = String(value || "").trim();
  if (!conf) return "NCA";
  const special = {
    "Big Ten": "B1G",
    "Big 12": "B12",
    "Pac-12": "P12",
    "SEC": "SEC",
    "ACC": "ACC",
    "Big East": "BE",
    "American Athletic": "AAC",
    "Atlantic 10": "A10",
    "Mountain West": "MW",
    "Missouri Valley": "MVC",
    "West Coast": "WCC",
    "Independent / Unknown": "NCA",
  };
  if (special[conf]) return special[conf];
  const parts = conf.replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  if (!parts.length) return conf.slice(0, 3).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.slice(0, 3).map((part) => part[0]).join("").toUpperCase();
}

function ConferenceBadge({ name, color = "#8ea0ff" }) {
  const logoEntry = getConferenceLogoEntry(name);
  const logoUrl = logoEntry?.logoUrl || null;
  return (
    <div className="conference-badge" style={{ borderColor: `${color}55`, color }} title={logoEntry?.sourcePage || undefined}>
      {logoUrl ? <img className="conference-badge-logo" src={logoUrl} alt={`${name} logo`} /> : conferenceBadgeText(name)}
    </div>
  );
}


function TrendOverlay({
  seriesA = [],
  seriesB = [],
  colorA = "#f5a623",
  colorB = "#ff6b7f",
  fillA = "rgba(245,166,35,0.12)",
  fillB = "rgba(255,107,127,0.10)"
}) {
  const valuesA = Array.isArray(seriesA) ? seriesA : [];
  const valuesB = Array.isArray(seriesB) ? seriesB : [];
  const maxLen = Math.max(valuesA.length, valuesB.length);
  if (!maxLen) return null;

  const width = 640;
  const height = 220;
  const padLeft = 54;
  const padRight = 18;
  const padY = 14;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padY * 2;
  const allValues = [...valuesA, ...valuesB].filter((v) => Number.isFinite(Number(v))).map(Number);
  const rawMin = allValues.length ? Math.min(...allValues) : 0;
  const rawMax = allValues.length ? Math.max(...allValues) : 1;
  const min = Math.floor(rawMin - 1);
  const max = Math.ceil(rawMax + 1);
  const span = max - min || 1;
  const tickValues = [max, min + span * 0.75, min + span * 0.5, min + span * 0.25, min].map((value) => Math.round(value * 10) / 10);

  const buildPoints = (values) => values.map((v, i) => {
    const x = padLeft + (i / Math.max(maxLen - 1, 1)) * innerWidth;
    const y = height - padY - ((Number(v) - min) / span) * innerHeight;
    return `${x},${y}`;
  });

  const buildArea = (points) => [`${padLeft},${height - padY}`, ...points, `${padLeft + innerWidth},${height - padY}`].join(" ");
  const pointsA = buildPoints(valuesA);
  const pointsB = buildPoints(valuesB);
  const gridLines = tickValues.map((tick) => ({
    tick,
    y: height - padY - ((tick - min) / span) * innerHeight,
  }));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="trend-overlay">
      {gridLines.map(({ tick, y }) => (
        <g key={tick}>
          <line x1={padLeft} y1={y} x2={padLeft + innerWidth} y2={y} className="trend-grid" />
          <text x={padLeft - 10} y={y + 4} textAnchor="end" className="trend-axis-label">{tick.toFixed(1)}</text>
        </g>
      ))}
      {pointsA.length > 1 ? <polyline points={buildArea(pointsA)} fill={fillA} stroke="none" /> : null}
      {pointsB.length > 1 ? <polyline points={buildArea(pointsB)} fill={fillB} stroke="none" /> : null}
      {pointsA.length > 1 ? <polyline points={pointsA.join(" ")} fill="none" stroke={colorA} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" /> : null}
      {pointsB.length > 1 ? <polyline points={pointsB.join(" ")} fill="none" stroke={colorB} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" /> : null}
    </svg>
  );
}

function RadarChart({ items = [], color = "#f5a623" }) {
  const width = 240;
  const height = 270;
  const cx = width / 2;
  const cy = 112;
  const radius = 76;
  if (!items.length) return null;
  const rings = [0.25, 0.5, 0.75, 1];
  const pointFor = (value, idx, count, scale = 1) => {
    const angle = (-Math.PI / 2) + (idx / count) * Math.PI * 2;
    const r = radius * value * scale;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  };
  const polygon = items.map((item, idx) => pointFor(item.score / 100, idx, items.length).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="radar">
      {rings.map((ring) => (
        <polygon
          key={ring}
          points={items.map((_, idx) => pointFor(1, idx, items.length, ring).join(",")).join(" ")}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
        />
      ))}
      {items.map((item, idx) => {
        const [lineX, lineY] = pointFor(1.08, idx, items.length);
        const [labelX, labelY] = pointFor(1.28, idx, items.length);
        const textAnchor = Math.abs(labelX - cx) < 10 ? "middle" : (labelX >= cx ? "start" : "end");
        return (
          <g key={item.label}>
            <line x1={cx} y1={cy} x2={lineX} y2={lineY} stroke="rgba(255,255,255,0.08)" />
            <text x={labelX} y={labelY} className="radar-label" textAnchor={textAnchor}>{item.label}</text>
            <text x={labelX} y={labelY + 18} className="radar-value" textAnchor={textAnchor}>{item.rank}</text>
          </g>
        );
      })}
      <polygon points={polygon} fill="rgba(245,166,35,0.16)" stroke={color} strokeWidth="3" />
      <circle cx={cx} cy={cy} r="8" fill={color} />
    </svg>
  );
}

function Gauge({ value, label }) {
  const pct = clamp(Number(value) || 0, 0, 100);
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * pct / 100;
  return (
    <div className="gauge-card">
      <svg viewBox="0 0 160 160" className="gauge-svg">
        <circle cx="80" cy="80" r={radius} className="gauge-track" />
        <circle cx="80" cy="80" r={radius} className="gauge-value" style={{ strokeDasharray: `${dash} ${circumference}` }} />
        <text x="80" y="88" textAnchor="middle" className="gauge-number">{Math.round(pct)}</text>
      </svg>
      <div className="gauge-label">{label}</div>
    </div>
  );
}

function StatBar({ label, teamValue, compareValue, teamColor, compareColor }) {
  const max = Math.max(teamValue || 0, compareValue || 0, 1);
  const teamPct = (teamValue || 0) / max * 100;
  const comparePct = (compareValue || 0) / max * 100;
  return (
    <div className="stat-bar">
      <div className="stat-bar-top">
        <span>{label}</span>
        <span>{formatNumber(teamValue)} / {formatNumber(compareValue)}</span>
      </div>
      <div className="stat-bar-track">
        <div className="stat-bar-fill team" style={{ width: `${teamPct}%`, background: teamColor }} />
      </div>
      <div className="stat-bar-track compare">
        <div className="stat-bar-fill compare" style={{ width: `${comparePct}%`, background: compareColor }} />
      </div>
    </div>
  );
}


function MonthlyWinsChart({ data = [], color = "#a9b0e8" }) {
  const values = Array.isArray(data) ? data : [];
  const max = Math.max(...values.map((item) => Number(item?.wins) || 0), 1);
  const ticks = [max, Math.max(Math.round(max / 2), 1), 0];
  return (
    <div className="monthly-wins-chart">
      <div className="wins-unit">Unit: wins</div>
      <div className="monthly-chart-shell">
        <div className="monthly-y-axis">
          {ticks.map((tick) => (
            <div key={tick} className="monthly-y-tick">{tick}</div>
          ))}
        </div>
        <div className="monthly-bars">
          {values.map((item) => {
            const wins = Number(item?.wins) || 0;
            const height = (wins / max) * 100;
            return (
              <div key={item.label} className="monthly-bar-col">
                <div className="monthly-bar-track">
                  <div className="monthly-bar-fill" style={{ height: `${height}%`, background: color }} />
                </div>
                <div className="monthly-bar-value">{wins}</div>
                <div className="monthly-bar-label">{item.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SeasonWinsBars({ data = [], color = "#f5a623" }) {
  const values = Array.isArray(data) ? data : [];
  const max = Math.max(...values.map((item) => Number(item?.wins) || 0), 1);
  return (
    <div className="season-wins-chart">
      <div className="season-wins-header">Wins in the past 4 years</div>
      <div className="season-wins-list">
        {values.map((item) => {
          const wins = Number(item?.wins) || 0;
          return (
            <div key={item.season} className="season-wins-row">
              <span className="season-wins-year">{item.season}</span>
              <div className="season-wins-track">
                <div className="season-wins-fill" style={{ width: `${(wins / max) * 100}%`, background: item.season === values[values.length - 1]?.season ? color : "#8f97c9" }} />
              </div>
              <span className="season-wins-value">{wins}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function SeasonMetricTrend({ data = [], metric = "offense", color = "#f5a623" }) {
  const values = Array.isArray(data) ? data : [];
  const points = values
    .map((item) => ({ label: String(item?.season ?? ""), value: Number(item?.[metric]) }))
    .filter((item) => Number.isFinite(item.value));
  if (!points.length) return <div className="trend-empty">No history available.</div>;

  const width = 560;
  const height = 220;
  const padLeft = 18;
  const padRight = 18;
  const padTop = 14;
  const padBottom = 34;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;
  const min = Math.min(...points.map((p) => p.value));
  const max = Math.max(...points.map((p) => p.value));
  const span = max - min || 1;
  const yTicks = [max, min + span / 2, min].map((value) => Number(value.toFixed(1)));
  const mapped = points.map((point, idx) => {
    const x = padLeft + (idx / Math.max(points.length - 1, 1)) * innerWidth;
    const y = padTop + innerHeight - ((point.value - min) / span) * innerHeight;
    return { ...point, x, y };
  });
  const linePoints = mapped.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPoints = `${padLeft},${padTop + innerHeight} ${linePoints} ${padLeft + innerWidth},${padTop + innerHeight}`;

  return (
    <div className="season-trend-chart">
      <div className="season-trend-unit">Unit: per game</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="season-trend-svg">
        {yTicks.map((tick) => {
          const y = padTop + innerHeight - ((tick - min) / span) * innerHeight;
          return (
            <g key={tick}>
              <line x1={padLeft} y1={y} x2={padLeft + innerWidth} y2={y} className="season-trend-grid" />
              <text x={padLeft - 8} y={y + 4} className="season-trend-y" textAnchor="end">{tick}</text>
            </g>
          );
        })}
        <polyline points={areaPoints} fill="rgba(245,166,35,0.12)" stroke="none" />
        <polyline points={linePoints} fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        {mapped.map((point) => (
          <g key={`${point.label}-${point.value}`}>
            <circle cx={point.x} cy={point.y} r="4" fill={color} />
            <text x={point.x} y={height - 8} className="season-trend-x" textAnchor="middle">{point.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function DetailCard({ label, value, subvalue, align = "left" }) {
  return (
    <div className={`detail-card ${align === "center" ? "center" : ""}`}>
      <div className="detail-card-label">{label}</div>
      <div className="detail-card-value">{value}</div>
      <div className="detail-card-subvalue">{subvalue}</div>
    </div>
  );
}

function MatchupComparisonTable({ rows = [], teamA, teamB, teamAName, teamBName }) {
  if (!rows.length) return <div className="trend-empty">No comparison stats available.</div>;
  const teamALogo = getTeamLogoUrl(teamA);
  const teamBLogo = getTeamLogoUrl(teamB);
  return (
    <div className="matchup-compare-wrap">
      <table className="matchup-compare-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>
              <div className="matchup-team-head matchup-team-head-right">
                {teamALogo ? <img className="matchup-team-logo" src={teamALogo} alt={teamAName} /> : null}
                <span>{teamAName}</span>
              </div>
            </th>
            <th>
              <div className="matchup-team-head matchup-team-head-right">
                {teamBLogo ? <img className="matchup-team-logo" src={teamBLogo} alt={teamBName} /> : null}
                <span>{teamBName}</span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const teamAClass = row.winner === "A" ? "matchup-better" : "";
            const teamBClass = row.winner === "B" ? "matchup-better" : "";
            return (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className={teamAClass}>{row.teamA}</td>
                <td className={teamBClass}>{row.teamB}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MiniDial({ label, value, score, color = "#f5a623" }) {
  const pct = clamp(Number(score) || 0, 0, 100);
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * pct / 100;
  return (
    <div className="mini-dial-card">
      <svg viewBox="0 0 90 90" className="mini-dial-svg">
        <circle cx="45" cy="45" r={radius} className="mini-dial-track" />
        <circle cx="45" cy="45" r={radius} className="mini-dial-value" style={{ strokeDasharray: `${dash} ${circumference}`, stroke: color }} />
        <text x="45" y="50" textAnchor="middle" className="mini-dial-number">{formatNumber(value)}</text>
      </svg>
      <div className="mini-dial-label">{label}</div>
    </div>
  );
}

function formatSigned(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  const numeric = Number(value);
  return `${numeric >= 0 ? "+" : ""}${numeric.toFixed(digits)}`;
}

function buildMatchupProjection(teamA, teamB, teams = []) {
  if (!teamA || !teamB || !teams.length) return null;

  const normalize = (column, value, invert = false) => {
    const values = teams
      .map((team) => Number(team?.[column]))
      .filter((item) => Number.isFinite(item));
    if (!values.length || !Number.isFinite(Number(value))) return 0.5;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    let score = (Number(value) - min) / span;
    if (invert) score = 1 - score;
    return clamp(score, 0, 1);
  };

  const metricDefs = [
    { key: "win_pct", weight: 0.24, invert: false, label: "Win %" },
    { key: "point_diff", weight: 0.22, invert: false, label: "Point Diff" },
    { key: "points_for", weight: 0.16, invert: false, label: "Scoring" },
    { key: "points_against", weight: 0.16, invert: true, label: "Defense" },
    { key: "rebounds", weight: 0.08, invert: false, label: "Rebounds" },
    { key: "assists", weight: 0.06, invert: false, label: "Assists" },
    { key: "turnovers", weight: 0.05, invert: true, label: "Turnovers" },
    { key: "steals", weight: 0.03, invert: false, label: "Steals" },
  ];

  const edges = metricDefs.map((metric) => {
    const aScore = normalize(metric.key, teamA?.[metric.key], metric.invert);
    const bScore = normalize(metric.key, teamB?.[metric.key], metric.invert);
    return {
      ...metric,
      aScore,
      bScore,
      edge: (aScore - bScore) * metric.weight,
      aValue: teamA?.[metric.key],
      bValue: teamB?.[metric.key],
    };
  });

  const totalEdge = edges.reduce((sum, metric) => sum + metric.edge, 0);
  const teamAProb = clamp(1 / (1 + Math.exp(-totalEdge * 7.5)), 0.05, 0.95);
  const teamBProb = 1 - teamAProb;
  const projectedA = ((Number(teamA?.points_for) || 0) + (Number(teamB?.points_against) || 0)) / 2 + totalEdge * 10;
  const projectedB = ((Number(teamB?.points_for) || 0) + (Number(teamA?.points_against) || 0)) / 2 - totalEdge * 10;

  return {
    teamAProb,
    teamBProb,
    projectedA: Math.max(40, projectedA),
    projectedB: Math.max(40, projectedB),
    projectedMargin: projectedA - projectedB,
    winner: teamAProb >= 0.5 ? teamA : teamB,
    loser: teamAProb >= 0.5 ? teamB : teamA,
    edges,
  };
}

function field(row,names,fallback="--"){for(const n of names)if(row&&row[n]!==undefined&&row[n]!==null&&String(row[n]).trim())return row[n];return fallback;}
function PlayerStatsView({rows=[],careerRows=[],tokens=[],draft="",expandedPlayerId,setExpandedPlayerId,onExpand,careerLoading=false}){
  const searchTerms=useMemo(()=>[...tokens,draft.trim()].filter(Boolean),[tokens,draft]);
  const matching=useMemo(()=>rows.filter(r=>searchTerms.every(t=>[field(r,["player_name","name","athlete_name"],""),field(r,["team_name","team","school","team_short_name"],"")].join(" ").toLowerCase().includes(t.toLowerCase()))),[rows,searchTerms]);
  const result=matching.slice(0,300);
  const cols=[["GP",["games"]],["PPG",["ppg"]],["RPG",["rpg"]],["APG",["apg"]],["FG%",["fg_pct"]],["3P%",["three_pct"]],["MPG",["mpg"]]];
  const careerCols=[["Season","season"],["Team","team_name"],["GP","games"],["PPG","ppg"],["RPG","rpg"],["APG","apg"],["FG%","fg_pct"],["3P%","three_pct"],["MPG","mpg"]];
  const togglePlayer=(playerId)=>{const next=String(expandedPlayerId)===String(playerId)?"":String(playerId);setExpandedPlayerId(next);if(next&&onExpand)onExpand(next);};
  return <section className="player-stats-layout"><article className="panel table-panel"><div className="prediction-board-header"><div><div className="panel-label">Player Stats</div><div className="panel-title small">{result.length}{matching.length>result.length?" of "+matching.length:""} players shown</div></div><div className="prediction-board-meta">Click a row for career stats</div></div>{rows.length?<div className="prediction-board-table-wrap"><table className="prediction-board-table player-stats-table"><thead><tr><th>Player</th><th>Team</th>{cols.map(c=><th key={c[0]}>{c[0]}</th>)}</tr></thead><tbody>{result.map((r,i)=>{const playerId=r.player_id||r.id||i;const isExpanded=String(expandedPlayerId)===String(playerId);const history=careerRows.filter(item=>String(item.player_id)===String(r.player_id)).sort((a,b)=>Number(b.season)-Number(a.season));return <><tr key={playerId} className={"player-stats-row"+(isExpanded?" expanded":"")} onClick={()=>togglePlayer(playerId)}><td><button type="button" className="player-name-button" onClick={e=>{e.stopPropagation();togglePlayer(playerId);}}><span className="player-name-cell">{r.headshot_url?<img className="player-headshot" src={r.headshot_url} alt="" aria-hidden="true"/>:null}<span>{field(r,["player_name","name","athlete_name"],"Unknown Player")}</span></span></button></td><td>{field(r,["team_short_name","team","school","team_name"])}</td>{cols.map(c=><td key={c[0]}>{formatNumber(field(r,c[1]),1)}</td>)}</tr>{isExpanded?<tr key={String(playerId)+"-career"} className="career-stats-row"><td colSpan={9}><div className="career-stats-panel"><div className="career-player-heading">{r.headshot_url?<img className="career-player-photo" src={r.headshot_url} alt="" aria-hidden="true"/>:null}<div><div className="career-player-name">{field(r,["player_name","name","athlete_name"],"Unknown Player")}</div><div className="career-stats-title">Career Stats by Season</div></div></div>{careerLoading&&!history.length?<div className="token-hint">Loading career stats...</div>:history.length?<table className="career-stats-table"><thead><tr>{careerCols.map(c=><th key={c[0]}>{c[0]}</th>)}</tr></thead><tbody>{history.map((item,index)=><tr key={String(item.season)+"-"+String(item.team_id)+"-"+index}>{careerCols.map(c=><td key={c[0]}>{c[1]==="team_name"?field(item,[c[1],"team_short_name"]):c[1]==="season"?item[c[1]]:formatNumber(item[c[1]],1)}</td>)}</tr>)}</tbody></table>:<div className="token-hint">No career rows are available for this player.</div>}</div></td></tr>:null}</>})}</tbody></table>{!matching.length&&<div className="prediction-empty">No players match those search tokens.</div>}{matching.length>result.length&&<div className="prediction-empty">Showing the first 300 matches. Add another token to narrow the results.</div>}</div>:<div className="empty-state"><strong>No player feed is loaded yet.</strong><span>Add player rows to <code>public/data/player-stats-2026.json</code>.</span></div>}</article></section>;
}
function SelectionTokenInput({value="",onChange,options=[],placeholder="Select team or player"}){
  const listId="pick-selection-options";
  return <div className="selection-token-field"><input className="selection-token-input" list={listId} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/><datalist id={listId}>{options.map(option=><option key={option} value={option}/>)}</datalist></div>;
}
function PicksView({picks,form,setForm,legs,setLegs,onAdd,onDelete,onGrade,selectionOptions=[]}){const graded=picks.filter(p=>p.result==="win"||p.result==="loss"),wins=graded.filter(p=>p.result==="win").length;const addLeg=()=>{if(!form.legSelection.trim())return;setLegs([...legs,{selection:form.legSelection.trim(),market:form.legMarket.trim(),odds:form.legOdds.trim()}]);setForm({...form,legSelection:"",legMarket:"",legOdds:""});};return <section className="picks-layout"><article className="panel prediction-summary-strip picks-summary"><div className="prediction-summary-item"><span>Total Picks</span><strong>{picks.length}</strong></div><div className="prediction-summary-item"><span>Graded</span><strong>{graded.length}</strong></div><div className="prediction-summary-item"><span>Wins</span><strong>{wins}</strong></div><div className="prediction-summary-item"><span>Win Rate</span><strong>{graded.length?String((wins/graded.length*100).toFixed(1))+"%":"--"}</strong></div></article><div className="picks-grid"><article className="panel pick-entry-panel"><div className="panel-label">Add Pick</div><div className="panel-title small">Track your picks or another capper</div><div className="form-grid"><label className="control"><span>Capper</span><input className="control-input" value={form.capper} onChange={e=>setForm({...form,capper:e.target.value})} placeholder="Me / capper name"/></label><label className="control"><span>Type</span><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="single">Single</option><option value="parlay">Parlay</option></select></label><label className="control"><span>Stake</span><input className="control-input" type="number" value={form.stake} onChange={e=>setForm({...form,stake:e.target.value})}/></label><label className="control"><span>Result</span><select value={form.result} onChange={e=>setForm({...form,result:e.target.value})}><option value="pending">Pending</option><option value="win">Win</option><option value="loss">Loss</option><option value="push">Push</option></select></label></div>{form.type==="single"?<div className="form-grid"><label className="control"><span>Selection</span><SelectionTokenInput value={form.selection} onChange={value=>setForm({...form,selection:value})} options={selectionOptions} placeholder="Select team or player"/></label><label className="control"><span>Market</span><input className="control-input" value={form.market} onChange={e=>setForm({...form,market:e.target.value})} placeholder="Spread, ML, total"/></label><label className="control"><span>Odds</span><input className="control-input" value={form.odds} onChange={e=>setForm({...form,odds:e.target.value})} placeholder="-110"/></label></div>:<div className="parlay-builder"><div className="form-grid"><label className="control"><span>Leg selection</span><SelectionTokenInput value={form.legSelection} onChange={value=>setForm({...form,legSelection:value})} options={selectionOptions} placeholder="Select team or player"/></label><label className="control"><span>Market</span><input className="control-input" value={form.legMarket} onChange={e=>setForm({...form,legMarket:e.target.value})}/></label><label className="control"><span>Odds</span><input className="control-input" value={form.legOdds} onChange={e=>setForm({...form,legOdds:e.target.value})}/></label><button type="button" className="secondary-button" onClick={addLeg}>Add Leg</button></div>{legs.length?<div className="leg-list">{legs.map((l,i)=><span className="leg-chip" key={l.selection+i}>{l.selection}{l.market?" - "+l.market:""}<button type="button" onClick={()=>setLegs(legs.filter((_,j)=>j!==i))}>x</button></span>)}</div>:<div className="token-hint">Add two or more legs to create a parlay.</div>}</div>}<div className="pick-form-actions"><button type="button" className="secondary-button" onClick={()=>{if(form.type!=="parlay"){setForm({...form,type:"parlay"});if(!legs.length&&form.selection.trim())setLegs([{selection:form.selection.trim(),market:form.market.trim(),odds:form.odds.trim()}]);}else{addLeg();}}}>+ Add parlay leg</button><button type="button" className="primary-button" onClick={onAdd}>Save {form.type==="parlay"?"Parlay":"Pick"}</button></div></article><article className="panel table-panel"><div className="panel-label">Pick Tracker</div><div className="panel-title small">Your board</div>{picks.length?<div className="pick-card-list">{picks.map(p=><div className="pick-card" key={p.id}><div><span className="pick-card-kicker">{p.capper||"Me"} - {p.type==="parlay"?p.legs.length+"-leg parlay":"Single"}</span>{p.type==="parlay"?<div className="pick-card-legs">{(p.legs||[]).map((leg,index)=><div className="pick-card-leg" key={leg.selection+index}><strong>{index+1}. {leg.selection}</strong><span>{leg.market||"Pick"}{leg.odds?" - "+leg.odds:""}</span></div>)}</div>:<><strong>{p.selection}</strong><span>{(p.market||"Pick")+(p.odds?" - "+p.odds:"")}</span></>}</div><div className="pick-card-right"><span className={"pick-result "+p.result}>{p.result}</span></div><div className="pick-card-actions"><span>Grade result:</span>{["win","loss","push"].map(result=><button type="button" className={p.result===result?"selected":""} key={result} onClick={()=>onGrade(p.id,result)}>{result[0].toUpperCase()+result.slice(1)}</button>)}<button type="button" className="delete-button" onClick={()=>onDelete(p.id)}>Delete</button></div></div>)}</div>:<div className="empty-state"><strong>No picks tracked yet.</strong><span>Add a single, capper pick, or multi-leg parlay above.</span></div>}</article></div></section>;}

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("predictions");
  const [playerStats,setPlayerStats]=useState([]);const [careerStats,setCareerStats]=useState([]);const [careerStatsLoaded,setCareerStatsLoaded]=useState(false);const [careerLoading,setCareerLoading]=useState(false);const [expandedPlayerId,setExpandedPlayerId]=useState("");const [playerSearchTokens,setPlayerSearchTokens]=useState([]);const [playerSearchDraft,setPlayerSearchDraft]=useState("");
  const deferredPlayerSearchDraft=useDeferredValue(playerSearchDraft);
  const [picks,setPicks]=useState(()=>{try{return JSON.parse(localStorage.getItem(PICKS_STORAGE_KEY)||"[]")}catch{return []}});const [parlayLegs,setParlayLegs]=useState([]);const [pickForm,setPickForm]=useState({capper:"Me",type:"single",selection:"",market:"",odds:"",stake:"1",result:"pending",legSelection:"",legMarket:"",legOdds:""});
  const [predictionDate, setPredictionDate] = useState("");
  const [predictionSearch, setPredictionSearch] = useState("");
  const [conference, setConference] = useState("__all__");
  const [teamId, setTeamId] = useState("");
  const [seasonCompareId, setSeasonCompareId] = useState("__avg__");
  const [predictionOpponentId, setPredictionOpponentId] = useState("");
  const [seasonTrendMetric, setSeasonTrendMetric] = useState("offense");

  useEffect(() => {
    fetch(DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load dashboard data (${res.status})`);
        return res.json();
      })
      .then((payload) => {
        setData(payload);
        const defaultTeam = (payload.teams || []).find((team) => String(team.team_name || "").trim() === "North Carolina Tar Heels");
        const firstTeam = defaultTeam || payload.teams?.[0];
        setTeamId(firstTeam ? String(firstTeam.team_id) : "");
        const defaultOpponent = (payload.teams || []).find((team) => String(team.team_name || "").trim() === "Duke Blue Devils" && String(team.team_id) !== String(firstTeam?.team_id));
        const fallbackOpponent = (payload.teams || []).find((team) => String(team.team_id) !== String(firstTeam?.team_id));
        setPredictionOpponentId(defaultOpponent ? String(defaultOpponent.team_id) : fallbackOpponent ? String(fallbackOpponent.team_id) : "");
        setPredictionDate(payload.prediction_default_date || payload.prediction_slates?.[0]?.date || "");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(()=>{fetch(PLAYER_DATA_URL).then(r=>r.ok?r.json():[]).then(p=>setPlayerStats(Array.isArray(p)?p:p?.players||[])).catch(()=>setPlayerStats([]));},[]);
  useEffect(()=>{localStorage.setItem(PICKS_STORAGE_KEY,JSON.stringify(picks));},[picks]);

  const allTeams = data?.teams || [];
  const pickSelectionOptions=useMemo(()=>Array.from(new Set([...allTeams.map(team=>dropdownLabel(team)),...playerStats.map(player=>String(player.player_name||"").trim()).filter(Boolean)])).sort((a,b)=>a.localeCompare(b)),[allTeams,playerStats]);
  const conferences = data?.conference_options || [];
  const filteredTeams = useMemo(() => {
    const scoped = conference === "__all__" ? allTeams : allTeams.filter((team) => team.conference_display === conference);
    return [...scoped].sort((a, b) => dropdownLabel(a).localeCompare(dropdownLabel(b)));
  }, [allTeams, conference]);

  useEffect(() => {
    if (!filteredTeams.length) return;
    if (!filteredTeams.some((team) => String(team.team_id) === String(teamId))) {
      setTeamId(String(filteredTeams[0].team_id));
    }
  }, [filteredTeams, teamId]);

  const focus = filteredTeams.find((team) => String(team.team_id) === String(teamId)) || filteredTeams[0];

  useEffect(() => {
    if (!focus || !allTeams.length) return;
    const valid = allTeams.some((team) => String(team.team_id) === String(predictionOpponentId) && String(team.team_id) !== String(focus.team_id));
    if (!valid) {
      const preferred = allTeams.find((team) => String(team.team_name || "").trim() === "Duke Blue Devils" && String(team.team_id) !== String(focus.team_id));
      const fallback = allTeams.find((team) => String(team.team_id) !== String(focus.team_id));
      if (preferred || fallback) {
        setPredictionOpponentId(String((preferred || fallback).team_id));
      }
    }
  }, [allTeams, focus, predictionOpponentId]);

  const seasonCompare = useMemo(() => {
    if (!data || !focus) return null;
    if (seasonCompareId === "__avg__") return data.national_average || null;
    return allTeams.find((team) => String(team.team_id) === String(seasonCompareId)) || null;
  }, [data, focus, seasonCompareId, allTeams]);

  const predictionOpponent = useMemo(() => {
    if (!focus) return null;
    return allTeams.find((team) => String(team.team_id) === String(predictionOpponentId) && String(team.team_id) !== String(focus.team_id)) || null;
  }, [allTeams, focus, predictionOpponentId]);

  const predictionProjection = useMemo(() => buildMatchupProjection(focus, predictionOpponent, allTeams), [focus, predictionOpponent, allTeams]);

  const predictionSlates = data?.prediction_slates || [];

  useEffect(() => {
    if (!predictionSlates.length) return;
    if (!predictionSlates.some((slate) => String(slate.date) === String(predictionDate))) {
      setPredictionDate(String(predictionSlates[0].date));
    }
  }, [predictionSlates, predictionDate]);

  const selectedPredictionSlate = useMemo(() => {
    return predictionSlates.find((slate) => String(slate.date) === String(predictionDate)) || predictionSlates[0] || null;
  }, [predictionSlates, predictionDate]);

  const teamLookup = useMemo(() => {
    const entries = allTeams.flatMap((team) => [team.team_name, team.team_short_name, team.team_location]
      .filter(Boolean)
      .map((value) => [normalizeTeamKey(value), team]));
    return new Map(entries);
  }, [allTeams]);

  const getShortTeamName = (teamName) => {
    const team = teamLookup.get(normalizeTeamKey(teamName));
    return team?.team_short_name || team?.team_location || team?.team_name || String(teamName || "--");
  };

  const formatVegasLineShort = (row) => {
    const spreadHome = Number(row?.vegas_spread_home);
    const homeShort = getShortTeamName(row?.home_team);
    const awayShort = getShortTeamName(row?.away_team);
    if (!Number.isFinite(spreadHome)) return "--";
    if (Math.abs(spreadHome) < 0.05) return "PK";
    if (spreadHome < 0) return `${homeShort} -${Math.abs(spreadHome).toFixed(1)}`;
    return `${awayShort} -${Math.abs(spreadHome).toFixed(1)}`;
  };

  const getTeamFromPredictionName = (teamName) => {
    return teamLookup.get(normalizeTeamKey(teamName)) || null;
  };

  const enrichPredictionRow = (row, fallbackKey) => {
    const outcome = getPredictionOutcome(row);
    const predictedMarginHome = Number(row?.pred_margin_home);
    const winnerShort = getShortTeamName(row?.winner_pick);
    const homeShort = getShortTeamName(row?.home_team);
    const awayShort = getShortTeamName(row?.away_team);
    const predictedWinnerKey = normalizeTeamKey(winnerShort);
    const actualWinnerKey = normalizeTeamKey(getShortTeamName(outcome.actualWinner));
    const winnerCorrect = outcome.isFinal && actualWinnerKey && predictedWinnerKey === actualWinnerKey;
    const spreadCorrect = outcome.isFinal && Number.isFinite(predictedMarginHome) && Number.isFinite(outcome.actualMarginHome)
      ? Math.sign(predictedMarginHome) === Math.sign(outcome.actualMarginHome)
      : winnerCorrect;
    const winnerLine = Number.isFinite(predictedMarginHome)
      ? `${winnerShort} ${Math.abs(predictedMarginHome) < 0.05 ? "PK" : `-${Math.abs(predictedMarginHome).toFixed(1)}`}`
      : winnerShort;
    const vegasLine = formatVegasLineShort(row);
    return {
      ...row,
      _key: row?.game_id || fallbackKey,
      _tip24: formatTipTime24(row?.tip_et),
      _homeShort: homeShort,
      _awayShort: awayShort,
      _winnerLine: winnerLine,
      _vegasLine: vegasLine,
      _outcome: { ...outcome, winnerCorrect, spreadCorrect },
    };
  };

  const predictionRowsForSlate = useMemo(() => {
    const rows = selectedPredictionSlate?.games || [];
    return rows.map((row, index) => enrichPredictionRow(row, `${selectedPredictionSlate?.date || 'slate'}-${index}`));
  }, [selectedPredictionSlate, teamLookup]);

  const predictionTableRows = useMemo(() => {
    const search = String(predictionSearch || "").trim().toLowerCase();
    if (!search) return predictionRowsForSlate;
    return predictionRowsForSlate.filter((row) => [row.away_team, row.home_team, row.winner_pick, row.status, row._homeShort, row._awayShort].some((value) => String(value || "").toLowerCase().includes(search)));
  }, [predictionRowsForSlate, predictionSearch]);

  const buildPredictionSummary = (rows) => {
    const games = rows.length;
    const finalRows = rows.filter((row) => row?._outcome?.isFinal);
    const gamesGraded = finalRows.length;
    const winnerHits = finalRows.filter((row) => row?._outcome?.winnerCorrect).length;
    const marginErrors = finalRows
      .map((row) => {
        const pred = Number(row?.pred_margin_home);
        const actual = Number(row?._outcome?.actualMarginHome);
        return Number.isFinite(pred) && Number.isFinite(actual) ? Math.abs(pred - actual) : null;
      })
      .filter((value) => value != null);

    return {
      games,
      games_graded: gamesGraded,
      winner_acc: gamesGraded > 0 ? winnerHits / gamesGraded : null,
      margin_mae: marginErrors.length ? marginErrors.reduce((sum, value) => sum + value, 0) / marginErrors.length : null,
      completed_games: gamesGraded,
      upcoming_games: Math.max(games - gamesGraded, 0),
    };
  };

  const predictionSummary = useMemo(() => buildPredictionSummary(predictionRowsForSlate), [predictionRowsForSlate]);

  const seasonPredictionRows = useMemo(() => predictionSlates.flatMap((slate) => (slate?.games || []).map((row, index) => enrichPredictionRow(row, `${slate?.date || 'season'}-${index}`))), [predictionSlates, teamLookup]);

  const seasonPredictionSummary = useMemo(() => buildPredictionSummary(seasonPredictionRows), [seasonPredictionRows]);

  const openPredictionInSeasonViz = (row) => {
    const homeTeam = getTeamFromPredictionName(row?.home_team);
    const awayTeam = getTeamFromPredictionName(row?.away_team);
    if (homeTeam?.conference_display) {
      setConference(homeTeam.conference_display);
    } else {
      setConference("__all__");
    }
    if (homeTeam?.team_id != null) {
      setTeamId(String(homeTeam.team_id));
    }
    if (awayTeam?.team_id != null) {
      setSeasonCompareId(String(awayTeam.team_id));
    } else {
      setSeasonCompareId("__avg__");
    }
    setActiveTab("matchup");
  };

  const trend = focus?.trend_points_for || [];
  const compareTrend = seasonCompare?.trend_points_for || data?.national_average?.trend_points_for || [];
  const seasonHistory = focus?.season_history || [];
  const monthlyWins = focus?.monthly_wins || [];
  const recentSeasonWins = focus?.recent_season_wins || [];
  const teamColor = focus?.team_color || "#f5a623";
  const compareColor = seasonCompare?.team_color || "#ff6b7f";

  const radarItems = focus ? [
    { label: "2 PT %", score: focus.radar?.two_pt_pct_score ?? 0, rank: focus.radar?.two_pt_pct_rank_label ?? "--" },
    { label: "REB", score: focus.radar?.rebounds_score ?? 0, rank: focus.radar?.rebounds_rank_label ?? "--" },
    { label: "BLK", score: focus.radar?.blocks_score ?? 0, rank: focus.radar?.blocks_rank_label ?? "--" },
    { label: "STL", score: focus.radar?.steals_score ?? 0, rank: focus.radar?.steals_rank_label ?? "--" },
    { label: "PACE", score: focus.radar?.pace_score ?? 0, rank: focus.radar?.pace_rank_label ?? "--" },
    { label: "3 PT %", score: focus.radar?.three_pt_pct_score ?? 0, rank: focus.radar?.three_pt_pct_rank_label ?? "--" }
  ] : [];

  const matchupComparisonRows = useMemo(() => {
    if (!focus || !seasonCompare) return [];
    const metricSpecs = [
      { label: "Points For (Last 10)", a: focus.last10_points_for, b: seasonCompare?.last10_points_for, format: (v) => formatNumber(v, 2), lowerIsBetter: false },
      { label: "Points Against (Last 10)", a: focus.last10_points_against, b: seasonCompare?.last10_points_against, format: (v) => formatNumber(v, 2), lowerIsBetter: true },
      { label: "Point Diff (Last 10)", a: focus.last10_point_diff, b: seasonCompare?.last10_point_diff, format: (v) => formatNumber(v, 2), lowerIsBetter: false },
      { label: "FG%", a: focus.last10_fg_pct, b: seasonCompare?.last10_fg_pct, format: (v) => formatPercent(v), lowerIsBetter: false },
      { label: "3PT%", a: focus.last10_three_pct, b: seasonCompare?.last10_three_pct, format: (v) => formatPercent(v), lowerIsBetter: false },
      { label: "FT%", a: focus.last10_ft_pct, b: seasonCompare?.last10_ft_pct, format: (v) => formatPercent(v), lowerIsBetter: false },
      { label: "Total Rebounds", a: focus.last10_rebounds, b: seasonCompare?.last10_rebounds, format: (v) => formatNumber(v, 2), lowerIsBetter: false },
      { label: "Offensive Rebounds", a: focus.last10_offensive_rebounds, b: seasonCompare?.last10_offensive_rebounds, format: (v) => formatNumber(v, 2), lowerIsBetter: false },
      { label: "Steals", a: focus.last10_steals, b: seasonCompare?.last10_steals, format: (v) => formatNumber(v, 2), lowerIsBetter: false },
      { label: "Blocks", a: focus.last10_blocks, b: seasonCompare?.last10_blocks, format: (v) => formatNumber(v, 2), lowerIsBetter: false },
      { label: "Turnovers", a: focus.last10_turnovers, b: seasonCompare?.last10_turnovers, format: (v) => formatNumber(v, 2), lowerIsBetter: true },
      { label: "Rest Days", a: focus.rest_days, b: seasonCompare?.rest_days, format: (v) => formatNumber(v, 2), lowerIsBetter: false },
      { label: "Games In Window", a: focus.games_in_window, b: seasonCompare?.games_in_window, format: (v) => formatNumber(v, 0), lowerIsBetter: false },
    ];
    return metricSpecs.map((metric) => {
      const a = Number(metric.a);
      const b = Number(metric.b);
      let winner = null;
      if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
        const teamABetter = metric.lowerIsBetter ? a < b : a > b;
        winner = teamABetter ? "A" : "B";
      }
      return {
        label: metric.label,
        teamA: metric.format(metric.a),
        teamB: metric.format(metric.b),
        winner,
      };
    });
  }, [focus, seasonCompare]);

  const loadCareerStats=()=>{if(careerStatsLoaded||careerLoading)return;setCareerLoading(true);fetch("/data/player-career-stats-2026.json").then(r=>r.ok?r.json():[]).then(p=>{setCareerStats(Array.isArray(p)?p:p?.rows||[]);setCareerStatsLoaded(true);}).catch(()=>setCareerStats([])).finally(()=>setCareerLoading(false));};
  if (loading) return <div className="screen-state">Loading dashboard...</div>;
  if (error) return <div className="screen-state error">{error}</div>;
  if (!focus) return <div className="screen-state">No teams available.</div>;

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="eyebrow">NCAABB React Dashboard</div>
          <h1>{activeTab === "predictions" ? "Predictions" : activeTab === "players" ? "Player Stats" : activeTab === "picks" ? "Picks" : "Matchup"}</h1>
          <p>{activeTab === "predictions" ? "Notebook-style slate board for away/home teams, tip time, winner, confidence, margin, finals, and game status." : activeTab === "players" ? "Search player performance by name or team using stackable tokens." : activeTab === "picks" ? "Track your picks, other cappers, and multi-leg parlays." : "Compare teams and explore season performance."}</p>
        </div>

        <div className="tab-nav">
          <button className={activeTab === "predictions" ? "tab-button active" : "tab-button"} onClick={() => setActiveTab("predictions")}>Predictions</button>
          <button className={activeTab === "matchup" ? "tab-button active" : "tab-button"} onClick={() => setActiveTab("matchup")}>Matchup</button><button className={activeTab === "players" ? "tab-button active" : "tab-button"} onClick={() => setActiveTab("players")}>Player Stats</button><button className={activeTab === "picks" ? "tab-button active" : "tab-button"} onClick={() => setActiveTab("picks")}>Picks</button>
        </div>

        {activeTab === "predictions" ? (
          <>
            <label className="control">
              <span>Slate (ET)</span>
              <select value={predictionDate} onChange={(e) => setPredictionDate(e.target.value)}>
                {predictionSlates.map((slate) => (
                  <option key={slate.date} value={slate.date}>{formatSlateDate(slate.date)}</option>
                ))}
              </select>
            </label>

            <label className="control">
              <span>Search</span>
              <input
                className="control-input"
                type="text"
                value={predictionSearch}
                onChange={(e) => setPredictionSearch(e.target.value)}
                placeholder="team or winner..."
              />
            </label>

            <div className="prediction-side-summary">
              <div><span>Season</span><strong>Season-to-Date</strong></div>
              <div><span>Games</span><strong>{seasonPredictionSummary.games || 0}</strong></div>
              <div><span>Graded</span><strong>{seasonPredictionSummary.games_graded || 0}</strong></div>
              <div><span>Winner Acc</span><strong>{formatPercent(seasonPredictionSummary.winner_acc)}</strong></div>
            </div>
          </>
        ) : activeTab === "players" ? (
          <div className="sidebar-player-search">
            <div className="panel-label">Search Players</div>
            <div className="token-search">{playerSearchTokens.map((token)=><button type="button" className="search-token" key={token} onClick={()=>setPlayerSearchTokens(playerSearchTokens.filter(item=>item!==token))}>{token}<span>x</span></button>)}<input type="text" aria-label="Player or team search token" value={playerSearchDraft} onChange={e=>setPlayerSearchDraft(e.target.value)} onKeyDown={e=>{if((e.key==="Enter"||e.key===",")&&playerSearchDraft.trim()){e.preventDefault();const token=playerSearchDraft.trim().replace(/,$/,"");if(!playerSearchTokens.includes(token))setPlayerSearchTokens([...playerSearchTokens,token]);setPlayerSearchDraft("");}}} placeholder={playerSearchTokens.length?"Add another token...":"Name or team, press Enter"}/></div>
            <div className="token-hint">Searches player and team names. Click a token to remove it.</div>
          </div>
        ) : activeTab === "matchup" ? (
          <>
            <label className="control">
              <span>Conference</span>
              <select value={conference} onChange={(e) => setConference(e.target.value)}>
                <option value="__all__">All Conferences</option>
                {conferences.map((conf) => (
                  <option key={conf} value={conf}>{conf}</option>
                ))}
              </select>
            </label>

            <label className="control">
              <span>Team</span>
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                {filteredTeams.map((team) => (
                  <option key={team.team_id} value={team.team_id}>{dropdownLabel(team)}</option>
                ))}
              </select>
            </label>

            <label className="control">
              <span>Opponent / Compare</span>
              <select value={seasonCompareId} onChange={(e) => setSeasonCompareId(e.target.value)}>
                <option value="__avg__">National Average</option>
                {allTeams.filter((team) => String(team.team_id) !== String(focus.team_id)).sort((a, b) => dropdownLabel(a).localeCompare(dropdownLabel(b))).map((team) => (
                  <option key={team.team_id} value={team.team_id}>{dropdownLabel(team)}</option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        <div className={"sidebar-note "+(activeTab === "picks" ? "picks-sidebar-note" : "")}>
          {activeTab === "predictions" ? "Predictions now follow the notebook slate-board format, using exported schedule and season profile data in a React table." : activeTab === "players" ? "Player data is loaded from the optional player-stats export." : activeTab === "picks" ? "Pick entries are saved in this browser using local storage." : "This matchup view stays close to your notebook data while giving us room to evolve the app layout."}
        </div>
      </aside>

      <main className="canvas">
        {activeTab === "predictions" ? (
          <>
            <section className="prediction-board-layout">

              <article className="panel prediction-summary-strip">
                <div className="prediction-summary-item">
                  <span>Slate (ET)</span>
                  <strong>{formatSlateDate(selectedPredictionSlate?.date)}</strong>
                </div>
                <div className="prediction-summary-item">
                  <span>Games</span>
                  <strong>{predictionSummary.games || 0}</strong>
                </div>
                <div className="prediction-summary-item">
                  <span>Games Graded</span>
                  <strong>{predictionSummary.games_graded || 0}</strong>
                </div>
                <div className="prediction-summary-item">
                  <span>Winner Acc</span>
                  <strong>{formatPercent(predictionSummary.winner_acc)}</strong>
                </div>
                <div className="prediction-summary-item">
                  <span>Margin MAE</span>
                  <strong>{predictionSummary.margin_mae == null ? "--" : formatNumber(predictionSummary.margin_mae, 2)}</strong>
                </div>
                <div className="prediction-summary-item">
                  <span>Completed</span>
                  <strong>{predictionSummary.completed_games || 0}</strong>
                </div>
              </article>

              <article className="panel prediction-board-panel">
                <div className="prediction-board-header">
                  <div>
                    <div className="panel-label">Predictions</div>
                    <div className="panel-title small">{formatSlateDate(selectedPredictionSlate?.date)} Slate Board</div>
                  </div>
                  <div className="prediction-board-meta">
                    <span>{predictionTableRows.length} rows shown</span>
                  </div>
                </div>

                <div className="prediction-board-table-wrap">
                  <table className="prediction-board-table">
                    <thead>
                      <tr>
                        <th>Tip</th>
                        <th>Home Team</th>
                        <th>Away Team</th>
                        <th>Confidence</th>
                        <th>Predicted Winner</th>
                        <th>Vegas</th>
                        <th>Final Score</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {predictionTableRows.map((row) => (
                        <tr key={row._key} className="prediction-click-row" onClick={() => openPredictionInSeasonViz(row)}>
                          <td>{row._tip24}</td>
                          <td>{row.home_team}</td>
                          <td>{row.away_team}</td>
                          <td>{formatPercent(row.confidence)}</td>
                          <td className={`winner-cell ${row._outcome?.winnerCorrect ? "winner-cell-correct" : ""}`}>{row._winnerLine}</td>
                          <td>{row._vegasLine}</td>
                          <td className="final-score-cell">
                            {row._outcome?.isFinal ? (
                              <>
                                <span className={`final-team ${normalizeTeamKey(row._outcome?.actualWinner) === normalizeTeamKey(row.home_team) ? "final-team-winner" : ""} ${row._outcome?.winnerCorrect && row._outcome?.spreadCorrect && normalizeTeamKey(row._outcome?.actualWinner) === normalizeTeamKey(row.home_team) ? "final-team-correct" : ""}`}>{row._homeShort} {row.home_score}</span>
                                <span className="final-score-sep"> - </span>
                                <span className={`final-team ${normalizeTeamKey(row._outcome?.actualWinner) === normalizeTeamKey(row.away_team) ? "final-team-winner" : ""} ${row._outcome?.winnerCorrect && row._outcome?.spreadCorrect && normalizeTeamKey(row._outcome?.actualWinner) === normalizeTeamKey(row.away_team) ? "final-team-correct" : ""}`}>{row._awayShort} {row.away_score}</span>
                              </>
                            ) : "--"}
                          </td>
                          <td>
                            <span className={`status-pill ${String(row.status || "").toLowerCase().includes("final") ? "final" : String(row.status || "").toLowerCase().includes("live") ? "live" : "scheduled"}`}>
                              {row.status || "Scheduled"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!predictionTableRows.length ? <div className="prediction-empty">No games match the current search.</div> : null}
                </div>
              </article>
            </section>
          </>
        ) : activeTab === "players" ? (
          <PlayerStatsView rows={playerStats} careerRows={careerStats} tokens={playerSearchTokens} draft={deferredPlayerSearchDraft} expandedPlayerId={expandedPlayerId} setExpandedPlayerId={setExpandedPlayerId} onExpand={loadCareerStats} careerLoading={careerLoading}/> 
        ) : activeTab === "picks" ? (
          <PicksView selectionOptions={pickSelectionOptions} picks={picks} form={pickForm} setForm={setPickForm} legs={parlayLegs} setLegs={setParlayLegs} onAdd={()=>{if(pickForm.type==="single"&&!pickForm.selection.trim())return;if(pickForm.type==="parlay"&&parlayLegs.length<2)return;setPicks([{id:String(Date.now()),...pickForm,legs:pickForm.type==="parlay"?parlayLegs:[]},...picks]);setParlayLegs([]);setPickForm({...pickForm,selection:"",market:"",odds:"",legSelection:"",legMarket:"",legOdds:""});}} onDelete={id=>setPicks(picks.filter(p=>p.id!==id))} onGrade={(id,result)=>setPicks(picks.map(p=>p.id===id?{...p,result}:p))}/>
        ) : activeTab === "players" ? (
          <PlayerStatsView rows={playerStats} tokens={playerSearchTokens} draft={playerSearchDraft} onDraftChange={setPlayerSearchDraft} onAddToken={v=>{const t=v.trim().replace(/,$/,"");if(t&&!playerSearchTokens.includes(t))setPlayerSearchTokens([...playerSearchTokens,t]);setPlayerSearchDraft("")}} onRemoveToken={t=>setPlayerSearchTokens(playerSearchTokens.filter(x=>x!==t))}/>
        ) : activeTab === "picks" ? (
          <PicksView picks={picks} form={pickForm} setForm={setPickForm} legs={parlayLegs} setLegs={setParlayLegs} onAdd={()=>{if(pickForm.type==="single"&&!pickForm.selection.trim())return;if(pickForm.type==="parlay"&&parlayLegs.length<2)return;setPicks([{id:String(Date.now()),...pickForm,legs:pickForm.type==="parlay"?parlayLegs:[]},...picks]);setParlayLegs([]);setPickForm({...pickForm,selection:"",market:"",odds:"",legSelection:"",legMarket:"",legOdds:""})}} onDelete={id=>setPicks(picks.filter(p=>p.id!==id))}/>
        ) : (
          <>
            <section className="hero-grid">
              <article className="hero-card hero-card-team">
                <div className="team-title">{focus.team_name}</div>
                <div className="team-subtitle">{focus.conference_display} - {focus.record}</div>
                <div className="hero-left">
                  <Gauge value={(focus.win_pct || 0) * 100} label="Win Index" />
                  <div className="hero-meta">
                    <div className="meta-label">National Ranking</div>
                    <div className="meta-big">#{focus.poll_rank || focus.overall_rank || "--"}</div>
                    <div className="meta-label">Overall Grade</div>
                    <div className="meta-big grade" style={{ color: gradeColor(focus.overall_grade) }}>{focus.overall_grade || "--"}</div>
                  </div>
                </div>
                {getTeamLogoUrl(focus) ? <img className="hero-corner-logo" src={getTeamLogoUrl(focus)} alt={`${focus.team_name} logo`} /> : null}
              </article>

              <article className="hero-card wide">
                <div className="mini-grid">
                  <div className="mini-stat"><span>Points Per Game</span><strong>{formatNumber(focus.points_for)}</strong></div>
                  <div className="mini-stat"><span>Rebounds</span><strong>{formatNumber(focus.rebounds)}</strong></div>
                  <div className="mini-stat"><span>Assists</span><strong>{formatNumber(focus.assists)}</strong></div>
                  <div className="mini-stat"><span>FG %</span><strong>{formatPercent(focus.fg_pct)}</strong></div>
                  <div className="mini-stat"><span>3 PT %</span><strong>{formatPercent(focus.three_pct)}</strong></div>
                  <div className="mini-stat"><span>Home Record</span><strong>{focus.home_record || "--"}</strong></div>
                  <div className="mini-stat"><span>Away Record</span><strong>{focus.away_record || "--"}</strong></div>
                </div>
              </article>
            </section>

            <section className="content-grid">
              <article className="panel conference-panel">
                <div className="panel-label">Conference</div>
                <div className="conference-title-row">
                  <div className="panel-title conference-title">{focus.conference_display}</div>
                  <ConferenceBadge name={focus.conference_display} color={teamColor} />
                </div>
                <div className="rank-grid">
                  <div>Overall Team</div><div>#{focus.overall_rank || "--"}</div><div style={{ color: gradeColor(focus.overall_grade) }}>{focus.overall_grade || "--"}</div>
                  <div>Team Offense</div><div>#{focus.offense_rank || "--"}</div><div style={{ color: gradeColor(focus.offense_grade) }}>{focus.offense_grade || "--"}</div>
                  <div>Team Defense</div><div>#{focus.defense_rank || "--"}</div><div style={{ color: gradeColor(focus.defense_grade) }}>{focus.defense_grade || "--"}</div>
                  <div>Rebounding</div><div>#{focus.rebounds_rank || "--"}</div><div style={{ color: gradeColor(focus.rebounds_grade) }}>{focus.rebounds_grade || "--"}</div>
                  <div>Assists</div><div>#{focus.assists_rank || "--"}</div><div style={{ color: gradeColor(focus.assists_grade) }}>{focus.assists_grade || "--"}</div>
                  <div>Turnovers</div><div>#{focus.turnovers_rank || "--"}</div><div style={{ color: gradeColor(focus.turnovers_grade) }}>{focus.turnovers_grade || "--"}</div>
                </div>
              </article>

              <article className="panel trend-panel">
                <div className="panel-label">Trend</div>
                <div className="panel-title small">Rolling 5-Game Points Per Game</div>
                <div className="legend-row">
                  <span><i style={{ background: teamColor }} /> {focus.team_name}</span>
                  <span><i style={{ background: compareColor }} /> {seasonCompare?.team_name || "National Avg"}</span>
                </div>
                <TrendOverlay seriesA={trend} seriesB={compareTrend} colorA={teamColor} colorB={compareColor} fillA="rgba(245,166,35,0.12)" fillB="rgba(255,107,127,0.08)" />
              </article>

              <article className="panel benchmark-panel">
                <div className="panel-label">Matchup</div>
                <div className="panel-title small">Team Profile Comparison</div>
                <MatchupComparisonTable
                  rows={matchupComparisonRows}
                  teamA={focus}
                  teamB={seasonCompare}
                  teamAName={focus.team_name}
                  teamBName={seasonCompare?.team_name || "National Average"}
                />
              </article>

              <article className="panel radar-panel">
                <div className="panel-label">Profile</div>
                <div className="panel-title small">Team Ranking Score Chart</div>
                <RadarChart items={radarItems} color={teamColor} />
              </article>

              <article className="panel record-trend-panel">
                <div className="record-trend-grid">
                  <div className="record-stack">
                    <div className="record-box">
                      <div className="split-label">Home Record</div>
                      <div className="record-box-value">{focus.home_record || "--"}</div>
                    </div>
                    <div className="record-box">
                      <div className="split-label">Away Record</div>
                      <div className="record-box-value">{focus.away_record || "--"}</div>
                    </div>
                  </div>
                  <div className="record-trend-chart-wrap">
                    <div className="metric-tabs">
                      <button className={seasonTrendMetric === "offense" ? "active" : ""} onClick={() => setSeasonTrendMetric("offense")}>Offense</button>
                      <button className={seasonTrendMetric === "defense" ? "active" : ""} onClick={() => setSeasonTrendMetric("defense")}>Defense</button>
                      <button className={seasonTrendMetric === "useful_stat" ? "active" : ""} onClick={() => setSeasonTrendMetric("useful_stat")}>Useful Stat</button>
                    </div>
                    <SeasonMetricTrend data={seasonHistory} metric={seasonTrendMetric} color={teamColor} />
                  </div>
                </div>
              </article>

              <article className="panel details-panel">
                <div className="detail-grid">
                  <DetailCard
                    label="2 Points"
                    value={`${formatNumber(focus.two_point_made)} / ${formatNumber(focus.two_point_attempted)}`}
                    subvalue={formatPercent(focus.two_point_attempted ? (focus.two_point_made / focus.two_point_attempted) * 100 : null)}
                    align="center"
                  />
                  <DetailCard
                    label="3 Points"
                    value={`${formatNumber(focus.three_point_made)} / ${formatNumber(focus.three_point_attempted)}`}
                    subvalue={formatPercent(focus.three_pct)}
                    align="center"
                  />
                  <DetailCard
                    label="Rebounds"
                    value={`Offense ${formatNumber(focus.offensive_rebounds)}`}
                    subvalue={`Defense ${formatNumber(focus.defensive_rebounds)}`}
                    align="center"
                  />
                </div>
              </article>

              <article className="panel mini-dials-panel">
                <div className="mini-dials-grid">
                  <MiniDial label="Assists" value={focus.assists} score={focus.assist_score} color={teamColor} />
                  <MiniDial label="Steals" value={focus.steals} score={focus.steal_score} color={teamColor} />
                  <MiniDial label="Blocks" value={focus.blocks} score={focus.block_score} color={teamColor} />
                  <MiniDial label="Turnovers" value={focus.turnovers} score={focus.turnover_score} color="#ff6b45" />
                </div>
              </article>

              <article className="panel history-panel">
                <div className="history-grid">
                  <div className="history-block">
                    <div className="panel-label">Wins</div>
                    <div className="panel-title small">Monthly Wins</div>
                    <MonthlyWinsChart data={monthlyWins} color={teamColor} />
                  </div>
                  <div className="history-block">
                    <div className="panel-label">Wins</div>
                    <div className="panel-title small">Past 4 Seasons</div>
                    <SeasonWinsBars data={recentSeasonWins} color={teamColor} />
                  </div>
                </div>
              </article>

              <article className="panel table-panel">
                <div className="panel-label">Conference Teams</div>
                <div className="team-table">
                  {allTeams.filter((team) => team.conference_display === focus.conference_display).sort((a, b) => (b.win_pct ?? 0) - (a.win_pct ?? 0) || (b.point_diff ?? 0) - (a.point_diff ?? 0)).slice(0, 8).map((team) => (
                    <div key={team.team_id} className={`team-row ${String(team.team_id) === String(focus.team_id) ? "active" : ""}`}>
                      <span className="team-row-name">
                        {getTeamLogoUrl(team) ? <img className="team-row-logo" src={getTeamLogoUrl(team)} alt="" aria-hidden="true" /> : null}
                        <span>{team.team_name}</span>
                      </span>
                      <span>{team.record}</span>
                      <span>{formatPercent(team.win_pct)}</span>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;


