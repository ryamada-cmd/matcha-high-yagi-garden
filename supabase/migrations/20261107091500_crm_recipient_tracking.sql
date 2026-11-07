-- Record the destination address of the inquiry, independent of the Google OAuth mailbox.
-- Supports multiple branded sales email aliases delivered into one Gmail inbox.
alter table public.crm_inquiries
 add column if not exists received_address text;

create index if not exists crm_inquiries_received_address_idx
 on public.crm_inquiries(received_address)
 where received_address is not null;

comment on column public.crm_inquiries.received_address is
 'Original inquiry destination address inferred from inbound Gmail headers, not the OAuth mailbox address';
