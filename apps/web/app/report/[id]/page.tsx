import { ReportSession } from './session';

export default async function ReportPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ focus?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const raw = Array.isArray(query.focus) ? query.focus[0] : query.focus;
  const focus = raw == null ? undefined : Number(raw);
  return <ReportSession key={id} id={id} focusPly={focus != null && Number.isFinite(focus) ? focus : undefined} />;
}
