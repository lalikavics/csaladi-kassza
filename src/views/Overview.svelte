<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { balanceRaw, monthOf, monthReport, toMinor } from '../lib/ledger';
  import { dueReminders, upcoming as upcomingOf } from '../lib/reminders';
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { ms, open as openT } from '../lib/motion';
  const shown = new Tween(0, { duration: ms(600), easing: cubicOut });
  $effect(() => { shown.target = bal; });
  import { categoryOf, groupColor, groupOf } from '../lib/categories';
  import { money, monthLabel, shiftMonth, today } from '../lib/format';

  let { go }: { go: (h: string) => void } = $props();
  const cur = app.settings.currency;
  const bal = $derived(toMinor(balanceRaw(app.state)));
  const thisMonth = monthOf(today());
  const rep = $derived(monthReport(app.state, thisMonth));
  const prev = shiftMonth(thisMonth, -1);
  const prevState = $derived(app.state.months.get(prev));
  const prevHasItems = $derived([...app.state.items.values()].some((i) => monthOf(i.date) === prev && i.kind !== 'individual'));
  const upcoming = $derived(upcomingOf(app.state, today()).slice(0, 5));
  const due = $derived(dueReminders(app.state, today()).filter((d) => !app.settings.dismissed.includes(d.id)));
  const hu = $derived(app.lang === 'hu');
  const leftText = (n: number) => (n === 0 ? (hu ? 'ma esedékes' : 'due today') : hu ? `${n} nap múlva` : `in ${n} days`);
  function dismiss(id: string) { app.settings.dismissed = [...app.settings.dismissed, id].slice(-300); app.saveSettings(); }
  const sharedThisMonth = $derived([...app.state.items.values()].filter((i) => i.kind === 'shared' && monthOf(i.date) === thisMonth).reduce((s, i) => s + i.amount, 0));
  const dot = (it: import('../lib/ledger').Item) => (it.kind === 'shared' || it.kind === 'individual' ? groupColor(groupOf(categoryOf(it, app.state)), app.themeResolved === 'dark') : 'var(--muted)');
  const recent = $derived([...app.state.items.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 4));
</script>

<div class="head">
  <div><div class="small">{monthLabel(thisMonth, app.lang)} · <span class="badge" title={__BUILD__}>{app.shared ? (app.lang === 'hu' ? 'Közös' : 'Shared') : (app.lang === 'hu' ? 'Helyi' : 'Local')}</span></div><h1>{app.t('overview')}</h1></div>
</div>

{#if due.length}
  <div class="rows" style="border-color:var(--warn-ink)">
    <div class="row small" style="color:var(--warn-ink)">{hu ? 'Emlékeztetők' : 'Reminders'}</div>
    {#each due as d (d.id)}
      <div class="row" out:openT>
        <span style="display:flex;gap:10px;align-items:center"><span class="dot" style="background:{dot(d.item)}"></span><span>{d.item.note || app.d.kinds[d.item.kind]}<br /><span class="small">{d.item.date} · {leftText(d.daysLeft)}</span></span></span>
        <span style="display:flex;align-items:center;gap:4px"><span class="num">{money(d.item.amount, cur, app.lang)}</span>
          <button class="iconbtn" style="border:0;background:transparent;width:36px;height:36px" aria-label={hu ? 'Elrejtés' : 'Dismiss'} onclick={() => dismiss(d.id)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>
      </div>
    {/each}
  </div>
{/if}

<div class="hero">
  <span class="lbl">{app.t('balance')}</span>
  {#if bal === 0}
    <span class="big">{app.t('even')}</span>
  {:else}
    <span class="big">{app.t('owes', { x: bal > 0 ? app.name('B') : app.name('A'), amt: money(Math.round(Math.abs(shown.current)), cur, app.lang) })}</span>
    <span class="lbl">{app.t('toWhom', { y: bal > 0 ? app.name('A') : app.name('B') })}</span>
  {/if}
  <button class="btn light" style="margin-top:10px;min-height:44px;font-size:15px" onclick={() => go('rendezes')}>{app.t('recordSettlement')}</button>
</div>

<div class="card" style="display:flex;justify-content:space-between;align-items:center">
  <span class="small">{app.lang === 'hu' ? 'Közös költés ebben a hónapban' : 'Shared spending this month'}</span><b class="num" style="font-size:18px">{money(sharedThisMonth, cur, app.lang)}</b>
</div>

<div class="grid2">
  {#each ['A', 'B'] as const as p}
    <div class="card"><div class="small">{app.t('individualMonth', { x: app.name(p) })}</div><div class="num" style="font-size:18px">{money(rep.individual[p], cur, app.lang)}</div></div>
  {/each}
</div>

{#if prevHasItems && !prevState?.closed}
  <button class="card" style="text-align:left;cursor:pointer;border-color:var(--field)" onclick={() => go('kimutatas')}>
    <b>{app.t('closeHint', { m: monthLabel(prev, app.lang) })}</b>
    {#if prevState?.approvedBy.length}<div class="small">{app.t('closeHintSub', { x: prevState.approvedBy.map(app.name).join(', ') })}</div>{/if}
  </button>
{/if}

{#if upcoming.length}
  <div class="rows">
    <div class="row small">{hu ? 'Közelgő tételek (45 nap)' : 'Upcoming (45 days)'}</div>
    {#each upcoming as it}
      <div class="row"><span style="display:flex;gap:10px;align-items:center"><span class="dot" style="background:{dot(it)}"></span><span>{it.note || app.d.kinds[it.kind]}{it.rule ? ' ↻' : ''}<br /><span class="small">{it.date}</span></span></span><span class="num">{money(it.amount, cur, app.lang)}</span></div>
    {/each}
  </div>
{/if}

{#if recent.length}
  <div class="rows">
    {#each recent as it}
      <div class="row"><span style="display:flex;gap:10px;align-items:flex-start"><span class="dot" style="margin-top:6px;background:{dot(it)}"></span><span><b style="font-weight:600">{it.note || app.d.kinds[it.kind]}</b><br /><span class="small">{app.d.kinds[it.kind]} · {app.name(it.from)} · {it.date}</span></span></span><span class="num">{money(it.amount, cur, app.lang)}</span></div>
    {/each}
  </div>
{:else}
  <div class="card small">{app.t('noItems')}</div>
{/if}

{#if !app.shared}<div class="warn">{app.t('storageWarn')}</div>{/if}
