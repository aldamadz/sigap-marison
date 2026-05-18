# 📖 DOKUMENTASI API - READ ONLY
## Tabel: surat_registrasi, surat_reservations, surat_signatures

---

## 🔗 BASE URL & KREDENSIAL

```
BASE URL: https://xuhyodtmgwteyslhrkfx.supabase.co
REST API: https://xuhyodtmgwteyslhrkfx.supabase.co/rest/v1

Headers yang diperlukan:
- apikey: YOUR_ANON_KEY
- Authorization: Bearer YOUR_JWT_TOKEN
```

---

## 📋 ENDPOINTS READ ONLY

### 1️⃣ SURAT_REGISTRASI

#### **GET All Surat**
```http
GET /rest/v1/surat_registrasi?select=*
```

**cURL:**
```bash
curl -X GET 'https://xuhyodtmgwteyslhrkfx.supabase.co/rest/v1/surat_registrasi?select=*' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Supabase JS:**
```javascript
const { data, error } = await supabase
  .from('surat_registrasi')
  .select('*')
```

**Response:**
```json
[
  {
    "id": "86067db5-268c-4b85-9a3e-58036f36db79",
    "no_surat": "001/UAI/PGD.1/IV/2026",
    "judul_surat": "Pengajuan Barang",
    "status": "DONE",
    "pic_review_status": "SPK",
    "chat_status": "CLOSED",
    "created_at": "2026-04-07T07:29:30.78461+00:00"
  }
]
```

---

#### **GET Surat dengan Filter**
```http
GET /rest/v1/surat_registrasi?status=eq.PROSES&select=*
```

**Operators:**
| Operator | Deskripsi | Contoh |
|----------|-----------|--------|
| `eq` | Equal | `status=eq.DONE` |
| `neq` | Not equal | `status=neq.DELETED` |
| `gt` | Greater than | `created_at=gt.2026-01-01` |
| `gte` | Greater than or equal | `current_step=gte.2` |
| `lt` | Less than | `created_at=lt.2026-04-01` |
| `lte` | Less than or equal | `created_at=lte.now()` |
| `like` | Pattern matching | `judul_surat=like.*Pengajuan*` |
| `ilike` | Case-insensitive like | `judul_surat=ilike.*pengajuan*` |
| `is` | Is null/not null | `pic_id=is.null` |
| `in` | In array | `status=in.(DONE,PROSES)` |

**cURL:**
```bash
# Filter status = PROSES
curl -X GET 'https://xuhyodtmgwteyslhrkfx.supabase.co/rest/v1/surat_registrasi?status=eq.PROSES&select=*' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Filter multiple status
curl -X GET 'https://xuhyodtmgwteyslhrkfx.supabase.co/rest/v1/surat_registrasi?status=in.(DONE,PROSES)&select=*' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Filter dengan like (cari judul mengandung "Barang")
curl -X GET 'https://xuhyodtmgwteyslhrkfx.supabase.co/rest/v1/surat_registrasi?judul_surat=like.*Barang*&select=*' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Supabase JS:**
```javascript
// Filter status
const { data } = await supabase
  .from('surat_registrasi')
  .select('*')
  .eq('status', 'PROSES')

// Filter multiple status
const { data } = await supabase
  .from('surat_registrasi')
  .select('*')
  .in('status', ['DONE', 'PROSES'])

// Filter dengan like
const { data } = await supabase
  .from('surat_registrasi')
  .select('*')
  .ilike('judul_surat', '%Barang%')

// Filter tanggal
const { data } = await supabase
  .from('surat_registrasi')
  .select('*')
  .gte('created_at', '2026-04-01')
  .lte('created_at', '2026-04-30')

// Filter null
const { data } = await supabase
  .from('surat_registrasi')
  .select('*')
  .is('pic_id', null)
```

---

#### **GET Surat dengan JOIN (Relasi)**
```http
GET /rest/v1/surat_registrasi?select=*,master_entities(name),master_offices(name),profiles(full_name)
```

**cURL:**
```bash
curl -X GET 'https://xuhyodtmgwteyslhrkfx.supabase.co/rest/v1/surat_registrasi?select=id,no_surat,judul_surat,status,master_entities(name),master_offices(code,name),profiles!surat_registrasi_created_by_fkey(full_name)' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Supabase JS:**
```javascript
const { data } = await supabase
  .from('surat_registrasi')
  .select(`
    id,
    no_surat,
    judul_surat,
    status,
    pic_review_status,
    chat_status,
    created_at,
    master_entities (name),
    master_offices (code, name),
    master_departments (name),
    master_projects (name),
    master_letter_types (name),
    profiles!surat_registrasi_created_by_fkey (full_name),
    pic:profiles!surat_registrasi_pic_id_fkey (full_name)
  `)
```

**Response:**
```json
[
  {
    "id": "86067db5-268c-4b85-9a3e-58036f36db79",
    "no_surat": "001/UAI/PGD.1/IV/2026",
    "judul_surat": "Pengajuan Barang",
    "status": "DONE",
    "pic_review_status": "SPK",
    "chat_status": "CLOSED",
    "created_at": "2026-04-07T07:29:30.78461+00:00",
    "master_entities": { "name": "UAI" },
    "master_offices": { "code": "PGD.1", "name": "Pangandaran 1" },
    "master_departments": { "name": "HRD" },
    "master_projects": { "name": "Proyek A" },
    "master_letter_types": { "name": "Surat Pengajuan" },
    "profiles": { "full_name": "Andrian Ardiyanto" },
    "pic": { "full_name": "Wahyu Adam Prastyo" }
  }
]
```

---

#### **GET Single Surat by ID**
```http
GET /rest/v1/surat_registrasi?id=eq.{uuid}&select=*
```

**cURL:**
```bash
curl -X GET 'https://xuhyodtmgwteyslhrkfx.supabase.co/rest/v1/surat_registrasi?id=eq.86067db5-268c-4b85-9a3e-58036f36db79&select=*' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Supabase JS:**
```javascript
const { data } = await supabase
  .from('surat_registrasi')
  .select('*')
  .eq('id', '86067db5-268c-4b85-9a3e-58036f36db79')
  .single()
```

---

#### **GET dengan Pagination**
```http
GET /rest/v1/surat_registrasi?select=*&limit=10&offset=0
```

**cURL:**
```bash
# Page 1 (items 1-10)
curl -X GET 'https://xuhyodtmgwteyslhrkfx.supabase.co/rest/v1/surat_registrasi?select=*&limit=10&offset=0' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Page 2 (items 11-20)
curl -X GET 'https://xuhyodtmgwteyslhrkfx.supabase.co/rest/v1/surat_registrasi?select=*&limit=10&offset=10' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Supabase JS:**
```javascript
const page = 1
const limit = 10
const offset = (page - 1) * limit

const { data, error, count } = await supabase
  .from('surat_registrasi')
  .select('*', { count: 'exact' })
  .range(offset, offset + limit - 1)
  .order('created_at', { ascending: false })

console.log(`Total: ${count}, Page: ${page}`)
```

---

#### **GET dengan Sorting**
```http
GET /rest/v1/surat_registrasi?select=*&order=created_at.desc
```

**cURL:**
```bash
# Sort by created_at descending
curl -X GET 'https://xuhyodtmgwteyslhrkfx.supabase.co/rest/v1/surat_registrasi?select=*&order=created_at.desc' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Sort multiple columns
curl -X GET 'https://xuhyodtmgwteyslhrkfx.supabase.co/rest/v1/surat_registrasi?select=*&order=status.asc,created_at.desc' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Supabase JS:**
```javascript
const { data } = await supabase
  .from('surat_registrasi')
  .select('*')
  .order('created_at', { ascending: false })

// Multiple sort
const { data } = await supabase
  .from('surat_registrasi')
  .select('*')
  .order('status', { ascending: true })
  .order('created_at', { ascending: false })
```

---

#### **GET dengan Count**
```http
GET /rest/v1/surat_registrasi?select=*&limit=1
Prefer: count=exact
```

**cURL:**
```bash
curl -X GET 'https://xuhyodtmgwteyslhrkfx.supabase.co/rest/v1/surat_registrasi?select=id&limit=1' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Prefer: count=exact" \
  -I
```

**Response Header:**
```
Content-Range: 0-0/24
```
(Total: 24 records)

---

### 2️⃣ SURAT_RESERVATIONS

#### **GET All Reservations**
```http
GET /rest/v1/surat_reservations?select=*
```

**cURL:**
```bash
curl -X GET 'https://xuhyodtmgwteyslhrkfx.supabase.co/rest/v1/surat_reservations?select=*' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Supabase JS:**
```javascript
const { data } = await supabase
  .from('surat_reservations')
  .select('*')
```

**Response:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "entity_id": "uuid-entity",
    "type_id": "uuid-type",
    "year": 2026,
    "no_urut": 15,
    "status": "PENDING",
    "office_id": "uuid-office",
    "project_id": "uuid-project",
    "dept_id": "uuid-dept",
    "reserved_by": "uuid-user",
    "created_at": "2026-04-07T10:00:00+00:00",
    "expires_at": "2026-04-07T10:30:00+00:00"
  }
]
```

---

#### **GET Active Reservations**
```http
GET /rest/v1/surat_reservations?status=eq.PENDING&expires_at=gte.now()&select=*
```

**cURL:**
```bash
curl -X GET 'https://xuhyodtmgwteyslhrkfx.supabase.co/rest/v1/surat_reservations?status=eq.PENDING&expires_at=gte.now()&select=*' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Supabase JS:**
```javascript
const { data } = await supabase
  .from('surat_reservations')
  .select('*')
  .eq('status', 'PENDING')
  .gte('expires_at', new Date().toISOString())
```

---

#### **GET Reservations by User**
```http
GET /rest/v1/surat_reservations?reserved_by=eq.{user_uuid}&select=*
```

**Supabase JS:**
```javascript
const { data } = await supabase
  .from('surat_reservations')
  .select(`
    *,
    master_departments (name),
    profiles (full_name)
  `)
  .eq('reserved_by', userId)
  .order('created_at', { ascending: false })
```

---

#### **GET Next Available Number**
```http
GET /rest/v1/surat_reservations?entity_id=eq.{uuid}&type_id=eq.{uuid}&year=eq.2026&select=no_urut&order=no_urut.desc&limit=1
```

**Supabase JS:**
```javascript
async function getNextSuratNumber(entityId, typeId, year) {
  const { data, error } = await supabase
    .from('surat_reservations')
    .select('no_urut')
    .eq('entity_id', entityId)
    .eq('type_id', typeId)
    .eq('year', year)
    .order('no_urut', { ascending: false })
    .limit(1)

  if (error) throw error
  
  const nextNumber = data.length > 0 ? data[0].no_urut + 1 : 1
  return nextNumber
}
```

---

### 3️⃣ SURAT_SIGNATURES

#### **GET All Signatures**
```http
GET /rest/v1/surat_signatures?select=*
```

**cURL:**
```bash
curl -X GET 'https://xuhyodtmgwteyslhrkfx.supabase.co/rest/v1/surat_signatures?select=*' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

#### **GET Signatures by Surat**
```http
GET /rest/v1/surat_signatures?surat_id=eq.{uuid}&select=*&order=step_order.asc
```

**cURL:**
```bash
curl -X GET 'https://xuhyodtmgwteyslhrkfx.supabase.co/rest/v1/surat_signatures?surat_id=eq.86067db5-268c-4b85-9a3e-58036f36db79&select=*&order=step_order.asc' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Supabase JS:**
```javascript
const { data } = await supabase
  .from('surat_signatures')
  .select(`
    *,
    profiles (full_name, job_title)
  `)
  .eq('surat_id', suratId)
  .order('step_order', { ascending: true })
```

**Response:**
```json
[
  {
    "id": "sig-uuid-1",
    "surat_id": "86067db5-268c-4b85-9a3e-58036f36db79",
    "user_id": "user-uuid-1",
    "role_name": "Membuat",
    "step_order": 1,
    "is_signed": true,
    "signed_at": "2026-04-07T08:00:00+00:00",
    "digital_stamp": "stamp-hash-here",
    "catatan": "Disetujui",
    "status": "COMPLETED",
    "profiles": { "full_name": "Andrian Ardiyanto", "job_title": "Staff" }
  },
  {
    "id": "sig-uuid-2",
    "surat_id": "86067db5-268c-4b85-9a3e-58036f36db79",
    "user_id": "user-uuid-2",
    "role_name": "Memeriksa",
    "step_order": 2,
    "is_signed": false,
    "signed_at": null,
    "digital_stamp": null,
    "catatan": null,
    "status": "PENDING",
    "profiles": { "full_name": "Wahyu Adam", "job_title": "Manager" }
  }
]
```

---

#### **GET Signature Progress Summary**
```http
GET /rest/v1/surat_signatures?surat_id=eq.{uuid}&select=is_signed&is_signed=eq.true
Prefer: count=exact
```

**Supabase JS:**
```javascript
async function getSignatureProgress(suratId) {
  // Get all signatures
  const { data: allSigs, count: total } = await supabase
    .from('surat_signatures')
    .select('*', { count: 'exact' })
    .eq('surat_id', suratId)

  // Get signed signatures
  const { data: signedSigs, count: signed } = await supabase
    .from('surat_signatures')
    .select('*', { count: 'exact' })
    .eq('surat_id', suratId)
    .eq('is_signed', true)

  return {
    total: total || 0,
    signed: signed || 0,
    pending: (total || 0) - (signed || 0),
    percentage: total ? Math.round(((signed || 0) / total) * 100) : 0
  }
}
```

---

#### **GET Signatures by User**
```http
GET /rest/v1/surat_signatures?user_id=eq.{uuid}&select=*
```

**Supabase JS:**
```javascript
const { data } = await supabase
  .from('surat_signatures')
  .select(`
    *,
    surat_registrasi (no_surat, judul_surat, status)
  `)
  .eq('user_id', userId)
  .eq('is_signed', false)
  .order('created_at', { ascending: false })
```

---

## 🔧 ADVANCED QUERIES

### **Search Surat (Full Text)**
```javascript
const { data } = await supabase
  .from('surat_registrasi')
  .select(`
    id,
    no_surat,
    judul_surat,
    status,
    profiles (full_name)
  `)
  .or(`judul_surat.ilike.%${keyword}%,no_surat.ilike.%${keyword}%`)
  .order('created_at', { ascending: false })
  .limit(20)
```

### **Dashboard Stats**
```javascript
async function getDashboardStats() {
  // Total surat
  const { count: totalSurat } = await supabase
    .from('surat_registrasi')
    .select('*', { count: 'exact', head: true })

  // Surat by status
  const { data: byStatus } = await supabase
    .from('surat_registrasi')
    .select('status')

  // Group by status
  const statusCounts = byStatus.reduce((acc, curr) => {
    acc[curr.status] = (acc[curr.status] || 0) + 1
    return acc
  }, {})

  // Surat this month
  const { count: thisMonth } = await supabase
    .from('surat_registrasi')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())

  return {
    total: totalSurat,
    byStatus: statusCounts,
    thisMonth: thisMonth
  }
}
```

---

## ⚠️ ERROR HANDLING

### **Response Codes**

| Status | Deskripsi |
|--------|-----------|
| 200 | Success |
| 400 | Bad Request (query error) |
| 401 | Unauthorized (token invalid) |
| 403 | Forbidden (RLS policy violation) |
| 404 | Not Found |
| 409 | Conflict (unique violation) |

### **Error Response Example**
```json
{
  "code": "PGRST116",
  "details": "Results contain 1001 rows, application/vnd.pgrst.object+json requires 1 row",
  "hint": null,
  "message": "JSON object requested, multiple (or no) rows returned"
}
```

### **Error Handler (JavaScript)**
```javascript
async function fetchSurat() {
  try {
    const { data, error } = await supabase
      .from('surat_registrasi')
      .select('*')

    if (error) throw error

    return { success: true, data }
  } catch (error) {
    console.error('Error fetching surat:', error.message)
    return { 
      success: false, 
      error: error.message,
      code: error.code 
    }
  }
}
```

---

## 📱 REACT HOOK EXAMPLE

```typescript
// hooks/useSurat.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useSuratList(filters?: { status?: string; search?: string }) {
  return useQuery({
    queryKey: ['surat', filters],
    queryFn: async () => {
      let query = supabase
        .from('surat_registrasi')
        .select(`
          *,
          master_entities (name),
          master_offices (name),
          profiles (full_name)
        `)
        .order('created_at', { ascending: false })

      if (filters?.status) {
        query = query.eq('status', filters.status)
      }

      if (filters?.search) {
        query = query.or(`judul_surat.ilike.%${filters.search}%,no_surat.ilike.%${filters.search}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    }
  })
}

export function useSuratDetail(id: string) {
  return useQuery({
    queryKey: ['surat', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surat_registrasi')
        .select(`
          *,
          master_entities (name),
          master_offices (name),
          master_departments (name),
          master_projects (name),
          master_letter_types (name),
          profiles (full_name),
          pic:profiles!surat_registrasi_pic_id_fkey (full_name)
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!id
  })
}

export function useSuratSignatures(suratId: string) {
  return useQuery({
    queryKey: ['signatures', suratId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surat_signatures')
        .select(`
          *,
          profiles (full_name, job_title)
        `)
        .eq('surat_id', suratId)
        .order('step_order', { ascending: true })

      if (error) throw error
      return data
    },
    enabled: !!suratId
  })
}
```

---

## 🎯 REALTIME SUBSCRIPTION (READ)

```javascript
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export function useSuratRealtime(onChange: () => void) {
  useEffect(() => {
    const subscription = supabase
      .channel('surat_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'surat_registrasi'
        },
        (payload) => {
          console.log('Surat changed:', payload)
          onChange()
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [onChange])
}
```

---

## 📚 REFERENSI

- [PostgREST Documentation](https://postgrest.org/)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript)
- [API URL](https://app.supabase.com/project/xuhyodtmgwteyslhrkfx/api)

---

*Generated for Supabase Project: agenda (xuhyodtmgwteyslhrkfx)*
