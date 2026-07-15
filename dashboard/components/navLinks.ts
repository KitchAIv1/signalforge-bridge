import { ALPHAOMEGA_NAV_LABEL } from '@/lib/omegaLaneBConstants';

export interface NavRouteLink {
  href: string;
  label: string;
}

export const NAV_ROUTE_LINKS: NavRouteLink[] = [
  { href: '/', label: 'Overview' },
  { href: '/activity', label: 'Activity' },
  { href: '/omega-phase2', label: ALPHAOMEGA_NAV_LABEL },
  { href: '/override', label: 'Override' },
  { href: '/amd-history', label: 'AMD History' },
  { href: '/omega-inverse', label: 'Omega Inverse' },
  { href: '/omega-shadow-trail', label: 'Shadow Trail v1' },
  { href: '/omega-centroid', label: 'Centroid Check' },
  { href: '/pdl-sweep', label: 'PDL Sweep' },
  { href: '/asian-session', label: 'Asian Session' },
  { href: '/audusd-fade', label: 'AUDUSD Fade' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/health', label: 'Health' },
  { href: '/intelligence', label: 'Intelligence' },
  { href: '/settings', label: 'Settings' },
];
