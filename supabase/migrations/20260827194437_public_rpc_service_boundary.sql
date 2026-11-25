begin;

revoke execute on function public.get_legal_training_response(text, text)
  from public, anon, authenticated;
revoke execute on function public.get_prohibited_rules(text)
  from public, anon, authenticated;
revoke execute on function public.verify_white_label_license(text)
  from public, anon, authenticated;

grant execute on function public.get_legal_training_response(text, text)
  to service_role;
grant execute on function public.get_prohibited_rules(text)
  to service_role;
grant execute on function public.verify_white_label_license(text)
  to service_role;

comment on function public.get_legal_training_response(text, text)
  is 'Backend-only global legal training lookup; callable by service_role only.';
comment on function public.get_prohibited_rules(text)
  is 'Backend-only prohibited-rules lookup; callable by service_role only.';
comment on function public.verify_white_label_license(text)
  is 'Backend-only white-label verification boundary; callable by service_role only.';

commit;;
