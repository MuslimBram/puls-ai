
-- Function to auto-delete accounts that haven't paid within 30 days of registration
CREATE OR REPLACE FUNCTION public.cleanup_expired_unpaid_accounts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _deleted_count INT := 0;
  _user_record RECORD;
BEGIN
  -- Find users with trial/unpaid subscriptions created more than 30 days ago
  FOR _user_record IN
    SELECT s.user_id, s.created_at, s.payment_status
    FROM public.subscriptions s
    WHERE s.payment_status IN ('trial', 'unpaid', 'expired')
      AND s.created_at < now() - interval '30 days'
      -- Exclude admins/super_admins
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = s.user_id
          AND ur.role IN ('admin', 'super_admin')
      )
      -- Exclude ambassadors (they don't need to pay)
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = s.user_id
          AND ur.role = 'ambassador'
      )
  LOOP
    -- Log the deletion in audit_logs before removing
    INSERT INTO public.audit_logs (actor_id, action, target_id, target_type, metadata)
    VALUES (
      _user_record.user_id,
      'auto_delete_unpaid_account',
      _user_record.user_id::text,
      'user',
      jsonb_build_object(
        'reason', 'No payment within 30 days of registration',
        'registration_date', _user_record.created_at,
        'payment_status', _user_record.payment_status
      )
    );

    -- Delete user from auth.users (cascades to profiles, subscriptions, etc.)
    DELETE FROM auth.users WHERE id = _user_record.user_id;
    
    _deleted_count := _deleted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'deleted_count', _deleted_count,
    'executed_at', now()
  );
END;
$$;
