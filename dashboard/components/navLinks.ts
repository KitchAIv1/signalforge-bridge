export interface NavRouteLink {
  href: string;
  label: string;
}

export const NAV_ROUTE_LINKS: NavRouteLink[] = [
  { href: '/', label: 'Overview' },
  { href: '/activity', label: 'Activity' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/health', label: 'Health' },
  { href: '/settings', label: 'Settings' },
];
