import { Entity, UniqueId } from '@shared/kernel';

export interface SessionProps {
  userId: string;
  deviceId: string;
  refreshTokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  lastRotatedAt: Date | null;
  /**
   * The refresh-token hash that was current immediately before the last
   * rotation, kept valid until `previousRefreshTokenExpiresAt` (rotation
   * grace window). Lets a client that lost a rotation response retry with
   * its prior token without being treated as token reuse — so a dropped
   * network response does not force an undesired automatic logout.
   */
  previousRefreshTokenHash: string | null;
  previousRefreshTokenExpiresAt: Date | null;
}

export class Session extends Entity<SessionProps> {
  private constructor(id: UniqueId, props: SessionProps) {
    super(id, props);
  }

  static create(params: {
    id: string;
    userId: string;
    deviceId: string;
    refreshTokenHash: string;
    expiresAt: Date;
  }): Session {
    return new Session(new UniqueId(params.id), {
      userId: params.userId,
      deviceId: params.deviceId,
      refreshTokenHash: params.refreshTokenHash,
      createdAt: new Date(),
      expiresAt: params.expiresAt,
      revokedAt: null,
      lastRotatedAt: null,
      previousRefreshTokenHash: null,
      previousRefreshTokenExpiresAt: null,
    });
  }

  static reconstitute(id: string, props: SessionProps): Session {
    return new Session(new UniqueId(id), props);
  }

  get userId(): string {
    return this.props.userId;
  }

  get deviceId(): string {
    return this.props.deviceId;
  }

  get refreshTokenHash(): string {
    return this.props.refreshTokenHash;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get revokedAt(): Date | null {
    return this.props.revokedAt;
  }

  get previousRefreshTokenHash(): string | null {
    return this.props.previousRefreshTokenHash;
  }

  get previousRefreshTokenExpiresAt(): Date | null {
    return this.props.previousRefreshTokenExpiresAt;
  }

  isExpired(): boolean {
    return new Date() > this.props.expiresAt;
  }

  isRevoked(): boolean {
    return this.props.revokedAt !== null;
  }

  /** True while the immediately-previous refresh token is still within the
   *  rotation grace window and may be accepted in place of the current one. */
  isWithinRotationGrace(now: Date = new Date()): boolean {
    return (
      this.props.previousRefreshTokenExpiresAt !== null &&
      now < this.props.previousRefreshTokenExpiresAt
    );
  }

  isValid(): boolean {
    return !this.isRevoked() && !this.isExpired();
  }
}
