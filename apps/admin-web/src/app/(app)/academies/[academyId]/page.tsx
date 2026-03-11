'use client';

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';

import { useAcademyDetail } from '@/application/academy-detail/use-academy-detail';
import type { ManualSubscriptionInput } from '@/domain/admin/academy-detail';
import { useToast } from '@/components/ui/ToastHost';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { AcademyHeader } from '@/components/academy-detail/AcademyHeader';
import { AcademyMetrics } from '@/components/academy-detail/AcademyMetrics';
import { OwnerCard } from '@/components/academy-detail/OwnerCard';
import { SubscriptionCard } from '@/components/academy-detail/SubscriptionCard';
import { ActionsPanel } from '@/components/academy-detail/ActionsPanel';
import { ManualSubscriptionModal } from '@/components/modals/ManualSubscriptionModal';
import { ConfirmDialog } from '@/components/modals/ConfirmDialog';
import { DisableLoginModal } from '@/components/modals/DisableLoginModal';
import { ForceLogoutModal } from '@/components/modals/ForceLogoutModal';
import { ResetPasswordModal } from '@/components/modals/ResetPasswordModal';

import styles from './page.module.css';

export default function AcademyDetailPage() {
  const { academyId } = useParams<{ academyId: string }>();
  const { data, loading, error, refetch, actions } = useAcademyDetail(academyId);
  const toast = useToast();

  // Modal visibility states
  const [manualSubOpen, setManualSubOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [disableLoginOpen, setDisableLoginOpen] = useState(false);
  const [forceLogoutOpen, setForceLogoutOpen] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const handleManualSubscription = useCallback(
    async (input: ManualSubscriptionInput) => {
      setActionLoading(true);
      const result = await actions.setManualSubscription(input);
      setActionLoading(false);
      if (result.ok) {
        setManualSubOpen(false);
        toast.show('Subscription updated successfully', 'success');
      } else {
        toast.show(result.error.message, 'error');
      }
    },
    [actions, toast],
  );

  const handleDeactivate = useCallback(async () => {
    setActionLoading(true);
    const result = await actions.deactivateSubscription();
    setActionLoading(false);
    if (result.ok) {
      setDeactivateOpen(false);
      toast.show('Subscription deactivated', 'success');
    } else {
      toast.show(result.error.message, 'error');
    }
  }, [actions, toast]);

  const handleToggleLogin = useCallback(async () => {
    if (!data) return;
    setActionLoading(true);
    const result = await actions.setLoginDisabled(!data.loginDisabled);
    setActionLoading(false);
    if (result.ok) {
      setDisableLoginOpen(false);
      toast.show(data.loginDisabled ? 'Login enabled' : 'Login disabled', 'success');
    } else {
      toast.show(result.error.message, 'error');
    }
  }, [actions, data, toast]);

  const handleForceLogout = useCallback(async () => {
    setActionLoading(true);
    const result = await actions.forceLogout();
    setActionLoading(false);
    if (result.ok) {
      setForceLogoutOpen(false);
      toast.show('All users have been logged out', 'success');
    } else {
      toast.show(result.error.message, 'error');
    }
  }, [actions, toast]);

  const handleResetPassword = useCallback(
    async (temporaryPassword?: string): Promise<string | null> => {
      const result = await actions.resetOwnerPassword(temporaryPassword);
      if (result.ok) {
        refetch();
        return result.data.temporaryPassword;
      }
      toast.show(result.error.message, 'error');
      return null;
    },
    [actions, refetch, toast],
  );

  if (loading) {
    return (
      <div>
        <Skeleton width="200px" height="24px" />
        <div style={{ marginTop: 16 }}>
          <Skeleton width="100%" height="80px" />
        </div>
        <div style={{ marginTop: 16 }}>
          <Skeleton width="100%" height="120px" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        variant="error"
        action={
          error.code !== 'NOT_FOUND' ? (
            <Button variant="secondary" size="sm" onClick={refetch}>
              Retry
            </Button>
          ) : undefined
        }
      >
        {error.code === 'NOT_FOUND' ? 'Academy not found' : error.message}
      </Alert>
    );
  }

  if (!data) return null;

  return (
    <div>
      <AcademyHeader
        name={data.academyName}
        status={data.subscription.status}
        loginDisabled={data.loginDisabled}
      />

      <AcademyMetrics metrics={data.metrics} />

      <div className={styles.detailGrid}>
        <OwnerCard owner={data.owner} />
        <SubscriptionCard subscription={data.subscription} />
      </div>

      <div className={styles.actionsSection}>
        <ActionsPanel
          academyId={data.academyId}
          loginDisabled={data.loginDisabled}
          onManualSubscription={() => setManualSubOpen(true)}
          onDeactivateSubscription={() => setDeactivateOpen(true)}
          onToggleLogin={() => setDisableLoginOpen(true)}
          onForceLogout={() => setForceLogoutOpen(true)}
          onResetPassword={() => setResetPasswordOpen(true)}
        />
      </div>

      <ManualSubscriptionModal
        open={manualSubOpen}
        loading={actionLoading}
        onSubmit={handleManualSubscription}
        onClose={() => setManualSubOpen(false)}
      />

      <ConfirmDialog
        open={deactivateOpen}
        title="Deactivate Subscription"
        message="This will deactivate the academy's subscription. The academy will lose access to paid features."
        confirmLabel="Deactivate"
        confirmVariant="danger"
        loading={actionLoading}
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivateOpen(false)}
      />

      <DisableLoginModal
        open={disableLoginOpen}
        loginDisabled={data.loginDisabled}
        loading={actionLoading}
        onConfirm={handleToggleLogin}
        onCancel={() => setDisableLoginOpen(false)}
      />

      <ForceLogoutModal
        open={forceLogoutOpen}
        loading={actionLoading}
        onConfirm={handleForceLogout}
        onCancel={() => setForceLogoutOpen(false)}
      />

      <ResetPasswordModal
        open={resetPasswordOpen}
        onSubmit={handleResetPassword}
        onClose={() => setResetPasswordOpen(false)}
      />
    </div>
  );
}
