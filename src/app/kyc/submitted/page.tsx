'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import api from '@/lib/api';

export default function KycSubmittedPage() {
  const [status, setStatus] = useState<string>('submitted');

  useEffect(() => {
    api.get('/kyc/status').then((r) => setStatus(r.data.status)).catch(() => {});
  }, []);

  const isApproved = status === 'approved';
  const isRejected = status === 'rejected';

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 max-w-lg mx-auto py-12 px-4 animate-in fade-in-0 zoom-in-95 duration-200">
      {/* Icon Badge */}
      <div
        className={`flex h-24 w-24 items-center justify-center rounded-full border-4 shadow-2xl ${
          isApproved
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 shadow-emerald-500/20'
            : isRejected
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-500 shadow-rose-500/20'
            : 'bg-blue-600/10 border-blue-500/30 text-blue-500 shadow-blue-500/20'
        }`}
      >
        {isApproved ? (
          <CheckCircle2 className="h-12 w-12" />
        ) : isRejected ? (
          <XCircle className="h-12 w-12" />
        ) : (
          <Clock className="h-12 w-12 animate-pulse" />
        )}
      </div>

      {/* Main Status Text */}
      <div className="space-y-2 max-w-md">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
          {isApproved
            ? 'KYC Approved!'
            : isRejected
            ? 'KYC Verification Rejected'
            : 'Verification Submitted'}
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
          {isApproved
            ? 'Your identity has been verified successfully. You now have full access to trading accounts and features.'
            : isRejected
            ? 'Your KYC documents were not approved. Please review the requirements and re-submit your verification.'
            : "Your documents have been received and are currently under compliance review. This process usually takes 1–2 business days. We'll update your account status once review is complete."}
        </p>
      </div>

      {/* Action Button */}
      <div className="pt-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3.5 rounded-full text-xs shadow-lg shadow-blue-600/25 transition-all hover:scale-[1.02] cursor-pointer"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
