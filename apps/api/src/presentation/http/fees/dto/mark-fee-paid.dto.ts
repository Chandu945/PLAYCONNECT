import { IsOptional, IsIn } from 'class-validator';
import type { PaymentLabel } from '@playconnect/contracts';

export class MarkFeePaidBodyDto {
  @IsOptional()
  @IsIn(['CASH', 'UPI', 'CARD', 'NET_BANKING', 'ONLINE'])
  paymentLabel?: PaymentLabel;
}
