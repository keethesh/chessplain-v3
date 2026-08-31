import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import { claimReport } from '../../../lib/api';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/';
  const reportId = requestUrl.searchParams.get('report_id');

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      if (reportId) {
        try {
          await claimReport(reportId, data.session.access_token);
        } catch (err) {
          console.warn('Failed to claim report during auth callback:', err);
        }
      }
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
