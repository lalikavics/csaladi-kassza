<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { monthOf, monthReport, toMinor } from '../lib/ledger';
  import { money, monthLabel, shiftMonth, today } from '../lib/format';
  import Spending from './Spending.svelte';
  import { monthIn, viewIn } from '../lib/motion';
  let dir = $state(-1);
  let tab = $state<'spend' | 'close'>('spend');

  const cur = app.settings.currency;
  let month = $state(shiftMonth(monthOf(today()), -1));
  let error = $state('');
  const r = $derived(monthReport(app.state, month));
  const ms = $derived(app.state.months.get(month) ?? { approvedBy: [], closed: false, reopenBy: [] });
  const me = $derived(app.settings.me);
  const signed = (raw: number) => {
    const v = toMinor(raw);
    return (v > 0 ? '+' : v < 0 ? '−' : '') + money(Math.abs(v), cur, app.lang);
  };
  const who = (raw: number) => {
    const v = toMinor(raw);
    return v === 0 ? '' : ` (${app.t('owes', { x: v > 0 ? app.name('B') : app.name('A'), amt: '' }).replace(/:\s*$/, '')})`;
  };
  function act(fn: () => string | null) { error = fn() ?? ''; }
</script>

<h1>{app.t('report')}</h1>
<div class="seg"><button class:on={tab === 'spend'} onclick={() => (tab = 'spend')}>{app.lang === 'hu' ? 'Költések' : 'Spending'}</button><button class:on={tab === 'close'} onclick={() => (tab = 'close')}>{app.lang === 'hu' ? 'Havi zárás' : 'Month close'}</button></div>
{#key tab}<div class="view" in:viewIn>
{#if tab === 'spend'}
<Spending />
{:else}
<div><div class="small">{app.t('monthReport')}</div><h2 style="font-size:20px">{monthLabel(month, app.lang)}</h2></div>
<div class="monthbar">
  <button class="iconbtn" aria-label="-1" onclick={() => { dir = -1; month = shiftMonth(month, -1); }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
  <span class="small">{r.count} tétel</span>
  <button class="iconbtn" aria-label="+1" onclick={() => { dir = 1; month = shiftMonth(month, 1); }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
</div>

{#key month}<div class="rows" in:monthIn={{ dir }}>
  <div class="row"><span>{app.t('opening')}{who(r.opening)}</span><span class="num">{money(Math.abs(toMinor(r.opening)), cur, app.lang)}</span></div>
  <div class="row"><span>{app.t('sharedEffect')}</span><span class="num">{signed(r.shared)}</span></div>
  <div class="row"><span>{app.t('transfers')}</span><span class="num">{signed(r.transfers)}</span></div>
  <div class="row"><span>{app.t('settlements')}</span><span class="num">{signed(r.settlements)}</span></div>
  <div class="row" style="background:var(--bg)"><b>{app.t('closing')}{who(r.closing)}</b><span class="num" style="font-weight:700">{money(Math.abs(toMinor(r.closing)), cur, app.lang)}</span></div>
</div>{/key}
<p class="small" style="margin:0">+ : {app.name('B')} → {app.name('A')} irányba nő a tartozás. {app.d.kinds.individual}: {app.name('A')} {money(r.individual.A, cur, app.lang)}, {app.name('B')} {money(r.individual.B, cur, app.lang)}.</p>

<div class="card" style="display:flex;flex-direction:column;gap:10px">
  <h2>{ms.closed ? app.t('closed') : app.t('closeApproval')}</h2>
  {#each ['A', 'B'] as const as p}
    <div class="head" style="font-size:14px"><span>{app.name(p)}</span><b>{ms.closed || ms.approvedBy.includes(p) ? app.t('approved') : app.t('notYet')}</b></div>
  {/each}
  {#if ms.reopenBy.length}<div class="small">{app.t('reopenWait', { x: ms.reopenBy.map(app.name).join(', ') })}</div>{/if}
  <div class="small">{app.t('closeNote')}</div>
</div>
{#if error}<div class="warn" role="alert">{error}</div>{/if}
{#if !ms.closed}
  {#if ms.approvedBy.includes(me)}
    <button class="btn ghost" onclick={() => act(() => app.reopen(month))}>{app.t('withdraw')}</button>
  {:else}
    <button class="btn" onclick={() => act(() => app.approve(month))}>{app.t('approve')} ({app.name(me)})</button>
  {/if}
{:else if !ms.reopenBy.includes(me)}
  <button class="btn ghost" onclick={() => act(() => app.reopen(month))}>{app.t('reopen')} ({app.name(me)})</button>
{/if}
{/if}
</div>{/key}
