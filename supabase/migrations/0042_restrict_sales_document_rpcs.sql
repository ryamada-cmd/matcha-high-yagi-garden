-- 0042_restrict_sales_document_rpcs.sql
-- New sales-document RPCs are intended for signed-in users only.

revoke execute on function public.save_document_customer(uuid,jsonb) from public, anon;
revoke execute on function public.delete_document_customer(uuid) from public, anon;
revoke execute on function public.update_document_company_settings(jsonb) from public, anon;
revoke execute on function public.save_sales_document(uuid,jsonb) from public, anon;
revoke execute on function public.delete_sales_document(uuid) from public, anon;

grant execute on function public.save_document_customer(uuid,jsonb) to authenticated;
grant execute on function public.delete_document_customer(uuid) to authenticated;
grant execute on function public.update_document_company_settings(jsonb) to authenticated;
grant execute on function public.save_sales_document(uuid,jsonb) to authenticated;
grant execute on function public.delete_sales_document(uuid) to authenticated;
