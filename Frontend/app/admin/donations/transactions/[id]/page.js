'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { StateBlock } from '@/components/admin/ui/StateBlock';

function Field({ label, value }) {
  return (
    <div>
      <div className="font-sans text-xs font-bold uppercase tracking-wide text-charcoal/60">{label}</div>
      <div className="font-sans text-sm text-charcoal">{value ?? '—'}</div>
    </div>
  );
}

// Read-only detail view — no mutation control anywhere on this page.
function DonationDetailContent() {
  const { id } = useParams();
  const router = useRouter();
  const { apiFetch } = useAdminAuth();
  const [donation, setDonation] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch(`/admin/donations/${id}`)
      .then(setDonation)
      .catch((err) => setError(err.message));
  }, [apiFetch, id]);

  return (
    <div className="mx-auto mt-8 max-w-[700px] px-4 pb-16">
      <button type="button" onClick={() => router.push('/admin/donations/transactions')} className="mb-4 font-sans text-sm font-semibold text-vyoma-blue">
        ← Back to Donations
      </button>
      <h1 className="mb-4 font-sans text-h2 font-bold text-vyoma-blue">Donation detail</h1>

      <StateBlock loading={!donation && !error} error={error}>
        {donation && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 rounded-md border border-[var(--border-subtle)] p-4">
              <Field label="Donor name" value={donation.donor?.name} />
              <Field label="Donor email" value={donation.donor?.email} />
              <Field label="Scheme" value={donation.schemeSlug} />
              <Field label="Amount" value={`${donation.currency} ${donation.amount}`} />
              <Field label="Status" value={donation.status} />
              <Field label="Created" value={new Date(donation.createdAt).toLocaleString()} />
              <Field label="Razorpay order ID" value={donation.razorpayOrderId} />
              <Field label="Razorpay payment ID" value={donation.razorpayPaymentId} />
            </div>

            <div className="grid grid-cols-2 gap-4 rounded-md border border-[var(--border-subtle)] p-4">
              <h2 className="col-span-2 font-sans text-sm font-bold text-charcoal">Receipt</h2>
              <Field label="Receipt status" value={donation.receipt?.status} />
              <Field label="Receipt no." value={donation.receipt?.receiptNo} />
              <Field label="Sent at" value={donation.receipt?.sentAt ? new Date(donation.receipt.sentAt).toLocaleString() : null} />
              <Field label="Last attempt" value={donation.receipt?.lastAttemptAt ? new Date(donation.receipt.lastAttemptAt).toLocaleString() : null} />
              <Field label="Failure reason" value={donation.receipt?.failureReason} />
            </div>
          </div>
        )}
      </StateBlock>
    </div>
  );
}

export default function DonationDetailPage() {
  return (
    <RequireAdminAuth>
      <DonationDetailContent />
    </RequireAdminAuth>
  );
}
