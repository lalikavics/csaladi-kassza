// Animációk: rövidek, és kikapcsolnak, ha a rendszerben a „mozgás csökkentése” be van állítva.
import { fly, fade, slide } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';

export const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
export const ms = (n: number) => (reduced ? 0 : n);

/** Hónapváltás: az új tartalom a lapozás irányából csúszik be. */
export const monthIn = (node: Element, { dir = 1 }: { dir?: number } = {}) => fly(node, { x: 40 * dir, duration: ms(220), easing: cubicOut });
export const viewIn = (node: Element) => fly(node, { y: 10, duration: ms(200), easing: cubicOut });
export const open = (node: Element) => slide(node, { duration: ms(200), easing: cubicOut });
export const fadeIn = (node: Element) => fade(node, { duration: ms(160) });
