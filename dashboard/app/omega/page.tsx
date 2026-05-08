import { redirect } from 'next/navigation';

/** Omega Shadow analytics temporarily hidden from the UI; direct links go to Overview. */
export default function OmegaShadowPage() {
  redirect('/');
}
