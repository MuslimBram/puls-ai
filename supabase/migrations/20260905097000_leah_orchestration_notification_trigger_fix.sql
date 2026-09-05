drop trigger if exists leah_paid_ai_approval_notification on public.leah_ai_spend_approval_requests;

after insert on public.leah_ai_spend_approval_requests
for each row execute function public.leah_notify_paid_ai_approval();

create trigger leah_paid_ai_approval_notification_insert
after insert on public.leah_ai_spend_approval_requests
for each row execute function public.leah_notify_paid_ai_approval();

create trigger leah_paid_ai_approval_notification_reopen
after update of status on public.leah_ai_spend_approval_requests
for each row
when (NEW.status='pending')
execute function public.leah_notify_paid_ai_approval();
