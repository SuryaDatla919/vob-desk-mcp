// Data minimization: outputs never carry a full member ID.

const MEMBER_ID = /^SYN-(\d{4})-(\d{2})$/;

/** Canonical form used for lookups: trimmed and upper-case. */
export function normalizeMemberId(memberId: string): string {
  return memberId.trim().toUpperCase();
}

/** "SYN-1001-02" -> "SYN-****-02". Anything that is not a member ID is fully masked. */
export function maskMemberId(memberId: string): string {
  const match = MEMBER_ID.exec(normalizeMemberId(memberId));
  return match ? `SYN-****-${match[2]}` : '****';
}
