// Builds assets/stats.svg from the token owner's public AND private activity.
// Only totals are rendered; private repo names never leave this script.
import { writeFileSync } from "node:fs";

const token = process.env.GH_TOKEN;
const expectedUser = process.env.GH_USER;
if (!token) throw new Error("GH_TOKEN is not set");

const query = `
query {
  viewer {
    login
    pullRequests { totalCount }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      restrictedContributionsCount
      contributionCalendar { totalContributions }
    }
    repositories(ownerAffiliations: OWNER, isFork: false, first: 100) {
      totalCount
      nodes {
        isPrivate
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name } }
        }
      }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
const json = await res.json();
if (json.errors) throw new Error(JSON.stringify(json.errors));

const v = json.data.viewer;
if (expectedUser && v.login.toLowerCase() !== expectedUser.toLowerCase()) {
  throw new Error(`Token belongs to ${v.login}, expected ${expectedUser}`);
}

const c = v.contributionsCollection;
const repos = v.repositories.nodes;
const privateCount = repos.filter((r) => r.isPrivate).length;
const publicCount = repos.length - privateCount;

const langBytes = {};
for (const r of repos) {
  for (const e of r.languages.edges) {
    langBytes[e.node.name] = (langBytes[e.node.name] || 0) + e.size;
  }
}
const totalBytes = Object.values(langBytes).reduce((a, b) => a + b, 0) || 1;
const langs = Object.entries(langBytes)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([name, bytes]) => ({ name, pct: (bytes / totalBytes) * 100 }));

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const fmt = (n) => n.toLocaleString("en-US");

const rows = [
  ["contributions, last 12 months", fmt(c.contributionCalendar.totalContributions)],
  ["pull requests, all time", fmt(v.pullRequests.totalCount)],
  ["repos", `${publicCount} public · ${privateCount} private`],
];

const W = 820;
const left = 28;
const valueX = 330;
let y = 78;
const lines = [];

lines.push(
  `<text x="${left}" y="${y}" class="mono"><tspan class="dim">$ </tspan><tspan class="txt">npx playwright show-report </tspan><tspan class="me">--include-private</tspan></text>`
);
y += 36;
for (const [label, value] of rows) {
  lines.push(
    `<text x="${left + 16}" y="${y}" class="mono"><tspan class="dim">${esc(label)}</tspan></text>`,
    `<text x="${valueX}" y="${y}" class="mono txt">${esc(value)}</text>`
  );
  y += 24;
}

y += 16;
lines.push(`<text x="${left + 16}" y="${y}" class="mono dim">languages</text>`);
y += 26;
const barX = 170;
const barW = 420;
for (const l of langs) {
  const w = Math.max(2, (l.pct / 100) * barW);
  lines.push(
    `<text x="${left + 16}" y="${y}" class="mono txt">${esc(l.name)}</text>`,
    `<rect x="${barX}" y="${y - 11}" width="${barW}" height="10" rx="2" fill="#21262d"/>`,
    `<rect x="${barX}" y="${y - 11}" width="${w.toFixed(1)}" height="10" rx="2" fill="#3fb950"/>`,
    `<text x="${barX + barW + 16}" y="${y}" class="mono dim">${l.pct.toFixed(1)}%</text>`
  );
  y += 22;
}
y += 18;

const H = y;
const summary = rows.map(([k, val]) => `${k}: ${val}`).join(", ") +
  ". Languages: " + langs.map((l) => `${l.name} ${l.pct.toFixed(0)}%`).join(", ") + ".";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">
  <title id="title">GitHub activity, public and private</title>
  <desc id="desc">${esc(summary)}</desc>
  <style>
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 14px; }
    .txt { fill: #c9d1d9; }
    .dim { fill: #6e7681; }
    .me { fill: #e3b341; }
  </style>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10" fill="#111418" stroke="#30363d"/>
  <circle cx="24" cy="22" r="5" fill="#3a3f47"/>
  <circle cx="42" cy="22" r="5" fill="#3a3f47"/>
  <circle cx="60" cy="22" r="5" fill="#3a3f47"/>
  <text x="${W / 2}" y="27" text-anchor="middle" class="mono dim" font-size="12">report</text>
  <line x1="1" y1="42" x2="${W - 1}" y2="42" stroke="#30363d"/>
  ${lines.join("\n  ")}
</svg>
`;

writeFileSync(new URL("../../assets/stats.svg", import.meta.url), svg);
console.log(summary);
