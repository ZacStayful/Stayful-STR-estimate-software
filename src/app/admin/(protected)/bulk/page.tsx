import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bulk analyser — Stayful Admin',
  robots: { index: false, follow: false },
};

export default function BulkPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Bulk analyser</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Upload a spreadsheet of properties to run through the analyser.
      </p>
      <div className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
        <p className="text-sm text-neutral-500">Upload is being wired up next.</p>
      </div>
    </div>
  );
}
