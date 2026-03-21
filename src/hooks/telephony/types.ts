export type TelephonyStatus = "online" | "busy" | "on_call" | "wrap_up" | "offline" | "dnd";
export type CallStatus = "ringing" | "queued" | "in_progress" | "on_hold" | "transferring" | "completed" | "failed";

export interface ActiveCall {
  id: string;
  workspace_id: string;
  call_record_id: string | null;
  queue_id: string | null;
  agent_user_id: string | null;
  caller_number: string;
  caller_name: string | null;
  callee_number: string | null;
  direction: string;
  status: CallStatus;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  hold_started_at: string | null;
  total_hold_seconds: number;
  transfer_target: string | null;
  sip_call_id: string | null;
  metadata: Record<string, unknown>;
}

export interface AgentTelephonyState {
  id: string;
  user_id: string;
  workspace_id: string;
  telephony_status: TelephonyStatus;
  current_call_id: string | null;
  last_call_ended_at: string | null;
  calls_handled_today: number;
  avg_handle_time_seconds: number;
  sip_extension: string | null;
  sip_registered: boolean;
}

export interface CallQueue {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  strategy: string;
  max_wait_seconds: number;
  wrap_up_seconds: number;
  is_active: boolean;
  priority: number;
}
