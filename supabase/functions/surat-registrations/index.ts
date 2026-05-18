import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse, optionsResponse } from '../_shared/cors.ts'

function getSupabaseAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const ORDERABLE_COLUMNS = new Set([
  'created_at',
  'updated_at',
  'status',
  'no_surat',
  'judul_surat',
])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  if (req.method !== 'GET') {
    return jsonResponse(
      { success: false, error: 'Method not allowed. This endpoint is read-only (GET only).' },
      { status: 405, headers: corsHeaders }
    )
  }

  try {
    const supabase = getSupabaseAdminClient()
    const { searchParams } = new URL(req.url)

    const id = searchParams.get('id')
    const status = searchParams.get('status')
    const entityId = searchParams.get('entity_id')
    const deptId = searchParams.get('dept_id')
    const officeId = searchParams.get('office_id')
    const picId = searchParams.get('pic_id')
    const createdBy = searchParams.get('created_by')
    const search = searchParams.get('search')
    const page = Math.max(parseInt(searchParams.get('page') ?? '1', 10) || 1, 1)
    const limitRaw = Math.max(parseInt(searchParams.get('limit') ?? '10', 10) || 10, 1)
    const limit = Math.min(limitRaw, 200)
    const offset = (page - 1) * limit
    const orderBy = searchParams.get('order_by') ?? 'created_at'
    const orderDirection = (searchParams.get('order') ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc'
    const orderColumn = ORDERABLE_COLUMNS.has(orderBy) ? orderBy : 'created_at'

    let query = supabase
      .from('surat_registrasi')
      .select('*', { count: 'exact' })

    if (id) {
      query = query.eq('id', id).single()
    } else {
      if (status) query = query.eq('status', status)
      if (entityId) query = query.eq('entity_id', entityId)
      if (deptId) query = query.eq('dept_id', deptId)
      if (officeId) query = query.eq('office_id', officeId)
      if (picId) query = query.eq('pic_id', picId)
      if (createdBy) query = query.eq('created_by', createdBy)
      if (search) query = query.or(`no_surat.ilike.%${search}%,judul_surat.ilike.%${search}%`)

      query = query.order(orderColumn, { ascending: orderDirection === 'asc' }).range(offset, offset + limit - 1)
    }

    const { data, error, count } = await query
    if (error) return jsonResponse({ success: false, error: error.message }, { status: 500 })

    if (id) {
      if (!data) return jsonResponse({ success: false, error: 'Surat not found' }, { status: 404 })
      return jsonResponse({ success: true, data })
    }

    return jsonResponse({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return jsonResponse({ success: false, error: message }, { status: 500 })
  }
})
