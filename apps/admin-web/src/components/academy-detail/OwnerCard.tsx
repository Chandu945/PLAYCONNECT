'use client';

import type { AcademyOwner } from '@/domain/admin/academy-detail';
import { Card } from '@/components/ui/Card';

import styles from './OwnerCard.module.css';

type OwnerCardProps = {
  owner: AcademyOwner;
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function OwnerCard({ owner }: OwnerCardProps) {
  return (
    <Card title="Owner Contact">
      <div className={styles.profile}>
        <div className={styles.avatar}>
          <span className={styles.initials}>{getInitials(owner.fullName)}</span>
        </div>
        <div className={styles.info}>
          <h3 className={styles.name}>{owner.fullName}</h3>
          <span className={styles.role}>Academy Owner</span>
        </div>
      </div>

      <div className={styles.contacts}>
        <a href={`mailto:${owner.email}`} className={styles.contactItem}>
          <div className={styles.contactIcon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>
          <div className={styles.contactDetail}>
            <span className={styles.contactLabel}>Email</span>
            <span className={styles.contactValue}>{owner.email}</span>
          </div>
          <svg className={styles.contactArrow} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17L17 7" />
            <path d="M7 7h10v10" />
          </svg>
        </a>

        <a href={`tel:${owner.phoneNumber}`} className={styles.contactItem}>
          <div className={styles.contactIcon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>
          <div className={styles.contactDetail}>
            <span className={styles.contactLabel}>Phone</span>
            <span className={styles.contactValue}>{owner.phoneNumber}</span>
          </div>
          <svg className={styles.contactArrow} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17L17 7" />
            <path d="M7 7h10v10" />
          </svg>
        </a>
      </div>
    </Card>
  );
}
