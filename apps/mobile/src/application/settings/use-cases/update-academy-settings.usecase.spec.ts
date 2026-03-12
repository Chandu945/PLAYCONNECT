import { updateAcademySettingsUseCase } from './update-academy-settings.usecase';
import { ok, err } from '../../../domain/common/result';
import type { AcademySettings } from '../../../domain/settings/academy-settings.types';
import type { AppError } from '../../../domain/common/errors';

function makeApi(response: { ok: true; value: AcademySettings } | { ok: false; error: AppError }) {
  return {
    settingsApi: {
      updateAcademySettings: jest.fn().mockResolvedValue(response),
    },
  };
}

describe('updateAcademySettingsUseCase', () => {
  it('should return updated settings on success', async () => {
    const settings: AcademySettings = {
      defaultDueDateDay: 10,
      receiptPrefix: 'INV',
      lateFeeEnabled: false,
      gracePeriodDays: 5,
      lateFeeAmountInr: 0,
      lateFeeRepeatIntervalDays: 5,
    };
    const deps = makeApi(ok(settings));

    const result = await updateAcademySettingsUseCase(deps, { defaultDueDateDay: 10 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.defaultDueDateDay).toBe(10);
      expect(result.value.receiptPrefix).toBe('INV');
    }
    expect(deps.settingsApi.updateAcademySettings).toHaveBeenCalledWith({ defaultDueDateDay: 10 });
  });

  it('should propagate API error', async () => {
    const deps = makeApi(err({ code: 'FORBIDDEN', message: 'Only owners can update settings' }));

    const result = await updateAcademySettingsUseCase(deps, { receiptPrefix: 'NEW' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should return UNKNOWN for invalid server response', async () => {
    const deps = makeApi(ok({ defaultDueDateDay: 99, receiptPrefix: 'X' } as AcademySettings));

    const result = await updateAcademySettingsUseCase(deps, { defaultDueDateDay: 99 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNKNOWN');
    }
  });
});
