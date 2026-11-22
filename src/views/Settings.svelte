<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { importWorkbook, type ImportResult } from '../lib/importSheet';
  import { CURRENCIES, money } from '../lib/format';
  import { nextOccurrence, ruleItemFor, type Event } from '../lib/ledger';
  import { sync } from '../lib/sync.svelte';
  import { today } from '../lib/format';
  import { leafLabel, categoryOf } from '../lib/categories';

  let res = $state<ImportResult | null>(null);
  let importing = $state(false);
  let importMsg = $state('');
  let confirmImport = $state(false);
  let backupMsg = $state('');
  let restoreText = $state('');
  let showLog = $state(false);
  let confirmReset = $state(false);
  let pctA = $state(app.settings.shareA / 100);

  const s = app.settings;
  const save = () => { s.shareA = Math.round(pctA * 100); app.saveSettings(); };
  // a nevek, a pénznem és az alapfelosztás közösek: eseményként mennek, hogy a másik félnél is átíródjanak
  const saveMeta = () => app.setMeta({ nameA: s.nameA.trim(), nameB: s.nameB.trim(), currency: s.currency, shareA: Math.round(pctA * 100) });
  let copied = $state('');
  async function copyInvite() {
    try { await navigator.clipboard.writeText(sync.inviteLink()); copied = hu ? 'Link másolva.' : 'Link copied.'; }
    catch { copied = sync.inviteLink(); }
  }

  async function pick(e: globalThis.Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    importing = true; importMsg = ''; res = null;
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer());
      res = importWorkbook(wb.SheetNames, (sh, a) => wb.Sheets[sh]?.[a]?.v);
    } catch (err) {
      importMsg = String(err);
    }
    importing = false;
  }
  const bad = $derived(res ? res.checks.filter((c) => !c.ok).length : 0);
  function doImport() {
    if (!res) return;
    if (!app.replaceItems(res.items)) { importMsg = hu ? 'A közös kasszába csak üres kasszánál lehet importálni.' : 'Import is only possible into an empty shared kitty.'; return; }
    importMsg = app.t('importOk', { n: res.stats.sheets, i: res.stats.items });
    res = null; confirmImport = false;
  }
  async function copyBackup() {
    try { await navigator.clipboard.writeText(app.exportBackup()); backupMsg = app.t('backupCopied'); }
    catch { backupMsg = 'A másolás nem sikerült: jelöld ki és másold a lenti mezőből.'; restoreText = app.exportBackup(); }
  }
  function restore() { backupMsg = app.importBackup(restoreText) ? (hu ? 'Visszaállítva.' : 'Restored.') : app.shared && app.state.items.size ? (hu ? 'A közös kasszába csak üres kasszánál lehet visszaállítani.' : 'Only into an empty shared kitty.') : app.t('restoreBad'); }
  const hu = $derived(app.lang === 'hu');
  const verb = (e: Event) => ({
    'item.add': app.t('logAdd'), 'item.edit': app.t('logEdit'), 'item.delete': app.t('logDelete'), 'month.approve': app.t('logApprove'), 'month.reopen': app.t('logReopen'),
    'rule.add': hu ? 'ismétlődő tételt vett fel' : 'added a recurring item', 'rule.change': hu ? 'módosította az ismétlődő tételt' : 'changed a recurring item',
    'rule.end': hu ? 'leállította az ismétlődést' : 'stopped a recurring item', 'rule.override': hu ? 'egy hónapra módosította' : 'changed one month of',
    'meta.set': hu ? 'módosította a közös beállításokat' : 'changed shared settings',
  })[e.t];
  const FREQ_LABEL = $derived<Record<string, string>>(hu ? { weekly: 'hetente', monthly: 'havonta', quarterly: 'negyedévente', yearly: 'évente' } : { weekly: 'weekly', monthly: 'monthly', quarterly: 'quarterly', yearly: 'yearly' });
  let notifState = $state<string>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  async function askNotif() {
    try { notifState = await Notification.requestPermission(); } catch { notifState = 'unsupported'; }
  }
  const ruleName = (id: string) => app.state.rules.get(id)?.item.note || '';
  const what = (e: Event) => {
    switch (e.t) {
      case 'item.add': case 'item.edit': case 'rule.add': return `${e.item.note || app.d.kinds[e.item.kind]} (${money(e.item.amount, s.currency, app.lang)})`;
      case 'item.delete': return app.state.items.get(e.itemId)?.note ?? '';
      case 'rule.change': return `${ruleName(e.ruleId)}, ${e.from}${e.patch.amount != null ? ` → ${money(e.patch.amount, s.currency, app.lang)}` : ''}`;
      case 'rule.end': return `${ruleName(e.ruleId)}, ${e.from}`;
      case 'rule.override': return `${ruleName(e.ruleId)}, ${e.month}${e.patch === null ? (hu ? ' (kimarad)' : ' (skipped)') : ''}`;
      case 'meta.set': return Object.entries(e.patch).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(', ');
      default: return e.month;
    }
  };
  const rules = $derived([...app.state.rules.values()].map((r) => {
    const now = today().slice(0, 7);
    const t = today();
    const next = nextOccurrence(r, t);
    const curIt = next ?? ruleItemFor(r, t) ?? r.item;
    return { r, cur: curIt, next, active: !!next || !r.end || r.end > now };
  }));
</script>

<h1>{app.t('settings')}</h1>

<div class="card" style="display:flex;flex-direction:column;gap:12px">
  <label class="f">{app.t('yourName')} (A)<input class="in" bind:value={s.nameA} onchange={saveMeta} placeholder="A fél" /></label>
  <label class="f">{app.t('otherName')} (B)<input class="in" bind:value={s.nameB} onchange={saveMeta} placeholder="B fél" /></label>
  <label class="f">{app.t('baseCurrency')}<select class="in" bind:value={s.currency} onchange={saveMeta}>{#each CURRENCIES as c}<option>{c}</option>{/each}</select></label>
  <label class="f">{app.t('defaultSplit')}: {app.name('A')} {pctA}% · {app.name('B')} {100 - pctA}%<input type="range" min="0" max="100" step="5" bind:value={pctA} onchange={saveMeta} style="height:32px" /></label>
  <label class="f">{app.t('visibility')}<select class="in" bind:value={s.visibility} onchange={save}>{#each ['private', 'total', 'items'] as const as v}<option value={v}>{app.d.vis[v]}</option>{/each}</select></label>
  <label class="f">{app.t('language')}<select class="in" bind:value={s.lang} onchange={save}><option value="auto">{app.t('langAuto')}</option><option value="hu">Magyar</option><option value="en">English</option></select></label>
  <label class="f">{app.lang === 'hu' ? 'Megjelenés' : 'Appearance'}<select class="in" bind:value={s.theme} onchange={save}><option value="dark">{app.lang === 'hu' ? 'Sötét' : 'Dark'}</option><option value="light">{app.lang === 'hu' ? 'Világos' : 'Light'}</option><option value="auto">{app.lang === 'hu' ? 'Rendszer szerint' : 'System'}</option></select></label>
</div>

<div class="card" style="display:flex;flex-direction:column;gap:8px">
  <h2>{hu ? 'Ismétlődő tételek' : 'Recurring items'}</h2>
  {#each rules as x (x.r.id)}
    <div class="row" style="padding:8px 0" class:dimrow={!x.active}>
      <span><b style="font-weight:600">{x.cur.note || app.d.kinds[x.cur.kind]}</b><br /><span class="small">{app.d.kinds[x.cur.kind]} · {leafLabel(categoryOf(x.cur, app.state), app.lang)} · {FREQ_LABEL[x.r.item.freq ?? 'monthly']}{x.next ? (hu ? ` · köv.: ${x.next.date}` : ` · next: ${x.next.date}`) : ''}{x.cur.remind ? (hu ? ` · emlékeztető ${x.cur.remind} nappal előtte` : ` · reminder ${x.cur.remind}d before`) : ''}{x.r.changes.length ? (hu ? ` · ${x.r.changes.length} módosítás` : ` · ${x.r.changes.length} change(s)`) : ''}{!x.active ? (hu ? ' · leállítva' : ' · stopped') : ''}</span></span>
      <span class="num">{money(x.cur.amount, s.currency, app.lang)}</span>
    </div>
  {:else}
    <span class="small">{hu ? 'Még nincs. Új tételnél jelöld be: „Ismétlődő, havonta”.' : 'None yet. Tick “Repeats monthly” on a new item.'}</span>
  {/each}
  {#if rules.length}<span class="small">{hu ? 'Módosítás: nyisd meg a tételt a Tételek között, és válaszd az „Ettől a hónaptól kezdve” lehetőséget.' : 'To change one, open it under Items and choose “From this month on”.'}</span>{/if}
</div>

<div class="card" style="display:flex;flex-direction:column;gap:8px">
  <h2>{hu ? 'Értesítések' : 'Notifications'}</h2>
  <span class="small">{hu ? 'Az emlékeztetők az Áttekintés tetején jelennek meg. Ha engedélyezed, a rendszer értesítést is küld, amíg az app ablaka nyitva van.' : 'Reminders show at the top of the Overview. If allowed, a system notification is also shown while the app window is open.'}</span>
  {#if notifState === 'granted'}
    <span class="ok" style="font-size:14px;font-weight:600">{hu ? 'Engedélyezve' : 'Enabled'}</span>
  {:else if notifState === 'unsupported'}
    <span class="small">{hu ? 'Ez a böngésző nem támogatja.' : 'Not supported in this browser.'}</span>
  {:else}
    <button class="btn ghost" onclick={askNotif}>{hu ? 'Értesítések engedélyezése' : 'Allow notifications'}</button>
    {#if notifState === 'denied'}<span class="small">{hu ? 'Le van tiltva; a böngésző címsoránál engedélyezheted.' : 'Blocked; allow it in the browser settings.'}</span>{/if}
  {/if}
</div>

{#if app.shared}
  <div class="card" style="display:flex;flex-direction:column;gap:8px">
    <h2>{hu ? 'Közös kassza' : 'Shared kitty'}</h2>
    <span class="small">{hu ? 'Állapot' : 'Status'}: <b>{({ online: hu ? 'szinkronban' : 'in sync', offline: hu ? 'offline, a változások később mennek fel' : 'offline, changes will upload later', connecting: hu ? 'kapcsolódás…' : 'connecting…', error: hu ? 'hiba' : 'error', locked: '' } as Record<string, string>)[sync.status]}</b>{sync.lastSync ? ` · ${sync.lastSync}` : ''}</span>
    {#if sync.error}<span class="small">{sync.error}</span>{/if}
    <span class="small">{hu ? 'Meghívó: küldd el a linket a párodnak, a PIN-t pedig külön (szóban vagy másik üzenetben). A link nélkül senki nem fér hozzá, a PIN nélkül pedig a link sem elég.' : 'Invite: send the link, and tell the PIN separately.'}</span>
    <button class="btn ghost" onclick={copyInvite}>{hu ? 'Meghívó link másolása' : 'Copy invite link'}</button>
    {#if copied}<span class="small" style="word-break:break-all">{copied}</span>{/if}
  </div>
{/if}

<div class="card" style="display:flex;flex-direction:column;gap:8px">
  <h2>{app.t('me')}</h2>
  <div class="grid2">
    <button class="chip" class:on={s.me === 'A'} onclick={() => { s.me = 'A'; save(); }}>{app.name('A')}</button>
    <button class="chip" class:on={s.me === 'B'} onclick={() => { s.me = 'B'; save(); }}>{app.name('B')}</button>
  </div>
  <span class="small">{app.shared ? (hu ? 'Ezen a telefonon ezzel a névvel rögzítesz és hagysz jóvá.' : 'Items and approvals on this device are recorded as this person.') : app.t('meHint')}</span>
</div>

<div class="card" style="display:flex;flex-direction:column;gap:10px">
  <h2>{app.t('importTitle')}</h2>
  <span class="small">{app.t('importSub')}</span>
  <label class="btn ghost" style="display:flex;align-items:center;justify-content:center;cursor:pointer">
    {importing ? '…' : app.t('importPick')}
    <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onchange={pick} style="position:absolute;opacity:0;width:1px;height:1px" />
  </label>
  {#if res}
    {#if bad === 0}
      <div class="ok" style="font-size:14px;font-weight:600">{app.t('importOk', { n: res.stats.sheets, i: res.stats.items })}</div>
      <div class="small">{app.d.kinds.shared}: {res.stats.shared} · {app.d.kinds.transfer}: {res.stats.transfers} · {app.d.kinds.settlement}: {res.stats.settlements} · {app.d.kinds.individual}: {res.stats.individual}</div>
      <div class="small">Utolsó hónap ({res.checks.at(-1)?.month}): {money(Math.abs(res.checks.at(-1)?.got ?? 0), s.currency, app.lang)}</div>
      {#if res.warnings.length}<details class="small"><summary>{app.t('importWarn')} ({res.warnings.length})</summary><ul class="list">{#each res.warnings as w}<li>{w}</li>{/each}</ul></details>{/if}
      {#if app.state.items.size && !confirmImport}
        <button class="btn" onclick={() => (confirmImport = true)}>{app.t('importDo')}</button>
      {:else if app.state.items.size}
        <div class="warn">{app.t('importReplace')}</div>
        <div class="grid2"><button class="btn" onclick={doImport}>{app.t('yes')}</button><button class="btn ghost" onclick={() => (confirmImport = false)}>{app.t('no')}</button></div>
      {:else}
        <button class="btn" onclick={doImport}>{app.t('importDo')}</button>
      {/if}
    {:else}
      <div class="warn">{app.t('importBad', { b: bad })}</div>
      <ul class="list small">{#each res.checks.filter((c) => !c.ok) as c}<li>{c.sheet}: {c.expected / 100} ≠ {c.got / 100}</li>{/each}</ul>
    {/if}
  {/if}
  {#if importMsg}<div class="ok" style="font-size:14px">{importMsg}</div>{/if}
</div>

<div class="card" style="display:flex;flex-direction:column;gap:10px">
  <h2>{app.t('backup')}</h2>
  <button class="btn ghost" onclick={copyBackup}>{app.t('backupCopy')}</button>
  <label class="f">{app.t('backupRestore')}<textarea class="in" bind:value={restoreText}></textarea></label>
  <button class="btn ghost" disabled={!restoreText.trim()} onclick={restore}>{app.t('restore')}</button>
  {#if backupMsg}<span class="small">{backupMsg}</span>{/if}
</div>

<div class="card" style="display:flex;flex-direction:column;gap:8px">
  <button class="btn ghost" onclick={() => (showLog = !showLog)}>{app.t('log')} ({app.log.length})</button>
  {#if showLog}
    <div style="max-height:360px;overflow:auto">
      {#each app.log.slice(-200).reverse() as e (e.id)}
        <div class="small" style="padding:6px 0;border-bottom:1px solid var(--line)">{e.at.slice(0, 16).replace('T', ' ')} · <b>{app.name(e.by)}</b> {verb(e)}: {what(e)}</div>
      {/each}
    </div>
  {/if}
</div>

{#if !app.shared}<div class="card small">{app.t('soon')}</div>{/if}

{#if confirmReset}
  <div class="warn">{app.shared ? (hu ? 'Ezen az eszközön törlődik a kassza elérése és a helyi másolat. A közös adat megmarad, a meghívó linkkel és a PIN-nel újra beléphetsz.' : 'This removes access on this device only.') : app.t('resetConfirm')}</div>
  <div class="grid2"><button class="btn danger" onclick={() => { if (app.shared) sync.forget(); app.reset(); location.hash = ''; location.reload(); }}>{app.t('yes')}</button><button class="btn ghost" onclick={() => (confirmReset = false)}>{app.t('no')}</button></div>
{:else}
  <button class="btn danger" onclick={() => (confirmReset = true)}>{app.shared ? (hu ? 'Kilépés ezen az eszközön' : 'Sign out on this device') : app.t('reset')}</button>
{/if}
