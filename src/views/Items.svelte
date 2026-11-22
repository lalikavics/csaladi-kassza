<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { monthOf, normNote, type Item, type Person } from '../lib/ledger';
  import { money, monthLabel, shiftMonth } from '../lib/format';
  import { categoryOf, groupColor, groupOf, leafLabel } from '../lib/categories';
  import { monthIn, open as openT } from '../lib/motion';
  let dir = $state(1);
  const step = (n: number) => { dir = n; v.month = shiftMonth(v.month, n); };

  let { open }: { open: (it: Item) => void } = $props();
  const cur = $derived(app.settings.currency);
  const hu = $derived(app.lang === 'hu');
  import { itemsView as v } from '../lib/viewstate.svelte';

  const showOrig = (i: Item) => { if (!i.orig) return false; const a = normNote(i.orig), b = normNote(i.note); return !!a && !a.startsWith(b) && !b.startsWith(a); };
  const match = (i: Item) => v.filter === 'all' || i.kind === v.filter || (v.filter === 'transfer' && i.kind === 'settlement');
  const byDate = (a: Item, b: Item) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const list = $derived(
    [...app.state.items.values()]
      .filter((i) => (v.q ? (i.note + ' ' + (i.orig ?? '') + ' ' + app.d.kinds[i.kind]).toLowerCase().includes(v.q.toLowerCase()) : monthOf(i.date) === v.month) && match(i))
      .sort(byDate),
  );
  const sum = (xs: Item[]) => xs.reduce((s, i) => s + i.amount, 0);
  const sections = $derived.by(() => {
    const shared = list.filter((i) => i.kind === 'shared');
    const indiv = list.filter((i) => i.kind === 'individual');
    const moves = list.filter((i) => i.kind !== 'shared' && i.kind !== 'individual');
    return [
      { key: 'shared', title: hu ? 'Közös költések' : 'Shared expenses', items: shared, total: money(sum(shared), cur, app.lang) },
      { key: 'indiv', title: hu ? 'Egyéni költések' : 'Personal expenses', items: indiv,
        total: (['A', 'B'] as Person[]).map((p) => `${initial(p)}: ${money(sum(indiv.filter((i) => i.from === p)), cur, app.lang)}`).join(' · ') },
      { key: 'moves', title: hu ? 'Pénzmozgás köztetek' : 'Money between you', items: moves, total: '' },
    ].filter((s) => s.items.length);
  });
  const closed = $derived(!!app.state.months.get(v.month)?.closed);
  const initial = (p: Person) => {
    const a = (app.name('A').trim()[0] ?? 'A').toUpperCase(), b = (app.name('B').trim()[0] ?? 'B').toUpperCase();
    return a === b ? p : p === 'A' ? a : b;
  };
  const sub = (i: Item, c: string) => {
    const parts: string[] = [];
    if (c) parts.push(leafLabel(c, app.lang));
    if (i.kind === 'shared') parts.push((hu ? 'fizette: ' : 'paid by ') + app.name(i.from));
    if (i.kind === 'transfer' || i.kind === 'settlement' || i.kind === 'opening') parts.push(app.d.kinds[i.kind]);
    if (i.currency) parts.push(`${(i.origAmount! / 100).toLocaleString('hu-HU')} ${i.currency}`);
    parts.push(v.q ? i.date : i.date.slice(5));
    return parts.join(' · ');
  };
</script>

{#snippet person(x: number, fill: string)}
  <circle cx={x} cy="5" r="3" fill={fill} /><path d="M{x - 5} 15c0-3.3 2.2-5.5 5-5.5s5 2.2 5 5.5z" fill={fill} />
{/snippet}

{#snippet badge(it: Item)}
  {#if it.kind === 'shared'}
    <svg width="24" height="16" viewBox="0 0 24 16" role="img" aria-label={hu ? 'közös' : 'shared'}>{@render person(8, 'var(--muted)')}{@render person(16, 'var(--ink)')}</svg>
  {:else if it.kind === 'individual'}
    <span style="display:inline-flex;align-items:center;gap:2px" aria-label={(hu ? 'egyéni: ' : 'personal: ') + app.name(it.from)}>
      <svg width="12" height="16" viewBox="1 0 12 16" aria-hidden="true">{@render person(6, 'var(--muted)')}</svg>
      <b style="font-size:11px;color:var(--muted)">{initial(it.from)}</b>
    </span>
  {:else}
    <span style="font-size:11px;font-weight:700;color:var(--muted)">{initial(it.from)} → {initial(app.other(it.from))}</span>
  {/if}
{/snippet}

{#snippet row(it: Item)}
  {@const exp = it.kind === 'shared' || it.kind === 'individual'}
  {@const c = exp ? categoryOf(it, app.state) : ''}
  <button class="item" onclick={() => open(it)} style="align-items:flex-start">
    <span class="dot" style="margin-top:6px;background:{exp ? groupColor(groupOf(c), app.themeResolved === 'dark') : 'transparent'};border:{exp ? '0' : '1.5px solid var(--muted)'}" aria-hidden="true"></span>
    <span style="flex:1;min-width:0"><span class="t">{it.note || app.d.kinds[it.kind]}{it.rule ? ' ↻' : ''}{#if showOrig(it)}<span class="tip" style="font-weight:400"> · {it.orig}</span>{/if}</span><span class="s">{sub(it, c)}</span></span>
    <span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><span class="num">{money(it.amount, cur, app.lang)}</span>{@render badge(it)}</span>
  </button>
{/snippet}

<h1>{app.t('items')}</h1>
<div class="monthbar">
  <button class="iconbtn" aria-label="-1" onclick={() => step(-1)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
  <b>{monthLabel(v.month, app.lang)}{closed ? ` · ${app.t('closed')}` : ''}</b>
  <button class="iconbtn" aria-label="+1" onclick={() => step(1)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
</div>
<input class="in" type="search" bind:value={v.q} placeholder={hu ? 'Keresés minden hónapban (pl. Lidl)' : 'Search all months'} aria-label={hu ? 'Keresés' : 'Search'} />
<div class="chips">
  <button class="chip pill" class:on={v.filter === 'all'} onclick={() => (v.filter = 'all')}>{app.t('all')}</button>
  <button class="chip pill" class:on={v.filter === 'shared'} onclick={() => (v.filter = 'shared')}>{hu ? 'Közös' : 'Shared'}</button>
  <button class="chip pill" class:on={v.filter === 'individual'} onclick={() => (v.filter = 'individual')}>{hu ? 'Egyéni' : 'Personal'}</button>
  <button class="chip pill" class:on={v.filter === 'transfer'} onclick={() => (v.filter = 'transfer')}>{hu ? 'Pénzmozgás' : 'Transfers'}</button>
</div>

{#key v.month + '|' + v.filter + '|' + (v.q ? 'q' : '')}<div class="view" in:monthIn={{ dir }}>
{#if !list.length}
  <div class="card small">{app.t('empty')}</div>
{:else if v.q}
  <div class="rows">{#each list as it (it.id)}{@render row(it)}{/each}</div>
  <p class="small" style="margin:0">{list.length} {hu ? 'találat' : 'results'}</p>
{:else}
  {#each sections as s, si (s.key)}
    <div style="display:flex;flex-direction:column;gap:6px;{si > 0 ? 'margin-top:10px' : ''}">
      <button class="head" style="background:none;border:0;padding:0 4px;cursor:pointer;color:var(--ink);min-height:32px" aria-expanded={!v.collapsed[s.key]} onclick={() => (v.collapsed[s.key] = !v.collapsed[s.key])}>
        <span style="display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true" class="chev" style="transform:rotate({v.collapsed[s.key] ? -90 : 0}deg)"><path d="M6 9l6 6 6-6"/></svg>
          {s.title} <span class="tip" style="font-weight:400">({s.items.length})</span>
        </span>
        <span class="tip num" style="font-weight:600">{s.total}</span>
      </button>
      {#if !v.collapsed[s.key]}
        <div class="rows" transition:openT>{#each s.items as it (it.id)}{@render row(it)}{/each}</div>
      {/if}
    </div>
  {/each}
{/if}
</div>{/key}
