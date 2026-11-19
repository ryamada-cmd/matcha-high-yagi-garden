import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { MEDIA_CHUNK_BYTES, MEDIA_MAX_BYTES, mediaFormat, matchMediaSignature } from '../supabase/functions/shared-media/format.ts'
import { graphError, httpsUrl, originalUrl, readPrefix } from '../supabase/functions/shared-media/onedrive.ts'

test('media allowlist validates byte signatures and Graph upload boundaries',()=>{
  const bytes=value=>Buffer.from(value,'latin1')
  const iso=brand=>bytes('\0\0\0\x14ftyp'+brand+'\0\0\0\0'+brand)
  for(const [name,header] of [
    ['image.jpeg',bytes('\xff\xd8\xff')],['image.PNG',bytes('\x89PNG\r\n\x1a\n')],
    ['image.heic',iso('heic')],['video.mp4',iso('isom')],['video.MOV',iso('qt  ')],
    ['photo.dng',bytes('II*\0')],['photo.webp',bytes('RIFF\0\0\0\0WEBP')],
  ]) {
    assert.equal(matchMediaSignature(mediaFormat(name),header),true,name)
    assert.equal(matchMediaSignature(mediaFormat(name),bytes('<script>bad()</script>')),false,name)
  }
  assert.equal(mediaFormat('image.jpg.html'),null)
  assert.equal(mediaFormat('image.svg'),null)
  assert.equal(mediaFormat('toString'),null)
  assert.equal(matchMediaSignature(mediaFormat('photo.heic'),iso('isom')),false)
  assert.equal(MEDIA_CHUNK_BYTES % (320*1024),0)
  assert.equal(MEDIA_MAX_BYTES,20_000_000_000)
  for(const size of [100_000_000,1_000_000_000,5_000_000_000,20_000_000_000]) {
    const parts=Math.ceil(size/MEDIA_CHUNK_BYTES)
    const last=size-(parts-1)*MEDIA_CHUNK_BYTES
    assert.ok(last>0 && last<=MEDIA_CHUNK_BYTES)
    assert.equal((parts-1)*MEDIA_CHUNK_BYTES+last,size)
  }
})

test('Graph keeps throttling, quota, and transient errors distinct',()=>{
  assert.deepEqual([429,507,503].map(status=>graphError(new Response(null,{status})).status),[429,507,503])
  assert.equal(graphError(new Response(null,{status:429,headers:{'Retry-After':'9'}})).retryAfter,'9')
  assert.throws(()=>httpsUrl('http://example.com'),/URL/)
  assert.throws(()=>httpsUrl('https://key:password@example.com'),/URL/)
})

test('Graph legacy download fallback does not follow or buffer the response',async()=>{
  const original='https://download.example.invalid/secret'
  const graph=async(path,init)=>{
    assert.ok(path.endsWith('/content'))
    assert.equal(init.redirect,'manual')
    return new Response(null,{status:302,headers:{Location:original}})
  }
  assert.equal(await originalUrl(graph,'drive','file'),original)
  assert.equal(await originalUrl(()=>assert.fail('annotation requires no redirect'),'drive','file',original),original)
  const fakeFetch=globalThis.fetch
  try {
    globalThis.fetch=async(_input,init)=>{
      assert.equal(init.headers.Range,'bytes=0-4095')
      return new Response(new Uint8Array(4096).fill(88),{status:206,headers:{'Content-Range':'bytes 0-4095/20000000000'}})
    }
    assert.equal((await readPrefix(original,20_000_000_000)).length,4096)
    globalThis.fetch=async()=>new Response(new Uint8Array(4096),{status:200})
    await assert.rejects(readPrefix(original,20_000_000_000))
  } finally {globalThis.fetch=fakeFetch}
})

const keys={
  admin:'00000000-0000-4000-8000-000000000010',owner:'00000000-0000-4000-8000-000000000020',
  other:'00000000-0000-4000-8000-000000000030',viewer:'00000000-0000-4000-8000-000000000040',
  photo:'00000000-0000-4000-8000-000000000050',private:'00000000-0000-4000-8000-000000000060',
  session:'00000000-0000-4000-8000-000000000070',
}
const legacySchema=`
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to authenticated,service_role;
create table public.profiles(id uuid primary key,role text);
create table public.fields(id uuid primary key);
create table public.equipment_assets(id uuid primary key);
create table public.external_files(
  id uuid primary key default gen_random_uuid(),provider text,drive_id text,provider_item_id text,file_name text,mime_type text,
  size_bytes bigint,folder_path text,web_url text,sha1_hash text,uploaded_by uuid,uploaded_at timestamptz default now(),
  archived_at timestamptz,metadata jsonb
);
create unique index external_file_unique on public.external_files(provider,drive_id,provider_item_id) where archived_at is null;
create table public.external_file_links(
  id uuid primary key default gen_random_uuid(),file_id uuid not null references public.external_files(id),
  entity_type text not null,entity_id text,category text,note text,created_by uuid,created_at timestamptz default now()
);
grant all on public.profiles,public.fields,public.equipment_assets,public.external_files,public.external_file_links to service_role;
insert into public.profiles values ('${keys.admin}','admin'),('${keys.owner}','worker'),('${keys.other}','worker'),('${keys.viewer}','viewer');
insert into public.external_files(id,provider,drive_id,provider_item_id,file_name,size_bytes,uploaded_by,metadata) values
  ('${keys.photo}','ONEDRIVE','drive','old-photo','old.jpeg',45,'${keys.owner}','{"kind":"photo","album":"畑","takenAt":"2026-11-19"}'),
  ('${keys.private}','ONEDRIVE','drive','private','daily.jpeg',55,'${keys.owner}','{"kind":"photo","album":"日報"}');
insert into public.external_file_links(file_id,entity_type) values ('${keys.photo}','photo'),('${keys.private}','daily_report');
`

test('additive migration isolates private attachments and enforces approval, ownership and idempotency',async()=>{
  const db=new PGlite()
  const scalar=async sql=>Object.values((await db.query(sql)).rows[0]||{})[0]
  const setUser=async user=>db.exec(`reset role; set request.jwt.claim.sub='${user}'; set role authenticated`)
  try {
    await db.exec(legacySchema)
    await db.exec(readFileSync(new URL('../supabase/migrations/20261119071653_shared_media_gallery.sql',import.meta.url),'utf8'))
    await setUser(keys.viewer)
    assert.equal(await scalar('select media_can_access()'),false)
    assert.equal(await scalar('select count(*)::int from media_items'),0)
    await assert.rejects(db.query('select * from media_upload_sessions'),/permission denied/)
    await assert.rejects(db.query('select media_finalize(null,null,null,null,null)'),/permission denied/)
    await setUser(keys.owner)
    assert.equal(await scalar('select media_can_access()'),true)
    assert.equal(await scalar('select original_name from media_items'),'old.jpeg')
    await assert.rejects(db.query("update media_items set note='forged'"),/permission denied/)
    await db.exec('set role service_role')
    await db.query('select media_set_approval($1,$2,true)',[keys.admin,keys.viewer])
    assert.equal(await scalar(`select role from profiles where id='${keys.viewer}'`),'viewer')
    await setUser(keys.viewer)
    assert.equal(await scalar('select media_can_access()'),true)
    await db.exec('set role service_role')
    assert.equal(await scalar(`select media_edit('${keys.other}','${keys.photo}','{"category":"圃場"}')`),false)
    assert.equal(await scalar(`select media_edit('${keys.owner}','${keys.photo}','{"category":"圃場"}')`),true)
    await db.query(`insert into media_upload_sessions(id,owner_id,original_name,fingerprint,size_bytes,mime_type,kind,category,drive_id,folder_path,object_name)
      values ($1,$2,'new.mp4',repeat('a',64),100,'video/mp4','video','イベント','drive','isolated','new.mp4')`,[keys.session,keys.owner])
    const first=await scalar(`select media_finalize('${keys.session}','${keys.owner}','verified',null,null)`)
    assert.equal(await scalar(`select media_finalize('${keys.session}','${keys.owner}','verified',null,null)`),first)
    assert.equal(await scalar("select count(*)::int from external_files where provider_item_id='verified'"),1)
    await assert.rejects(db.query(`insert into media_upload_sessions(id,owner_id,original_name,fingerprint,size_bytes,mime_type,kind,category,drive_id,folder_path,object_name)
      values (gen_random_uuid(),$1,'new.mp4',repeat('a',64),100,'video/mp4','video','イベント','drive','another','new.mp4')`,[keys.owner]),/duplicate/)
    await db.query('select media_set_approval($1,$2,false)',[keys.admin,keys.viewer])
    await setUser(keys.viewer)
    assert.equal(await scalar('select count(*)::int from media_items'),0)
    await db.exec('set role service_role')
    await db.query("insert into external_file_links(file_id,entity_type) values ($1,'daily_report')",[keys.photo])
    await setUser(keys.owner)
    assert.equal(await scalar("select count(*)::int from media_items where original_name='old.jpeg'"),0)
  } finally {await db.close()}
})
