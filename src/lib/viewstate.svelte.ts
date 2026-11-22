// Nézetállapot, ami túléli a képernyőváltást (pl. szerkesztésből visszatérve ugyanott maradunk).
import { monthOf, type Kind } from './ledger';
import { today } from './format';

export const itemsView = $state({
  month: monthOf(today()),
  filter: 'all' as Kind | 'all',
  q: '',
  collapsed: {} as Record<string, boolean>,
  scroll: 0,
});
