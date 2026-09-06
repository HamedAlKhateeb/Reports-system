'use client';

import React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <title>Error Details</title>
      </head>
      <body style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', backgroundColor: '#fff', color: '#111' }}>
        <h1 style={{ color: '#dc2626' }}>خطأ غير متوقع / Application Error</h1>
        <p>تفاصيل الخطأ لمسؤولي النظام / Error Details for debugging:</p>
        <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '1rem', borderRadius: '8px', margin: '1rem 0' }}>
          <strong>Name:</strong> {error?.name || 'Error'}<br />
          <strong>Message:</strong> {error?.message || 'No message'}<br />
          <strong>Digest:</strong> {error?.digest || 'None'}<br />
          {error?.stack && (
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: '1rem', fontSize: '12px', color: '#b91c1c' }}>
              {error.stack}
            </pre>
          )}
        </div>
        <button
          onClick={() => reset()}
          style={{ padding: '8px 16px', background: '#2E4034', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          إعادة المحاولة / Retry
        </button>
      </body>
    </html>
  );
}
