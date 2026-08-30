-- Cover user foreign keys used by invoice and payment audit columns.

create index if not exists idx_vendor_invoices_created_by on public.vendor_invoices(created_by);
create index if not exists idx_vendor_invoices_updated_by on public.vendor_invoices(updated_by);
create index if not exists idx_vendor_invoices_deleted_by on public.vendor_invoices(deleted_by);
create index if not exists idx_vendor_invoice_payments_created_by on public.vendor_invoice_payments(created_by);
create index if not exists idx_vendor_invoice_payments_updated_by on public.vendor_invoice_payments(updated_by);
create index if not exists idx_vendor_invoice_payments_deleted_by on public.vendor_invoice_payments(deleted_by);
