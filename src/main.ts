import { mount } from 'svelte';
import './fonts.css';
import './app.css';
import App from './App.svelte';

export default mount(App, { target: document.getElementById('app')! });

// Webes változat: service worker, automatikus frissítéssel (óránként és minden megnyitáskor ellenőriz).
if (import.meta.env.VITE_TARGET === 'web' && import.meta.env.VITE_FAKE !== '1') {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true, onRegisteredSW(_u, r) { if (r) setInterval(() => r.update(), 60 * 60 * 1000); } });
  }).catch(() => {});
}
