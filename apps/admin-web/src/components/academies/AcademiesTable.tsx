'use client';

import Link from 'next/link';

import type { AcademyListRow } from '@/domain/admin/academies';
import { Table } from '@/components/ui/Table';
import { Skeleton } from '@/components/ui/Skeleton';

import styles from './AcademiesTable.module.css';

type AcademiesTableProps = {
  items: AcademyListRow[];
  loading: boolean;
};

const DASH = '\u2014';

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

function formatTier(tierKey: string | null): string {
  if (!tierKey) return DASH;
  switch (tierKey) {
    case 'TIER_0_50':
      return '0\u201350';
    case 'TIER_51_100':
      return '51\u2013100';
    case 'TIER_101_PLUS':
      return '101+';
    default:
      return tierKey;
  }
}

function formatCount(value: number | null): string {
  return value != null ? String(value) : DASH;
}

function formatRevenue(value: number | null): string {
  return value != null ? `\u20B9${value.toLocaleString('en-IN')}` : DASH;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

const SKELETON_ROWS = 5;
const COLUMNS = [
  'Academy',
  'Owner',
  'Contact',
  'Status',
  'Tier',
  'Students',
  'Staff',
  'Revenue',
  'Actions',
];

export function AcademiesTable({ items, loading }: AcademiesTableProps) {
  return (
    <Table>
      <thead>
        <tr>
          {COLUMNS.map((col) => (
            <th key={col} scope="col">
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading &&
          Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <tr key={`skel-${i}`}>
              {COLUMNS.map((col) => (
                <td key={col}>
                  <Skeleton height="16px" width="80%" />
                </td>
              ))}
            </tr>
          ))}
        {!loading && items.length === 0 && (
          <tr>
            <td colSpan={COLUMNS.length} className={styles.emptyCell}>
              No academies found
            </td>
          </tr>
        )}
        {!loading &&
          items.map((row) => (
            <tr key={row.academyId}>
              <td>
                <span className={styles.academyName}>{row.academyName}</span>
              </td>
              <td>
                <div className={styles.ownerCell}>
                  <div className={styles.ownerAvatar}>
                    {getInitials(row.ownerName)}
                  </div>
                  <span className={styles.ownerName}>{row.ownerName}</span>
                </div>
              </td>
              <td>
                <div className={styles.contactCell}>
                  <a href={`mailto:${row.ownerEmail}`} className={styles.contactLink} title={row.ownerEmail}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                    {row.ownerEmail}
                  </a>
                  {row.ownerPhone && (
                    <a href={`tel:${row.ownerPhone}`} className={styles.contactLink} title={row.ownerPhone}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      {row.ownerPhone}
                    </a>
                  )}
                </div>
              </td>
              <td>{formatStatus(row.status)}</td>
              <td>{formatTier(row.tierKey)}</td>
              <td>{formatCount(row.activeStudentCount)}</td>
              <td>{formatCount(row.staffCount)}</td>
              <td>{formatRevenue(row.thisMonthRevenueTotal)}</td>
              <td>
                <Link href={`/academies/${row.academyId}`} className={styles.viewLink}>
                  View
                </Link>
              </td>
            </tr>
          ))}
      </tbody>
    </Table>
  );
}
