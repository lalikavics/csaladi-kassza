<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { newId, type Person } from '../lib/ledger';
  import { CURRENCIES, parseAmount, today } from '../lib/format';

  let step = $state(app.settings.seenPlans ? 1 : 0);
  let nameA = $state(app.settings.nameA);
  let nameB = $state(app.settings.nameB);
  let currency = $state(app.settings.currency);
  let pctA = $state(app.settings.shareA / 100);
  let visibility = $state(app.settings.visibility);
  let debtor = $state<Person>('B');
  let debtAmount = $state('');
  let debtNote = $state('');

  const nA = $derived(nameA.trim() || 'A fél');
  const nB = $derived(nameB.trim() || 'B fél');
  const debtMinor = $derived(parseAmount(debtAmount));

  function finish(withDebt: boolean) {
    Object.assign(app.settings, { visibility, onboarded: true, seenPlans: true, me: 'A', meChosen: true });
    app.setMeta({ nameA: nameA.trim(), nameB: nameB.trim(), currency, shareA: Math.round(pctA * 100) });
    if (withDebt && debtMinor && debtMinor > 0) {
      app.addItem({
        id: newId(), kind: 'opening', date: today(), amount: debtMinor,
        from: debtor === 'A' ? 'B' : 'A', note: debtNote.trim() || 'Kezdő tartozás',
      });
    }
    location.hash = '';
  }
</script>

<div class="page" style="padding-bottom:calc(24px + env(safe-area-inset-bottom))">
  {#if step === 0}
    <h1>{app.t('welcome')}</h1>
    <p class="sub">{app.t('welcomeSub')}</p>
    <div class="card strong">
      <div class="head"><h2>{app.t('basic')}</h2><span class="small">{app.t('free')}</span></div>
      <ul class="list">{#each app.d.basicList as l}<li>{l}</li>{/each}</ul>
    </div>
    <div class="card">
      <div class="head"><h2>{app.t('premium')}</h2><span class="small">{app.t('oneTime')}</span></div>
      <ul class="list">{#each app.d.premiumList as l}<li>{l}</li>{/each}</ul>
      <p class="small" style="border-top:1px solid var(--line);padding-top:8px;margin:8px 0 0">{app.t('subOnly')}</p>
    </div>
    <div class="spacer"></div>
    <button class="btn" onclick={() => { app.settings.seenPlans = true; app.saveSettings(); step = 1; }}>{app.t('startBasic')}</button>
  {:else if step === 1}
    <div class="head"><span></span><span class="step">1 / 3</span></div>
    <h1>{app.t('setupTitle')}</h1>
    <p class="sub">{app.t('setupSub')}</p>
    <label class="f">{app.t('yourName')}<input class="in" bind:value={nameA} placeholder="A fél" autocomplete="off" /></label>
    <label class="f">{app.t('otherName')}<input class="in" bind:value={nameB} placeholder="B fél" autocomplete="off" /></label>
    <label class="f">{app.t('baseCurrency')}
      <select class="in" bind:value={currency}>{#each CURRENCIES as c}<option>{c}</option>{/each}</select>
    </label>
    <div class="spacer"></div>
    <button class="btn" onclick={() => (step = 2)}>{app.t('next')}</button>
  {:else if step === 2}
    <div class="head"><button class="iconbtn" aria-label={app.t('back')} onclick={() => (step = 1)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button><span class="step">2 / 3</span></div>
    <h1>{app.t('splitTitle')}</h1>
    <div class="card">
      <div class="head" style="font-weight:600"><span>{nA} {pctA}%</span><span>{nB} {100 - pctA}%</span></div>
      <label class="small" for="pct">{app.t('defaultSplit')}</label>
      <input id="pct" type="range" min="0" max="100" step="5" bind:value={pctA} style="width:100%;height:32px" />
    </div>
    <fieldset style="border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:8px">
      <legend class="step" style="margin-bottom:8px">{app.t('visibility')}</legend>
      {#each ['private', 'total', 'items'] as const as v}
        <label class="radio" class:on={visibility === v}>
          <input type="radio" name="vis" value={v} bind:group={visibility} />
          <span><b style="display:block;font-size:15px">{app.d.vis[v]}</b><span class="small">{app.d.visSub[v]}</span></span>
        </label>
      {/each}
    </fieldset>
    <div class="spacer"></div>
    <button class="btn" onclick={() => (step = 3)}>{app.t('next')}</button>
  {:else}
    <div class="head"><button class="iconbtn" aria-label={app.t('back')} onclick={() => (step = 2)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button><span class="step">3 / 3</span></div>
    <h1>{app.t('debtTitle')}</h1>
    <p class="sub">{app.t('debtSub')}</p>
    <div class="grid2">
      <button class="chip" class:on={debtor === 'B'} onclick={() => (debtor = 'B')}>{app.t('owesTo', { x: nB, y: nA })}</button>
      <button class="chip" class:on={debtor === 'A'} onclick={() => (debtor = 'A')}>{app.t('owesTo', { x: nA, y: nB })}</button>
    </div>
    <label class="f">{app.t('amount')} ({currency})<input class="in" inputmode="decimal" bind:value={debtAmount} placeholder="0" /></label>
    <label class="f">{app.t('note')}<input class="in" bind:value={debtNote} /></label>
    <div class="spacer"></div>
    <button class="btn" disabled={!debtMinor} onclick={() => finish(true)}>{app.t('finish')}</button>
    <button class="btn link" onclick={() => finish(false)}>{app.t('skip')}</button>
  {/if}
</div>
