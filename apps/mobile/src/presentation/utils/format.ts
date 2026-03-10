const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "2026-03" → "March 2026" */
export function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const idx = parseInt(month ?? '0', 10) - 1;
  return `${MONTH_NAMES[idx] ?? month} ${year}`;
}

/** "2026-03" → "Mar 2026" */
export function formatMonthShort(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const idx = parseInt(month ?? '0', 10) - 1;
  return `${MONTH_SHORT[idx] ?? month} ${year}`;
}

/** Format currency in INR */
export function formatCurrency(amount: number): string {
  return `\u20B9${amount.toLocaleString('en-IN')}`;
}

/** Get initials from name — "John Doe" → "JD" */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Format date for display — "2026-03-10T..." → "10 Mar 2026" */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Format date long — "2026-03-10T..." → "10 March 2026" */
export function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Get greeting based on time of day */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}
