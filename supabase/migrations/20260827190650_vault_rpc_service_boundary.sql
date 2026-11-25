-- Restrict decrypted Vault secret operations to trusted backend execution.
begin;

revoke execute on function public.vault_store_secret(uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.vault_read_secret(text)
  from public, anon, authenticated;
revoke execute on function public.vault_delete_secret(text)
  from public, anon, authenticated;

grant execute on function public.vault_store_secret(uuid, text, text, text)
  to service_role;
grant execute on function public.vault_read_secret(text)
  to service_role;
grant execute on function public.vault_delete_secret(text)
  to service_role;

comment on function public.vault_store_secret(uuid, text, text, text)
  is 'Backend-only Vault write boundary; callable by service_role only.';
comment on function public.vault_read_secret(text)
  is 'Backend-only decrypted Vault read boundary; callable by service_role only.';
comment on function public.vault_delete_secret(text)
  is 'Backend-only Vault delete boundary; callable by service_role only.';

commit;;
