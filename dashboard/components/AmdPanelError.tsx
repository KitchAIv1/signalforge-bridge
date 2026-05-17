interface AmdPanelErrorProps {
  message: string;
}

export function AmdPanelError({ message }: AmdPanelErrorProps) {
  return (
    <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
      AMD: {message}
    </div>
  );
}
