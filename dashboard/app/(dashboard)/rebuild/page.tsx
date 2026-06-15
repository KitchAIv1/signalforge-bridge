import { redirect } from 'next/navigation';

/** Rebuild Shadow analytics temporarily hidden from the UI; direct links go to Overview. */
export default function RebuildShadowPage() {
  redirect('/');
}
