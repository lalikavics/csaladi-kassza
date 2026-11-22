<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from './lib/store.svelte';
  import type { Item, Kind } from './lib/ledger';
  import { dueReminders } from './lib/reminders';
  import { itemsView } from './lib/viewstate.svelte';
  import { money, today } from './lib/format';
  import Onboarding from './views/Onboarding.svelte';
  import Gate from './views/Gate.svelte';
  import { sync } from './lib/sync.svelte';
  import type { Person } from './lib/ledger';
  import { viewIn } from './lib/motion';
  import Overview from './views/Overview.svelte';
  import Items from './views/Items.svelte';
  import ItemForm from './views/ItemForm.svelte';
  import Report from './views/Report.svelte';
  import Settings from './views/Settings.svelte';

  const read = () => location.hash.replace('#', '') || 'attekintes';
  let view = $state(read());
  let editing = $state<Item | null>(null);
  let preset = $state<Kind | null>(null);
  let formKey = $state(0);
  $effect(() => { document.documentElement.dataset.theme = app.themeResolved; });
  // a közös beállítások (nevek, pénznem) a naplóból jönnek
  $effect(() => { const m = app.state.meta; untrack(() => app.applyMeta(m)); });
  function pickMe(p: Person) { app.settings.me = p; app.settings.meChosen = true; app.saveSettings(); }
  try { navigator.storage?.persist?.(); } catch { /* */ }

  // rendszerértesítés az esedékes emlékeztetőkről (amíg az app nyitva van)
  function notify() {
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const due = dueReminders(app.state, today()).filter((d) => !app.settings.notified.includes(d.id));
      for (const d of due) {
        const hu = app.lang === 'hu';
        new Notification(`${d.item.note || app.d.kinds[d.item.kind]} – ${money(d.item.amount, app.settings.currency, app.lang)}`, {
          body: d.daysLeft === 0 ? (hu ? 'Ma esedékes.' : 'Due today.') : hu ? `${d.daysLeft} nap múlva esedékes (${d.item.date}).` : `Due in ${d.daysLeft} days (${d.item.date}).`,
          tag: d.id,
        });
      }
      if (due.length) { app.settings.notified = [...app.settings.notified, ...due.map((d) => d.id)].slice(-300); app.saveSettings(); }
    } catch { /* */ }
  }
  setTimeout(notify, 1500);
  setInterval(notify, 30 * 60 * 1000);
  window.addEventListener('hashchange', () => { view = read(); editing = null; window.scrollTo(0, 0); });

  function go(h: string) {
    if (h === 'rendezes') { preset = 'settlement'; h = 'uj'; } else preset = null;
    editing = null; formKey++;
    location.hash = h === 'attekintes' ? '' : h;
    view = h;
  }
  const open = (it: Item) => { itemsView.scroll = window.scrollY; editing = it; formKey++; window.scrollTo(0, 0); };
  const done = () => {
    const fromEdit = !!editing;
    editing = null; preset = null; go('tetelek');
    // szerkesztés után ugyanoda vissza, ahol a lista volt
    if (fromEdit) requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, itemsView.scroll)));
  };

  const tabs = [
    { h: 'attekintes', k: 'overview', d: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' },
    { h: 'tetelek', k: 'items', d: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
    { h: 'uj', k: 'add', d: 'M12 5v14M5 12h14' },
    { h: 'kimutatas', k: 'report', d: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
    { h: 'beallitasok', k: 'settings', d: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.4 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 1.7 14H1.5a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.4a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V1.5a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z' },
  ] as const;
</script>

{#if app.shared && !sync.unlocked}
  <Gate />
{:else if !app.settings.onboarded}
  <Onboarding />
{:else if app.shared && !app.settings.meChosen}
  <div class="page" style="justify-content:center">
    <div class="view" in:viewIn>
      <h1>{app.lang === 'hu' ? 'Ki vagy te?' : 'Who are you?'}</h1>
      <p class="sub">{app.lang === 'hu' ? 'Ezt a telefon megjegyzi. Az általad felvett tételek és jóváhagyások ezzel a névvel kerülnek be.' : 'This device remembers it.'}</p>
      {#each ['A', 'B'] as const as p}<button class="btn ghost" style="min-height:56px;font-size:17px" onclick={() => pickMe(p)}>{app.name(p)}</button>{/each}
    </div>
  </div>
{:else}
  <main class="page">
    {#key editing ? 'edit' + formKey : view}<div class="view" in:viewIn>
    {#if editing}
      <h1>{app.t('edit')}</h1>
      {#key formKey}<ItemForm edit={editing} {done} />{/key}
    {:else if view === 'tetelek'}
      <Items {open} />
    {:else if view === 'uj'}
      <h1>{app.t('add')}</h1>
      {#key formKey}<ItemForm {preset} {done} />{/key}
    {:else if view === 'kimutatas'}
      <Report />
    {:else if view === 'beallitasok'}
      <Settings />
    {:else}
      <Overview {go} />
    {/if}
    </div>{/key}
  </main>
  <nav class="tabs" aria-label="Menü">
    {#each tabs as t}
      <a href={'#' + t.h} class:on={view === t.h && !editing} onclick={(e) => { e.preventDefault(); go(t.h); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={t.d} /></svg>
        {app.t(t.k)}
      </a>
    {/each}
  </nav>
{/if}
