// Turns JEV's per-criterion answers into things an analyst can act on:
// a weighted composite (with uncertainty from JEV's probabilities), an industry ranking,
// and a cross-check of each judgement against a simple, visible rule on the raw numbers.
import { CRITERIA, scanKey } from './jev-questions.mjs';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Mean and spread of a score answer. Spread comes from JEV's level probabilities when present.
export function scoreStats(ans) {
  const score = Number(ans?.score);
  if (!Number.isFinite(score)) return null;
  const probs = Object.entries(ans.probabilities ?? {}).map(([k, v]) => [Number(k), Number(v)]).filter(([k, v]) => Number.isFinite(k) && Number.isFinite(v));
  const total = probs.reduce((n, [, p]) => n + p, 0);
  if (!probs.length || total <= 0) return { score, sd: null };
  const mean = probs.reduce((n, [k, p]) => n + k * p, 0) / total;
  return { score, sd: Math.sqrt(probs.reduce((n, [k, p]) => n + p * (k - mean) ** 2, 0) / total) };
}

export const DEFAULT_WEIGHTS = { competition_pressure: 2, supply_gap: 2, demand_signal: 2, market_scale: 1, mix_stability: 1, industry_fit: 2 };

// Field-visit attractiveness on 0~1: each criterion is normalised to 0~1 (competition inverted) and weighted.
export function composite(answers, weights = DEFAULT_WEIGHTS) {
  let wSum = 0, value = 0, varSum = 0, missingSd = false;
  const parts = [];
  for (const c of CRITERIA) {
    if (!c.direction) continue;
    const w = Number(weights[c.key] ?? 0);
    const st = scoreStats(answers[c.key]);
    if (!st || w <= 0) continue;
    const norm = c.direction > 0 ? st.score / 4 : 1 - st.score / 4;
    wSum += w; value += w * norm;
    if (st.sd == null) missingSd = true; else varSum += (w * st.sd / 4) ** 2;
    parts.push({ key: c.key, name: c.name, weight: w, norm });
  }
  if (!wSum) return null;
  return { value: value / wSum, sd: missingSd ? null : Math.sqrt(varSum) / wSum, parts };
}

export function scanRanking(profile, answers) {
  return profile.industryTable.map(r => ({ ...r, ...(scoreStats(answers[scanKey(r.code)]) ?? { score: null, sd: null }) }))
    .filter(r => r.score != null).sort((a, b) => b.score - a.score);
}

// Simple baselines from the raw numbers. A disagreement is not an error; it marks where to look again.
export function expectedScores(p) {
  const rankPos = 1 - (p.rankInProvince - 1) / Math.max(1, p.districtsInProvince - 1);
  const rel = p.relatedIndustries.length ? p.relatedIndustries.reduce((n, r) => n + r.locationQuotient, 0) / p.relatedIndustries.length : 1;
  const c = p.districtCount;
  return {
    competition_pressure: { value: clamp(2 + (p.locationQuotient - 1) * 4 + (rankPos - .5) * 1.5, 0, 4), basis: `입지계수 ${p.locationQuotient}, 시도 안 ${p.rankInProvince}위/${p.districtsInProvince}곳` },
    supply_gap: { value: clamp(2 + (1 - p.locationQuotient) * 4 + (p.scaleIndex - 1), 0, 4), basis: `입지계수 ${p.locationQuotient}, 규모 지수 ${p.scaleIndex}` },
    demand_signal: { value: clamp(2 + (rel - 1) * 3, 0, 4), basis: `연관 업종 평균 입지계수 ${rel.toFixed(2)}` },
    market_scale: { value: clamp(2 + (p.scaleIndex - 1) * 2, 0, 4), basis: `규모 지수 ${p.scaleIndex}` },
    mix_stability: { value: clamp((p.mixDiversity - .6) / .35 * 4, 0, 4), basis: `업종 다양성 ${p.mixDiversity}` },
    data_confidence: { value: c >= 300 ? 4 : c >= 100 ? 3 : c >= 30 ? 2 : c >= 10 ? 1 : 0, basis: `선택 업종 점포 ${c.toLocaleString('ko-KR')}곳` }
  };
}

export function crossCheck(profile, answers) {
  const exp = expectedScores(profile);
  const rows = [];
  for (const c of CRITERIA) {
    const st = scoreStats(answers[c.key]);
    if (!st) continue;
    const e = exp[c.key];
    if (!e) { rows.push({ key: c.key, name: c.name, jev: st.score, expected: null, basis: '정성 판단 기준(규칙 없음)', status: 'info' }); continue; }
    const gap = st.score - e.value;
    rows.push({ key: c.key, name: c.name, jev: st.score, expected: e.value, basis: e.basis, status: Math.abs(gap) <= 1.2 ? 'agree' : 'check', gap });
  }
  const mp = answers.market_pattern?.choice;
  if (mp) {
    const lq = profile.locationQuotient;
    const expect = lq > 1.15 ? 'crowded' : lq < .85 ? 'relatively_sparse' : 'mixed';
    rows.push({ key: 'market_pattern', name: '상권 특성', jev: mp, expected: expect, basis: `입지계수 ${lq} 기준 규칙`, status: mp === expect ? 'agree' : 'check' });
  }
  return rows;
}
