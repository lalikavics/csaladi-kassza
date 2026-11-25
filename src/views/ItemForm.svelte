<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { convert, newId, type Freq, type Item, type Kind, type Person, type RulePatch } from '../lib/ledger';
  import { GROUPS, groupColor, groupOf, guessCategory, leafLabel, suggestions, type Suggestion } from '../lib/categories';
  import { CURRENCIES, money, parseAmount, parseRate, shiftMonth, today } from '../lib/format';
  import { itemsView } from '../lib/viewstate.svelte';
  import { normNote } from '../lib/ledger';
  import { sameAmountInMonth } from '../lib/dateFromNote';

  let { edit = null, preset = null, month = null, done }: { edit?: Item | null; preset?: Kind | null; month?: string | null; done: () => void } = $props();

  const base = app.settings.currency;
  const src = edit;
  const occ = !!src?.rule; // ismétlődő tétel egy előfordulása
  const rule = occ ? app.state.rules.get(src!.rule!) : undefined;

  let kind = $state<Kind>(src?.kind ?? preset ?? 'shared');
  let from = $state<Person>(src?.from ?? app.settings.me);
  let pctA = $state((src?.shareA ?? app.settings.shareA) / 100);
  let showSplit = $state(!!src && (src.shareA ?? 5000) !== app.settings.shareA);
  let note = $state(src?.note ?? '');
  // új tételnél: a Tételek lapon kiválasztott hónap; sorozatos bevitelnél az előző tétel napja
  const startDate = () => {
    const t = today(), m = month ?? t.slice(0, 7), last = itemsView.lastDate;
    if (last && last.slice(0, 7) === m) return last;
    return m === t.slice(0, 7) ? t : `${m}-01`;
  };
  let date = $state(src?.date ?? startDate());
  const daysInMonth = (m: string) => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
  function stepMonth(n: number) {
    const m = shiftMonth((date || today()).slice(0, 7), n);
    const d = date || today();
    date = `${m}-${String(Math.min(+d.slice(8, 10) || 1, daysInMonth(m))).padStart(2, '0')}`;
  }
  let foreign = $state(!!src?.currency && src.currency !== base);
  let cur = $state(src?.currency && src.currency !== base ? src.currency : base === 'EUR' ? 'HUF' : 'EUR');
  const fmt = (m: number) => (m / 100).toLocaleString('hu-HU', { maximumFractionDigits: 2 }).replace(/ /g, ' ');
  let amountText = $state(src ? fmt(foreign ? src.origAmount ?? src.amount : src.amount) : '');
  let rateText = $state(src?.rate ? String(src.rate).replace('.', ',') : '');
  let catPicked = $state<string>(src?.category ?? '');
  let recurring = $state(false);
  let freq = $state<Freq>('monthly');
  let remind = $state<number>(src?.remind ?? 0);
  let scope = $state<'month' | 'forward'>('forward');
  let error = $state('');
  let askDelete = $state(false);
  let noteFocus = $state(false);
  // azonos összegű tétel ugyanabban a hónapban: figyelmeztetés, mentéskor rákérdezés
  let dupAsked = $state('');

  const isExpense = $derived(kind === 'shared' || kind === 'individual');
  const autoCat = $derived(app.state.learned.get(normNote(note)) ?? guessCategory(note));
  const entered = $derived(parseAmount(amountText));
  const rate = $derived(parseRate(rateText));
  const finalAmount = $derived(entered == null ? null : foreign ? (rate ? convert(entered, rate) : null) : entered);
  const dupes = $derived(finalAmount && !occ ? sameAmountInMonth(app.state.items.values(), date, finalAmount, src?.id) : []);
  const dupKey = $derived(`${date}|${finalAmount}`);
  const fmtDate = (d: string) => new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)).toLocaleDateString(app.lang === 'hu' ? 'hu-HU' : 'en-GB', { month: 'short', day: 'numeric' });
  const fromLabel = $derived(isExpense ? app.t('whoPaid') : app.t('whoGave'));
  const hu = $derived(app.lang === 'hu');
  const FREQS: [Freq, string, string][] = [['weekly', 'Heti', 'Weekly'], ['monthly', 'Havi', 'Monthly'], ['quarterly', 'Negyedéves', 'Quarterly'], ['yearly', 'Éves', 'Yearly']];
  const REMINDS: [number, string, string][] = [[0, 'Nincs', 'None'], [1, '1 nappal előtte', '1 day before'], [3, '3 nappal előtte', '3 days before'], [7, '1 héttel előtte', '1 week before'], [14, '2 héttel előtte', '2 weeks before'], [30, '1 hónappal előtte', '1 month before']];
  const WD = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];
  const freqText = $derived.by(() => {
    const d = +date.slice(8, 10), mo = +date.slice(5, 7);
    const wd = WD[new Date(+date.slice(0, 4), mo - 1, d).getDay()];
    const t = { weekly: `Minden héten (${wd}) megjelenik.`, monthly: `Minden hónap ${d}. napján megjelenik.`, quarterly: `Háromhavonta, ${d}-án/én megjelenik.`, yearly: `Minden évben ${mo}. hó ${d}-án/én megjelenik.` }[freq];
    return hu ? `${t} Az összeg később módosítható, visszamenőleg nem változik.` : 'Appears automatically; later changes never alter past occurrences.';
  });

  const allSugg = $derived(suggestions(app.state));
  const sugg = $derived.by(() => {
    if (!isExpense || !noteFocus) return [] as Suggestion[];
    const q = normNote(note);
    const list = q ? [...allSugg.filter((x) => x.key.startsWith(q)), ...allSugg.filter((x) => !x.key.startsWith(q) && x.key.includes(q))] : allSugg;
    // ha már választottál kategóriát, az abba tartozók előre kerülnek (de a többi is látszik)
    const ranked = catPicked ? [...list.filter((x) => x.category === catPicked), ...list.filter((x) => x.category !== catPicked)] : list;
    return ranked.slice(0, 6);
  });
  // a javaslat csak a nevet (és üres kategóriánál a kategóriát) tölti ki; a típust (közös/egyéni) soha nem írja át
  function pickSugg(x: Suggestion) {
    note = x.label;
    if (!catPicked) catPicked = x.category;
    noteFocus = false;
  }
  const fullDate = (d: string) => new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)).toLocaleDateString(app.lang === 'hu' ? 'hu-HU' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  let dateInput: HTMLInputElement | undefined = $state();
  function openPicker() { try { dateInput?.showPicker(); } catch { dateInput?.focus(); } }

  function save(force = false) {
    if (!finalAmount || finalAmount <= 0) { error = hu ? 'Add meg az összeget.' : 'Enter an amount.'; return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { error = hu ? 'Válassz dátumot.' : 'Pick a date.'; return; }
    const amountChanged = !src || src.amount !== finalAmount || src.date.slice(0, 7) !== date.slice(0, 7);
    if (!force && amountChanged && !recurring && dupes.length) { dupAsked = dupKey; return; }
    const it: Item = {
      id: src?.id ?? newId(), kind, date, amount: finalAmount, from, note: note.trim(),
      ...(kind === 'shared' ? { shareA: Math.round(pctA * 100) } : {}),
      ...(isExpense && catPicked ? { category: catPicked } : {}),
      ...(foreign ? { currency: cur, origAmount: entered!, rate: rate! } : {}),
      ...(remind ? { remind } : {}),
      ...(recurring && !src ? { freq } : {}),
    };
    let err: string | null;
    if (occ && rule) {
      const patch: RulePatch = { amount: it.amount, note: it.note, from: it.from, remind, ...(it.shareA != null ? { shareA: it.shareA } : {}), ...(catPicked ? { category: catPicked } : {}) };
      const m = src!.date;
      err = scope === 'month' ? app.overrideRule(rule.id, m, patch) : app.changeRule(rule.id, m, patch);
    } else if (src) err = app.editItem(it);
    else if (recurring) err = app.addRule(it);
    else err = app.addItem(it);
    if (err) { error = err.includes('lezárt') ? app.t('lockedMonth') : err; return; }
    itemsView.month = date.slice(0, 7);
    if (!src) itemsView.lastDate = date;
    done();
  }
  function remove(mode: 'item' | 'month' | 'stop') {
    const m = src ? src.date : '';
    const err = mode === 'item' ? app.deleteItem(src!.id) : mode === 'month' ? app.overrideRule(rule!.id, m, null) : app.endRule(rule!.id, m);
    if (err) { error = app.t('lockedMonth'); askDelete = false; return; }
    done();
  }
</script>

{#if !occ}
<div style="display:flex;flex-direction:column;gap:6px">
  <span class="step">{hu ? 'Hónap és nap' : 'Month and day'}</span>
  <div class="monthbar">
    <button class="iconbtn" aria-label={hu ? 'Előző hónap' : 'Previous month'} onclick={() => stepMonth(-1)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
    <span class="datepick">
      <button class="datebtn" onclick={openPicker} aria-label={hu ? 'Dátum választása' : 'Pick date'}>
        <b>{fullDate(date || today())}</b>
        {#if app.state.months.get((date || today()).slice(0, 7))?.closed}<span class="tip">{app.t('closed')}</span>{/if}
      </button>
      <input bind:this={dateInput} class="dateover" type="date" bind:value={date} tabindex="-1" aria-hidden="true" />
    </span>
    <button class="iconbtn" aria-label={hu ? 'Következő hónap' : 'Next month'} onclick={() => stepMonth(1)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
  </div>
</div>
{/if}

{#if !occ}
  <div class="grid2">
    {#each ['shared', 'individual', 'transfer', 'settlement'] as const as k}
      <button class="chip" class:on={kind === k} onclick={() => (kind = k)}>{app.d.kinds[k]}</button>
    {/each}
  </div>
{:else}
  <div class="card" style="display:flex;flex-direction:column;gap:8px">
    <b>{hu ? 'Ismétlődő tétel' : 'Recurring item'} · {app.d.kinds[kind]}</b>
    <label class="radio" class:on={scope === 'forward'} style="padding:10px 12px"><input type="radio" bind:group={scope} value="forward" /><span><b style="display:block;font-size:14px">{hu ? 'Ettől a hónaptól kezdve' : 'From this month on'}</b><span class="small">{hu ? 'A korábbi hónapok nem változnak.' : 'Earlier months stay unchanged.'}</span></span></label>
    <label class="radio" class:on={scope === 'month'} style="padding:10px 12px"><input type="radio" bind:group={scope} value="month" /><span><b style="display:block;font-size:14px">{hu ? 'Csak ebben a hónapban' : 'This month only'}</b></span></label>
  </div>
{/if}

<div class="card">
  <label class="f" for="amt">{app.t('amount')}</label>
  <div style="display:flex;align-items:baseline;gap:8px">
    <input id="amt" class="amount" inputmode="decimal" bind:value={amountText} placeholder="0" autocomplete="off" />
    <span style="font-size:18px;font-weight:600;color:var(--muted)">{foreign ? cur : base}</span>
  </div>
  {#if foreign && finalAmount}<div class="small">{app.t('converted', { amt: money(finalAmount, base, app.lang) })}</div>{/if}
</div>

<div style="position:relative;display:flex;flex-direction:column;gap:6px">
  <label class="f" for="note">{app.t('what')}</label>
  <input id="note" class="in" bind:value={note} autocomplete="off" placeholder={isExpense ? (hu ? 'pl. Lidl, bérleti díj' : 'e.g. groceries, rent') : ''}
    onfocus={() => (noteFocus = true)} onblur={() => setTimeout(() => (noteFocus = false), 150)} />
  {#if sugg.length}
    <div class="rows" role="listbox" aria-label={hu ? 'Korábbi tételek' : 'Previous items'}>
      {#each sugg as x (x.key)}
        <button class="catrow" role="option" aria-selected="false" onmousedown={(e) => e.preventDefault()} onclick={() => pickSugg(x)}>
          <span class="dot" style="background:{groupColor(groupOf(x.category), app.themeResolved === 'dark')}"></span>
          <span style="flex:1"><b style="font-weight:600">{x.label}</b> <span class="tip">· {leafLabel(x.category, app.lang)}</span></span>
          <span class="tip">{x.count}×</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

{#if isExpense}
  <label class="f">{hu ? 'Kategória' : 'Category'}
    <select class="in" bind:value={catPicked}>
      <option value="">{hu ? 'Automatikus' : 'Automatic'}: {leafLabel(autoCat, app.lang)}</option>
      {#each GROUPS as g}
        <optgroup label={hu ? g.hu : g.en}>
          {#each g.leaves as l}<option value={l.key}>{hu ? l.hu : l.en}</option>{/each}
        </optgroup>
      {/each}
    </select>
  </label>
{/if}

<div style="display:flex;flex-direction:column;gap:6px">
  <span class="step">{fromLabel}</span>
  <div class="grid2">
    <button class="chip" class:on={from === 'A'} onclick={() => (from = 'A')}>{app.name('A')}</button>
    <button class="chip" class:on={from === 'B'} onclick={() => (from = 'B')}>{app.name('B')}</button>
  </div>
  {#if kind === 'transfer' || kind === 'settlement'}<span class="small">→ {app.name(app.other(from))}</span>{/if}
</div>

{#if kind === 'shared'}
  {#if showSplit}
    <div class="card">
      <div class="head"><span>{app.t('split')}</span><b class="num">{app.name('A')} {pctA}% · {app.name('B')} {100 - pctA}%</b></div>
      <input type="range" min="0" max="100" step="5" bind:value={pctA} aria-label={app.t('split')} style="width:100%;height:32px" />
    </div>
  {:else}
    <button class="row card" style="cursor:pointer;width:100%" onclick={() => (showSplit = true)}>
      <span>{app.t('split')}</span><span class="tip">{pctA}% / {100 - pctA}% · {hu ? 'módosítás' : 'change'}</span>
    </button>
  {/if}
{/if}

{#if !occ}

  <div class="card" style="display:flex;flex-direction:column;gap:10px">
    {#if !src && !foreign}
      <label style="display:flex;justify-content:space-between;align-items:center;min-height:32px;font-size:15px;gap:12px">
        <span>{hu ? 'Ismétlődő tétel' : 'Recurring item'}</span>
        <input type="checkbox" bind:checked={recurring} style="width:22px;height:22px;flex:none" />
      </label>
      {#if recurring}
        <div class="seg" style="grid-template-columns:repeat(4,minmax(0,1fr))">
          {#each FREQS as [k, lh, le]}<button class:on={freq === k} onclick={() => (freq = k)}>{hu ? lh : le}</button>{/each}
        </div>
        <span class="small">{freqText}</span>
      {/if}
    {/if}
    {#if !recurring}
      <label style="display:flex;justify-content:space-between;align-items:center;min-height:32px;font-size:15px">
        {app.t('otherCurrency')}<input type="checkbox" bind:checked={foreign} style="width:22px;height:22px" />
      </label>
      {#if foreign}
        <label class="f">{app.t('currency')}
          <select class="in" bind:value={cur}>{#each CURRENCIES.filter((c) => c !== base) as c}<option>{c}</option>{/each}</select>
        </label>
        <label class="f">{app.t('rate', { c: cur, base })}<input class="in" inputmode="decimal" bind:value={rateText} placeholder="392,5" /></label>
        <span class="small">{app.t('rateManual')}</span>
      {/if}
    {/if}
  </div>
{/if}

{#if recurring || occ || date > today()}
  <label class="f">{hu ? 'Emlékeztető' : 'Reminder'}
    <select class="in" bind:value={remind}>
      {#each REMINDS as [d, lh, le]}<option value={d}>{hu ? lh : le}</option>{/each}
    </select>
  </label>
{/if}

{#if dupes.length && dupAsked === dupKey}
  <div class="card dupcard" role="alertdialog" aria-labelledby="duptitle">
    <b id="duptitle">{hu ? 'Ebben a hónapban már van ilyen összegű tétel' : 'An item with this amount already exists this month'}</b>
    {#each dupes as d (d.id)}
      <div class="row" style="padding:4px 0"><span>{d.note || app.d.kinds[d.kind]} <span class="tip">· {fmtDate(d.date)} · {app.name(d.from)}</span></span><span class="num">{money(d.amount, base, app.lang)}</span></div>
    {/each}
    <span class="small">{hu ? 'Ugyanazt a blokkot vinnéd fel másodszor, vagy ez egy másik vásárlás?' : 'Is this the same receipt again, or a different purchase?'}</span>
    <button class="btn" onclick={() => save(true)}>{hu ? 'Másik tétel, mindenképp rögzítem' : "It's a different item, save it"}</button>
    <button class="btn ghost" onclick={done}>{hu ? 'Ugyanaz, nem rögzítem' : "It's the same, don't save"}</button>
  </div>
{:else}
  {#if dupes.length && (!src || finalAmount !== src.amount)}
    <div class="small duphint">⚠ {hu ? 'Ilyen összeg már szerepel ebben a hónapban:' : 'This amount already exists this month:'} {dupes.map((d) => `${d.note || app.d.kinds[d.kind]} (${fmtDate(d.date)})`).join(', ')}</div>
  {/if}
  {#if error}<div class="warn" role="alert">{error}</div>{/if}
  <button class="btn" onclick={() => save()}>{app.t('save')}</button>
{/if}
{#if src}
  {#if askDelete}
    <div class="card" style="display:flex;flex-direction:column;gap:8px">
      {#if occ}
        <button class="btn danger" onclick={() => remove('month')}>{hu ? 'Csak ez a hónap maradjon ki' : 'Skip this month only'}</button>
        <button class="btn danger" onclick={() => remove('stop')}>{hu ? 'Ismétlődés leállítása ettől a hónaptól' : 'Stop repeating from this month'}</button>
      {:else}
        <button class="btn danger" onclick={() => remove('item')}>{app.t('delete')}</button>
      {/if}
      <button class="btn ghost" onclick={() => (askDelete = false)}>{app.t('cancel')}</button>
    </div>
  {:else}
    <button class="btn danger" onclick={() => (askDelete = true)}>{app.t('delete')}</button>
  {/if}
  <button class="btn link" onclick={done}>{app.t('cancel')}</button>
{/if}

<style>
  .datepick { position: relative; flex: 1; display: flex; justify-content: center; }
  .datebtn { background: none; border: 0; color: var(--ink); font: inherit; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 8px; border-radius: 10px; }
  .datebtn b { text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 4px; }
  /* iOS-en a natív dátumválasztó csak valódi koppintásra nyílik: az átlátszó mező a felirat fölött van */
  .dateover { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; border: 0; pointer-events: none; }
  @supports (-webkit-touch-callout: none) { .dateover { pointer-events: auto; } }
  .dupcard { display: flex; flex-direction: column; gap: 8px; border: 1.5px solid var(--warn-ink); background: var(--warn-bg); }
  .duphint { color: var(--warn-ink); }
</style>
