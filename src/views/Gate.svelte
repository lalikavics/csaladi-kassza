<script lang="ts">
  // Belépés a közös kasszába: létrehozás, csatlakozás meghívó linkkel, PIN.
  import { app } from '../lib/store.svelte';
  import { sync } from '../lib/sync.svelte';
  import { viewIn } from '../lib/motion';

  type Step = 'start' | 'newpin' | 'source' | 'pin';
  let step = $state<Step>(sync.hasSecret ? 'pin' : 'start');
  let pin = $state('');
  let pin2 = $state('');
  let invite = $state('');
  let backup = $state('');
  let busy = $state(false);
  let error = $state('');
  let fails = 0;
  let waitUntil = $state(0);

  const hu = app.lang === 'hu';
  const isPin = (p: string) => /^\d{4}$/.test(p);

  function connect() {
    app.onEmit = (evs) => sync.push(evs);
    sync.start((log) => (app.log = log));
  }

  async function unlock() {
    if (!isPin(pin) || busy) return;
    if (Date.now() < waitUntil) { error = hu ? 'Túl sok próbálkozás, várj fél percet.' : 'Too many attempts, wait 30 s.'; return; }
    busy = true; error = '';
    try {
      if (await sync.unlock(pin)) { connect(); return; }
      fails++;
      if (fails >= 5) { waitUntil = Date.now() + 30_000; fails = 0; }
      error = hu ? 'Hibás PIN.' : 'Wrong PIN.';
      pin = '';
    } catch (e) {
      error = (e as Error).message;
    } finally { busy = false; }
  }

  function join() {
    if (!sync.adoptFromText(invite)) { error = hu ? 'Ez nem tűnik meghívó linknek.' : 'This does not look like an invite link.'; return; }
    error = ''; step = 'pin';
  }

  async function create() {
    if (!isPin(pin) || pin !== pin2) { error = hu ? 'A két PIN nem egyezik.' : 'PINs do not match.'; return; }
    busy = true; error = '';
    try { await sync.create(pin); step = 'source'; }
    catch (e) { error = (e as Error).message; }
    finally { busy = false; }
  }

  function begin(withBackup: boolean) {
    connect();
    if (withBackup) {
      if (!app.importBackup(backup)) { error = hu ? 'Nem érvényes mentés.' : 'Not a valid backup.'; return; }
      app.settings.me = 'A'; app.settings.meChosen = false; app.saveSettings();
    }
  }
</script>

<div class="page" style="padding-bottom:calc(24px + env(safe-area-inset-bottom));justify-content:center">
  {#key step}<div class="view" in:viewIn>
  <div style="width:56px;height:56px;border-radius:16px;background:var(--hero);border:1px solid var(--line);display:flex;align-items:center;justify-content:center">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
  </div>

  {#if step === 'start'}
    <h1>{hu ? 'Közös kassza' : 'Shared kitty'}</h1>
    <p class="sub">{hu ? 'Az adatok a telefonokon titkosítódnak. A szerver csak olvashatatlan adatot lát.' : 'Data is encrypted on your phones; the server only sees unreadable data.'}</p>
    <div class="card" style="display:flex;flex-direction:column;gap:10px">
      <h2>{hu ? 'Meghívót kaptam' : 'I have an invite'}</h2>
      <label class="f">{hu ? 'Illeszd be a meghívó linket' : 'Paste the invite link'}<input class="in" bind:value={invite} autocomplete="off" placeholder="https://…#…" /></label>
      <button class="btn" disabled={!invite.trim()} onclick={join}>{hu ? 'Tovább' : 'Continue'}</button>
    </div>
    <button class="btn ghost" onclick={() => { step = 'newpin'; error = ''; }}>{hu ? 'Új közös kassza létrehozása' : 'Create a new shared kitty'}</button>
  {:else if step === 'newpin'}
    <h1>{hu ? 'Válassz PIN-t' : 'Choose a PIN'}</h1>
    <p class="sub">{hu ? '4 számjegy. Ezt kell beírni indításkor, a párodnak is ezt mondd meg (ne a linkkel együtt küldd).' : '4 digits, entered at each start. Tell it to your partner separately from the link.'}</p>
    <label class="f">PIN<input class="in pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" bind:value={pin} /></label>
    <label class="f">{hu ? 'PIN még egyszer' : 'PIN again'}<input class="in pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" bind:value={pin2} /></label>
    <button class="btn" disabled={busy || !isPin(pin) || !isPin(pin2)} onclick={create}>{busy ? '…' : hu ? 'Kassza létrehozása' : 'Create'}</button>
    <button class="btn link" onclick={() => (step = 'start')}>{app.t('back')}</button>
  {:else if step === 'source'}
    <h1>{hu ? 'Honnan induljon?' : 'Where to start?'}</h1>
    <div class="card" style="display:flex;flex-direction:column;gap:10px">
      <h2>{hu ? 'Az eddigi adataimmal' : 'With my current data'}</h2>
      <span class="small">{hu ? 'A gépi változatban: Beállítások → Mentés másolása, majd illeszd be ide.' : 'In the desktop version: Settings → Copy backup, then paste it here.'}</span>
      <textarea class="in" bind:value={backup} placeholder={'{"app":"kassza",…}'}></textarea>
      <button class="btn" disabled={!backup.trim()} onclick={() => begin(true)}>{hu ? 'Feltöltés és indulás' : 'Upload and start'}</button>
    </div>
    <button class="btn ghost" onclick={() => begin(false)}>{hu ? 'Üres kasszával (beállító varázsló)' : 'Empty kitty (setup wizard)'}</button>
  {:else}
    <h1>{hu ? 'Add meg a PIN-t' : 'Enter PIN'}</h1>
    <input class="in pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="PIN"
      bind:value={pin} oninput={() => isPin(pin) && unlock()} />
    <button class="btn" disabled={busy || !isPin(pin)} onclick={unlock}>{busy ? (hu ? 'Feloldás…' : 'Unlocking…') : hu ? 'Belépés' : 'Unlock'}</button>
    {#if !app.settings.meChosen}<button class="btn link" onclick={() => { sync.forget(); step = 'start'; }}>{hu ? 'Másik meghívó' : 'Use another invite'}</button>{/if}
  {/if}
  {#if error}<div class="warn" role="alert">{error}</div>{/if}
  </div>{/key}
</div>
