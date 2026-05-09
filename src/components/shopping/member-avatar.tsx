"use client";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { memberInfo, relativeTime } from "@/lib/utils/member";
import type { Household, ProvenanceStamp } from "@/lib/types/household";

interface Props {
  household: Household | null;
  stamp: ProvenanceStamp | null | undefined;
  /** Verb shown in the tooltip — e.g. "Skipped", "Added", "Ticked". */
  action: string;
  size?: "sm" | "default" | "lg";
  className?: string;
}

/**
 * Tiny avatar showing who took a recent shared-pantry action.
 * Renders nothing when the stamp is missing or carries the legacy unknown-actor
 * sentinel (uid === ""), so older data degrades gracefully.
 */
export function MemberAvatar({
  household,
  stamp,
  action,
  size = "sm",
  className,
}: Props) {
  if (!stamp || !stamp.uid) return null;
  const info = memberInfo(household, stamp.uid);
  const when = relativeTime(stamp.at);
  const title = `${action} by ${info.name}${when ? ` · ${when}` : ""}`;
  return (
    <Avatar size={size} title={title} aria-label={title} className={className}>
      {info.photo && <AvatarImage src={info.photo} alt={info.name} />}
      <AvatarFallback>{info.initial}</AvatarFallback>
    </Avatar>
  );
}
