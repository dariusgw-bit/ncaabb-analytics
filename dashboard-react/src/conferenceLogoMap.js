export const CONFERENCE_LOGO_MAP = {
  "America East": { name: "America East", logoUrl: "/assets/conference-logos/america-east.png" },
  "American": { name: "American", logoUrl: "/assets/conference-logos/american_athletic_conference_logo_primary_20178032.png" },
  "Atlantic Sun": { name: "Atlantic Sun", logoUrl: "/assets/conference-logos/Atlantic-Sun-Conference-logo.png" },
  "A-10": { name: "A-10", logoUrl: "/assets/conference-logos/atlantic_10_conference_logo_secondary_20144281.png" },
  "ACC": { name: "ACC", logoUrl: "/assets/conference-logos/atlantic_coast_conference_logo_primary_20146189.png", sourcePage: "https://www.sportslogos.net/logos/view/465914502014/Atlantic-Coast-Conference-Logo/2014/Primary-Logo" },
  "Big Ten": { name: "Big Ten", logoUrl: "/assets/conference-logos/big-ten.png", sourcePage: "https://www.sportslogos.net/logos/view/5hbs6o28zivflfspemes0lyju/Big-Ten-Conference-Logo/2011/Primary-Logo" },
  "Big 12": { name: "Big 12", logoUrl: "/assets/conference-logos/big_12_conference_logo_primary_20188734.png", sourcePage: "https://www.sportslogos.net/logos/view/466257392019/Big-12-Conference-Logo/2018/Primary-Logo" },
  "SEC": { name: "SEC", logoUrl: "/assets/conference-logos/southeastern_conference_logo_primary_2018_sportslogosnet-5123.png", sourcePage: "https://www.sportslogos.net/logos/view/466751232018/Southeastern-Conference-Logo/2018/Primary-Logo" },
  "Big Sky": { name: "Big Sky", logoUrl: "/assets/conference-logos/Big_Sky_Conference_logo.svg" },
  "Big South": { name: "Big South", logoUrl: "/assets/conference-logos/Big_South_Primary_FC_WBG-e1674680748159.png" },
  "Big West": { name: "Big West", logoUrl: "/assets/conference-logos/Big_West_Conference.png" },
  "CAA": { name: "CAA", logoUrl: "/assets/conference-logos/CAA_Block-281.png" },
  "CUSA": { name: "CUSA", logoUrl: "/assets/conference-logos/conference_usa_logo_primary_2023_sportslogosnet-4562.png" },
  "Horizon": { name: "Horizon", logoUrl: "/assets/conference-logos/Horizon_League_2024_logo.svg.png" },
  "Ivy": { name: "Ivy", logoUrl: "/assets/conference-logos/IvyLeague.png" },
  "MAAC": { name: "MAAC", logoUrl: "/assets/conference-logos/metro.png" },
  "MAC": { name: "MAC", logoUrl: "/assets/conference-logos/Mid-American.png" },
  "MEAC": { name: "MEAC", logoUrl: "/assets/conference-logos/Mid-Eastern.vresize.350.350.medium.0.png" },
  "MVC": { name: "MVC", logoUrl: "/assets/conference-logos/Missouri_Valley_Conference_logo.svg.png" },
  "Mountain West": { name: "Mountain West", logoUrl: "/assets/conference-logos/mountain_west_conference_logo_primary_20111652.png" },
  "NEC": { name: "NEC", logoUrl: "/assets/conference-logos/NEC.png" },
  "OVC": { name: "OVC", logoUrl: "/assets/conference-logos/Ohio_Valley_Conference_logo.svg.png" },
  "Pac-12": { name: "Pac-12", logoUrl: "/assets/conference-logos/pacific-12-conference-logo-primary-2026-466661912026.png" },
  "Patriot": { name: "Patriot", logoUrl: "/assets/conference-logos/Patriot_league_conference_logo.svg.png" },
  "SoCon": { name: "SoCon", logoUrl: "/assets/conference-logos/socon.png" },
  "Southland": { name: "Southland", logoUrl: "/assets/conference-logos/southland_conference_logo_primary_2023_sportslogosnet-4454.png" },
  "SWAC": { name: "SWAC", logoUrl: "/assets/conference-logos/Southwestern_Athletic_Conference_logo.svg.png" },
  "Summit": { name: "Summit", logoUrl: "/assets/conference-logos/Summit_League_logo.svg.png" },
  "Sun Belt": { name: "Sun Belt", logoUrl: "/assets/conference-logos/sun_belt_conference_logo_primary_20207257.png" },
  "UAC": { name: "UAC", logoUrl: "/assets/conference-logos/United_Athletic_Conference.png" },
  "WCC": { name: "WCC", logoUrl: "/assets/conference-logos/West-Coast-Conference-Logo-history.png" },
};

export const CONFERENCE_ALIASES = {
  "Atlantic Coast": "ACC",
  "Atlantic Coast Conference": "ACC",
  "Southeastern Conference": "SEC",
};

export function getConferenceLogoEntry(conferenceName) {
  const raw = String(conferenceName || "").trim();
  const key = CONFERENCE_ALIASES[raw] || raw;
  return CONFERENCE_LOGO_MAP[key] || null;
}
