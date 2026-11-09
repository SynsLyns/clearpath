export function ClearFilters({
  action,
  children = "Clear",
  className = "submission-clear-filters",
}: {
  action: string;
  children?: string;
  className?: string;
}) {
  return (
    <form action={action} method="get">
      <button className={className} type="submit">{children}</button>
    </form>
  );
}
