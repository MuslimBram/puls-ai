import React from "react";
import { type ChannelCapability, type ConnectedChannel, hasCapability } from "@/hooks/useChannelCapabilities";

interface ChannelCapabilityGateProps {
  channel: ConnectedChannel | null | undefined;
  capability: ChannelCapability;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders children only if the connected channel
 * has the specified capability. Shows fallback (or nothing) otherwise.
 */
export const ChannelCapabilityGate: React.FC<ChannelCapabilityGateProps> = ({
  channel,
  capability,
  children,
  fallback = null,
}) => {
  if (!hasCapability(channel, capability)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
};
