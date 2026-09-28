// Public-data indicators for one district × industry, shared by the browser (to compute)
// and the Netlify functions (to validate what the browser sends).
// Industries whose presence hints at customers for the chosen industry. A teaching assumption, shown as such in the UI.
export const RELATED = {
  I2: ['M1', 'I1', 'R1'], P1: ['G2', 'S2', 'R1'], G2: ['S2', 'Q1', 'I2'], S2: ['G2', 'Q1', 'L1'], I1: ['I2', 'R1'],
  R1: ['P1', 'I2'], Q1: ['G2', 'S2'], M1: ['L1', 'N1'], L1: ['G2', 'S2'], N1: ['M1', 'L1']
};

const sum = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);
const round = (n, d = 4) => Number(n.toFixed(d));

export function buildProfile(market, districtCode, industry, candidateCodes = []) {
  const d = market.districts.find(x => x.code === districtCode);
  if (!d || !market.industries[industry]) return null;
  const peers = market.districts.filter(x => x.sido === d.sido);
  const districtCount = d.counts[industry] || 0;
  const districtTotal = sum(d.counts);
  const provinceCount = peers.reduce((n, x) => n + (x.counts[industry] || 0), 0);
  const provinceTotal = peers.reduce((n, x) => n + sum(x.counts), 0);
  const nationalCount = market.districts.reduce((n, x) => n + (x.counts[industry] || 0), 0);
  const nationalTotal = market.districts.reduce((n, x) => n + sum(x.counts), 0);
  const districtShare = districtCount / districtTotal;
  const provinceShare = provinceCount / provinceTotal;
  const nationalShare = nationalCount / nationalTotal;
  const ranked = peers.map(x => [x.code, (x.counts[industry] || 0) / sum(x.counts)]).sort((a, b) => b[1] - a[1]);
  const rankInProvince = ranked.findIndex(([c]) => c === d.code) + 1;

  // Industry mix of the district: shares, specialisation versus the province, and diversity (normalised entropy).
  const mix = Object.keys(market.industries).map(code => {
    const count = d.counts[code] || 0;
    const share = count / districtTotal;
    const pShare = peers.reduce((n, x) => n + (x.counts[code] || 0), 0) / provinceTotal;
    const nShare = market.districts.reduce((n, x) => n + (x.counts[code] || 0), 0) / nationalTotal;
    return { code, name: market.industries[code], count, share, lq: pShare ? share / pShare : 0, nlq: nShare ? share / nShare : 0 };
  });
  const entropy = -mix.reduce((n, m) => n + (m.share > 0 ? m.share * Math.log(m.share) : 0), 0);
  const topIndustries = [...mix].sort((a, b) => b.share - a.share).slice(0, 3).map(m => ({ name: m.name, share: round(m.share) }));
  const specialized = mix.filter(m => m.lq >= 1.3 && m.share >= .02).sort((a, b) => b.lq - a.lq).slice(0, 3).map(m => ({ name: m.name, lq: round(m.lq, 2) }));

  const industryTable = mix.map(m => ({ code: m.code, name: m.name, count: m.count, share: round(m.share), locationQuotient: round(m.lq, 2), nationalLocationQuotient: round(m.nlq, 2) }));
  const relatedIndustries = (RELATED[industry] ?? []).map(code => industryTable.find(r => r.code === code)).filter(Boolean)
    .map(r => ({ name: r.name, locationQuotient: r.locationQuotient }));

  const candidates = candidateCodes.filter(c => c && c !== d.code).slice(0, 2).map(code => {
    const x = market.districts.find(y => y.code === code);
    if (!x) return null;
    const total = sum(x.counts);
    const xPeers = market.districts.filter(y => y.sido === x.sido);
    const xProvShare = xPeers.reduce((n, y) => n + (y.counts[industry] || 0), 0) / xPeers.reduce((n, y) => n + sum(y.counts), 0);
    const share = (x.counts[industry] || 0) / total;
    return { region: `${market.sidos[x.sido]} ${x.name}`, count: x.counts[industry] || 0, total, share: round(share), locationQuotient: round(share / xProvShare, 2) };
  }).filter(Boolean);

  return {
    region: `${market.sidos[d.sido]} ${d.name}`, industry: market.industries[industry],
    districtCount, districtTotal, provinceCount, provinceTotal, districtShare, provinceShare,
    nationalShare: round(nationalShare),
    locationQuotient: round(districtShare / provinceShare, 2),
    nationalLocationQuotient: round(districtShare / nationalShare, 2),
    rankInProvince, districtsInProvince: peers.length,
    scaleIndex: round(districtTotal / (provinceTotal / peers.length), 2),
    mixDiversity: round(entropy / Math.log(mix.length), 3),
    topIndustries, specialized, candidates, industryTable, relatedIndustries
  };
}

const NUMBERS = ['districtCount', 'districtTotal', 'provinceCount', 'provinceTotal', 'districtShare', 'provinceShare',
  'nationalShare', 'locationQuotient', 'nationalLocationQuotient', 'rankInProvince', 'districtsInProvince', 'scaleIndex', 'mixDiversity'];
const str = (v, max = 60) => typeof v === 'string' && v.length > 0 && v.length <= max;
const num = (v) => Number.isFinite(v) && v >= 0 && v < 1e8;

// Returns a clean copy with only known fields, or null when the shape is wrong.
export function sanitizeProfile(p) {
  if (!p || typeof p !== 'object' || !str(p.region) || !str(p.industry, 30)) return null;
  if (!NUMBERS.every(k => num(p[k])) || p.districtTotal === 0 || p.provinceTotal === 0) return null;
  const list = (v, n) => Array.isArray(v) && v.length <= n ? v : null;
  const top = list(p.topIndustries, 3), spec = list(p.specialized, 3), cand = list(p.candidates ?? [], 2);
  const table = list(p.industryTable, 12), rel = list(p.relatedIndustries ?? [], 3);
  if (!top || !spec || !cand || !table || !rel) return null;
  if (!table.every(x => /^[A-Z][0-9]$/.test(x?.code) && str(x.name, 30) && ['count', 'share', 'locationQuotient', 'nationalLocationQuotient'].every(k => num(x[k])))) return null;
  if (!rel.every(x => str(x?.name, 30) && num(x.locationQuotient))) return null;
  if (!top.every(x => str(x?.name, 30) && num(x.share)) || !spec.every(x => str(x?.name, 30) && num(x.lq))) return null;
  if (!cand.every(x => str(x?.region) && ['count', 'total', 'share', 'locationQuotient'].every(k => num(x[k])))) return null;
  const out = { region: p.region, industry: p.industry };
  NUMBERS.forEach(k => { out[k] = p[k]; });
  out.topIndustries = top.map(({ name, share }) => ({ name, share }));
  out.specialized = spec.map(({ name, lq }) => ({ name, lq }));
  out.industryTable = table.map(({ code, name, count, share, locationQuotient, nationalLocationQuotient }) => ({ code, name, count, share, locationQuotient, nationalLocationQuotient }));
  out.relatedIndustries = rel.map(({ name, locationQuotient }) => ({ name, locationQuotient }));
  out.candidates = cand.map(({ region, count, total, share, locationQuotient }) => ({ region, count, total, share, locationQuotient }));
  return out;
}
