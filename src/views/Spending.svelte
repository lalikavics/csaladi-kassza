<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { monthOf } from '../lib/ledger';
  import { GROUPS, categoryOf, groupColor, groupLabel, groupOf, leafLabel, type Group } from '../lib/categories';
  import { money, monthLabel, shiftMonth, today } from '../lib/format';
  import { open as openT, fadeIn } from '../lib/motion';

  type Scope = 'shared' | 'individual' | 'all';
  let scope = $state<Scope>('shared');
  let span = $state(12);
  let end = $state(monthOf(today()));
  /** kiválasztás: csoport ('g:home') vagy alkategória ('l:utilities') */
  let picked = $state<string | null>(null);
  let pickedMonth = $state<string | null>(null);
  let open = $state<Record<string, boolean>>({});
  /** egyéni nézetben: kinek a költései; 'both' = páros oszlopok */
  let person = $state<'both' | 'A' | 'B'>('both');
  const paired = $derived(scope === 'individual' && person === 'both');
  const people = $derived<('A' | 'B' | '*')[]>(paired ? ['A', 'B'] : ['*']);
  const initial = (p: 'A' | 'B') => {
    const a = (app.name('A').trim()[0] ?? 'A').toUpperCase(), b = (app.name('B').trim()[0] ?? 'B').toUpperCase();
    return a === b ? p : p === 'A' ? a : b; // azonos kezdőbetűnél A/B
  };

  const cur = $derived(app.settings.currency);
  const dark = $derived(app.themeResolved === 'dark');
  const hu = $derived(app.lang === 'hu');

  const monthsList = $derived(Array.from({ length: span }, (_, i) => shiftMonth(end, i - span + 1)));

  // hónap → alkategória → összeg
  const data = $derived.by(() => {
    const m = new Map<string, Map<string, number>>();
    for (const mo of monthsList) m.set(mo, new Map());
    for (const it of app.state.items.values()) {
      if (it.kind !== 'shared' && it.kind !== 'individual') continue;
      if (scope !== 'all' && it.kind !== scope) continue;
      if (scope === 'individual' && person !== 'both' && it.from !== person) continue;
      const row = m.get(monthOf(it.date));
      if (!row) continue;
      const c = categoryOf(it, app.state);
      const key = `${paired ? it.from : '*'}|${c}`;
      row.set(key, (row.get(key) ?? 0) + it.amount);
    }
    return m;
  });

  const inPick = (leaf: string) => !picked || (picked.startsWith('g:') ? groupOf(leaf).key === picked.slice(2) : leaf === picked.slice(2));
  const split = (k: string) => k.split('|') as ['A' | 'B' | '*', string];
  const val = (mo: string, test: (leaf: string) => boolean, who?: 'A' | 'B' | '*') => {
    let t = 0;
    for (const [k, v] of data.get(mo) ?? []) { const [p, leaf] = split(k); if (test(leaf) && (!who || p === who)) t += v; }
    return t;
  };
  const monthTotal = (mo: string) => val(mo, inPick);
  const maxVal = $derived(Math.max(1, ...monthsList.flatMap((mo) => people.map((p) => val(mo, inPick, p)))));

  const step = $derived.by(() => {
    const raw = maxVal / 3 / 100;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 2.5, 5, 10].find((x) => x * p >= raw)! * p * 100;
  });
  const top = $derived(Math.ceil(maxVal / step) * step);
  const ticks = $derived(Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step));
  const short = (v: number) => {
    const f = v / 100;
    return f >= 1e6 ? `${(f / 1e6).toLocaleString('hu-HU', { maximumFractionDigits: 1 })} M` : f >= 1000 ? `${Math.round(f / 1000)} e` : `${Math.round(f)}`;
  };

  const W = 360, H = 210, L = 40, R = 6, T = 8, B = 22;
  const pw = W - L - R, ph = H - T - B;
  const slot = $derived(pw / span);
  const bw = $derived(paired ? Math.max(3, Math.min(12, slot * 0.36)) : Math.max(4, Math.min(22, slot * 0.62)));
  const y = (v: number) => T + ph - (v / top) * ph;

  const bars = $derived(
    monthsList.map((mo, i) => {
      const cols = people.map((p, pi) => {
        let acc = 0;
        const segs: { g: Group; y: number; h: number }[] = [];
        for (const g of GROUPS) {
          const v = val(mo, (leaf) => groupOf(leaf).key === g.key && inPick(leaf), p);
          if (!v) continue;
          const y0 = y(acc), y1 = y(acc + v);
          segs.push({ g, y: y1, h: Math.max(0, y0 - y1) });
          acc += v;
        }
        const x = paired ? L + i * slot + slot / 2 + (pi === 0 ? -bw - 1 : 1) : L + i * slot + (slot - bw) / 2;
        return { p, x, segs, total: acc };
      });
      return { mo, cols, total: cols.reduce((a, c) => a + c.total, 0) };
    }),
  );

  const mShort = (mo: string) => new Intl.DateTimeFormat(hu ? 'hu-HU' : 'en-GB', { month: 'short' }).format(new Date(+mo.slice(0, 4), +mo.slice(5) - 1, 1)).replace('.', '');
  const labelEvery = $derived(span > 12 ? 3 : span > 6 ? 2 : 1);

  const listMonths = $derived(pickedMonth ? [pickedMonth] : monthsList);
  const leafTotals = $derived.by(() => {
    const t = new Map<string, number>();
    for (const mo of listMonths) for (const [k, v] of data.get(mo) ?? []) { const leaf = split(k)[1]; t.set(leaf, (t.get(leaf) ?? 0) + v); }
    return t;
  });
  /** személyenkénti összeg egy feltételre (páros nézethez) */
  const perPerson = (p: 'A' | 'B', test: (leaf: string) => boolean) => listMonths.reduce((a, mo) => a + val(mo, test, p), 0);
  const groupRows = $derived(
    GROUPS.map((g) => {
      const leaves = [...leafTotals].filter(([k]) => groupOf(k).key === g.key).sort((a, b) => b[1] - a[1]);
      return { g, v: leaves.reduce((s, [, v]) => s + v, 0), leaves };
    }).filter((r) => r.v > 0).sort((a, b) => b.v - a.v),
  );
  const grand = $derived(groupRows.reduce((s, r) => s + r.v, 0));
  const monthsWithData = $derived(monthsList.filter((mo) => val(mo, () => true) > 0).length || 1);
  const avg = (v: number) => money(Math.round(v / monthsWithData / 100) * 100, cur, app.lang);
  const pickedLabel = $derived(!picked ? '' : picked.startsWith('g:') ? groupLabel(GROUPS.find((g) => g.key === picked!.slice(2))!, app.lang) : leafLabel(picked.slice(2), app.lang));
  const toggle = (k: string) => (picked = picked === k ? null : k);
</script>

<div class="chips">
  {#each [['shared', 'Közös'], ['individual', 'Egyéni'], ['all', 'Mind']] as const as [k, l]}
    <button class="chip pill" class:on={scope === k} onclick={() => (scope = k)}>{hu ? l : { shared: 'Shared', individual: 'Personal', all: 'All' }[k]}</button>
  {/each}
</div>

{#if scope === 'individual'}
  <div class="seg" style="grid-template-columns:repeat(3,minmax(0,1fr))">
    <button class:on={person === 'both'} onclick={() => (person = 'both')}>{hu ? 'Mindkettő' : 'Both'}</button>
    <button class:on={person === 'A'} onclick={() => (person = 'A')}>{app.name('A')}</button>
    <button class:on={person === 'B'} onclick={() => (person = 'B')}>{app.name('B')}</button>
  </div>
{/if}

<div class="monthbar">
  <button class="iconbtn" aria-label="-" onclick={() => { end = shiftMonth(end, -span); pickedMonth = null; }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
  <div class="seg" style="grid-template-columns:repeat(3,minmax(0,1fr));flex:1">
    {#each [6, 12, 24] as n}<button class:on={span === n} onclick={() => { span = n; pickedMonth = null; }}>{n} {app.lang === 'hu' ? 'hó' : 'mo'}</button>{/each}
  </div>
  <button class="iconbtn" aria-label="+" onclick={() => { end = shiftMonth(end, span); pickedMonth = null; }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
</div>

<div class="card" style="padding:12px 8px 6px">
  <div class="tip" style="padding:0 8px 6px">{monthLabel(monthsList[0], app.lang)} – {monthLabel(end, app.lang)}{picked ? ` · ${pickedLabel}` : ''}</div>
  {#key scope + person + span + end + (picked ?? "")}<svg in:fadeIn viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="Havi költések kategóriánként">
    {#each ticks as t}
      <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" stroke-width="1" />
      <text x={L - 6} y={y(t) + 4} text-anchor="end" font-size="10" fill="var(--muted)">{short(t)}</text>
    {/each}
    {#each bars as b, i}
      <g role="button" tabindex="0" aria-label="{b.mo}: {money(b.total, cur, app.lang)}"
         onclick={() => (pickedMonth = pickedMonth === b.mo ? null : b.mo)}
         onkeydown={(e) => e.key === 'Enter' && (pickedMonth = pickedMonth === b.mo ? null : b.mo)}
         style="cursor:pointer;outline:none" opacity={pickedMonth && pickedMonth !== b.mo ? 0.35 : 1}>
        <rect x={L + i * slot} y={T} width={slot} height={ph} fill="transparent" />
        {#each b.cols as c}
          {#each c.segs as s, j}
            <rect x={c.x} y={s.y + (j === c.segs.length - 1 ? 0 : 1)} width={bw} height={Math.max(0, s.h - (j === c.segs.length - 1 ? 0 : 2))} rx={j === c.segs.length - 1 ? 2 : 0} fill={groupColor(s.g, dark)} class="bar" style="animation-delay:{i * 18}ms" />
          {/each}
          {#if paired && c.total > 0 && c.p !== '*'}
            <text x={c.x + bw / 2} y={y(c.total) - 3} text-anchor="middle" font-size="8" font-weight="700" fill="var(--muted)">{initial(c.p)}</text>
          {/if}
        {/each}
      </g>
      {#if i % labelEvery === (span - 1) % labelEvery}
        <text x={L + i * slot + slot / 2} y={H - 6} text-anchor="middle" font-size="10" fill={pickedMonth === b.mo ? 'var(--ink)' : 'var(--muted)'} font-weight={pickedMonth === b.mo ? 700 : 400}>{mShort(b.mo)}</text>
      {/if}
    {/each}
  </svg>{/key}
  <div class="tip" style="padding:2px 8px 6px">{pickedMonth ? `${monthLabel(pickedMonth, app.lang)}: ${money(monthTotal(pickedMonth), cur, app.lang)} · ${app.lang === 'hu' ? 'koppints újra a teljes időszakhoz' : 'tap again for the whole range'}` : app.lang === 'hu' ? 'Koppints egy oszlopra a hónap bontásához, egy kategóriára a szűréshez.' : 'Tap a bar for that month, a category to filter.'}</div>
</div>

<div class="rows">
  <div class="row" style="font-size:13px;color:var(--muted)"><span>{pickedMonth ? monthLabel(pickedMonth, app.lang) : hu ? `Összesen (${span} hó)` : `Total (${span} mo)`}</span><span>{paired ? `${initial('A')} = ${app.name('A')} · ${initial('B')} = ${app.name('B')}` : pickedMonth ? '' : hu ? 'átlag / hó' : 'avg / mo'}</span></div>
  {#each groupRows as r (r.g.key)}
    {@const multi = r.leaves.length > 1}
    <div style="display:flex;border-bottom:1px solid var(--line)" class:dimrow={!!picked && !picked.endsWith(':' + r.g.key) && !r.leaves.some(([k]) => picked === 'l:' + k)}>
      <button class="catrow" style="border:0;flex:1" class:on={picked === 'g:' + r.g.key} onclick={() => toggle('g:' + r.g.key)}>
        <span class="dot" style="background:{groupColor(r.g, dark)}"></span>
        <span style="flex:1">{groupLabel(r.g, app.lang)} <span class="tip">{grand ? Math.round((r.v / grand) * 100) : 0}%</span></span>
        {#if paired}
          <span style="text-align:right;font-size:13px">{#each ['A', 'B'] as const as p}<span style="display:block"><span class="tip">{initial(p)}</span> <span class="num">{money(perPerson(p, (l) => groupOf(l).key === r.g.key), cur, app.lang)}</span></span>{/each}</span>
        {:else}
          <span style="text-align:right"><span class="num">{money(r.v, cur, app.lang)}</span>{#if !pickedMonth}<br /><span class="tip">{avg(r.v)}</span>{/if}</span>
        {/if}
      </button>
      {#if multi}
        <button class="iconbtn" style="border:0;background:transparent;align-self:center;margin-right:4px" aria-expanded={!!open[r.g.key]} aria-label={hu ? 'Bontás' : 'Breakdown'} onclick={() => (open[r.g.key] = !open[r.g.key])}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" class="chev" style="transform:rotate({open[r.g.key] ? 180 : 0}deg)"><path d="M6 9l6 6 6-6"/></svg>
        </button>
      {/if}
    </div>
    {#if multi && open[r.g.key]}
      <div transition:openT>
      {#each r.leaves as [k, v] (k)}
        <button class="catrow" style="padding-left:36px;font-size:13px" class:on={picked === 'l:' + k} onclick={() => toggle('l:' + k)}>
          <span style="flex:1">{leafLabel(k, app.lang)}</span>
          {#if paired}
            <span style="text-align:right">{#each ['A', 'B'] as const as p}<span style="display:block"><span class="tip">{initial(p)}</span> <span class="num">{money(perPerson(p, (l) => l === k), cur, app.lang)}</span></span>{/each}</span>
          {:else}
            <span style="text-align:right"><span class="num">{money(v, cur, app.lang)}</span>{#if !pickedMonth}<br /><span class="tip">{avg(v)}</span>{/if}</span>
          {/if}
        </button>
      {/each}
      </div>
    {/if}
  {:else}
    <div class="row tip">{app.t('noItems')}</div>
  {/each}
  {#if grand}
    <div class="row"><b>{hu ? 'Mindösszesen' : 'Total'}</b>
      {#if paired}
        <span style="text-align:right">{#each ['A', 'B'] as const as p}<span style="display:block"><span class="tip">{app.name(p)}</span> <span class="num">{money(perPerson(p, () => true), cur, app.lang)}</span></span>{/each}</span>
      {:else}<span class="num">{money(grand, cur, app.lang)}</span>{/if}
    </div>
  {/if}
</div>
<p class="small" style="margin:0">{hu ? 'A közös költéseknél a teljes összeg számít. A nyíllal lenyithatod a csoportot, egy sorra koppintva szűrsz.' : 'Shared expenses count in full. Use the arrow to expand a group, tap a row to filter.'}</p>
