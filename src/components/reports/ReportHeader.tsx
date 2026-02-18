interface ReportHeaderProps {
  farmName?: string | null;
  seasonName?: string;
  reportTitle: string;
}

export function ReportHeader({ farmName, seasonName, reportTitle }: ReportHeaderProps) {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-200 mb-6">
      <div>
        {farmName && <p className="text-sm font-semibold text-green-700">{farmName}</p>}
        <p className="text-lg font-bold text-gray-900">{reportTitle}</p>
        {seasonName && <p className="text-sm text-gray-500">{seasonName}</p>}
      </div>
      <p className="text-sm text-gray-400">Generated {today}</p>
    </div>
  );
}
