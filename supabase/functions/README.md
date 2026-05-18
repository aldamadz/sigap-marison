# Read-Only Surat API (Supabase Edge Functions)

Functions:
- `surat-registrations`
- `surat-reservations`
- `surat-signatures`

Semua function bersifat **read-only**:
- `GET` = allowed
- selain `GET` = `405 Method Not Allowed`

## Deploy

```bash
supabase login
supabase link --project-ref xuhyodtmgwteyslhrkfx

supabase functions deploy surat-registrations
supabase functions deploy surat-reservations
supabase functions deploy surat-signatures
```

## Invoke URL

```text
https://xuhyodtmgwteyslhrkfx.functions.supabase.co/surat-registrations
https://xuhyodtmgwteyslhrkfx.functions.supabase.co/surat-reservations
https://xuhyodtmgwteyslhrkfx.functions.supabase.co/surat-signatures
```

## Example cURL

```bash
curl -X GET "https://xuhyodtmgwteyslhrkfx.functions.supabase.co/surat-registrations?status=PROSES&page=1&limit=10" \
  -H "Authorization: Bearer <ANON_OR_USER_JWT>" \
  -H "apikey: <SUPABASE_ANON_KEY>"
```
