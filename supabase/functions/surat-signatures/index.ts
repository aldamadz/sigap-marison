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

const ORDERABLE_COLUMNS = new Set(['step_order', 'created_at', 'updated_at', 'signed_at', 'status'])

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
    const suratId = searchParams.get('surat_id')
    const userId = searchParams.get('user_id')
    const roleName = searchParams.get('role_name')
    const status = searchParams.get('status')
    const isSigned = searchParams.get('is_signed')
    const page = Math.max(parseInt(searchParams.get('page') ?? '1', 10) || 1, 1)
    const limitRaw = Math.max(parseInt(searchParams.get('limit') ?? '10', 10) || 10, 1)
    const limit = Math.min(limitRaw, 200)
    const offset = (page - 1) * limit
    const orderBy = searchParams.get('order_by') ?? 'step_order'
    const orderDirection = (searchParams.get('order') ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'
    const orderColumn = ORDERABLE_COLUMNS.has(orderBy) ? orderBy : 'step_order'

    let query = supabase
      .from('surat_signatures')
      .select('*', { count: 'exact' })

    if (id) {
      query = query.eq('id', id).single()
    } else {
      if (suratId) query = query.eq('surat_id', suratId)
      if (userId) query = query.eq('user_id', userId)
      if (roleName) query = query.ilike('role_name', `%${roleName}%`)
      if (status) query = query.eq('status', status)
      if (isSigned === 'true' || isSigned === 'false') query = query.eq('is_signed', isSigned === 'true')

      query = query.order(orderColumn, { ascending: orderDirection === 'asc' }).range(offset, offset + limit - 1)
    }

    const { data, error, count } = await query
    if (error) return jsonResponse({ success: false, error: error.message }, { status: 500 })

    if (id) {
      if (!data) return jsonResponse({ success: false, error: 'Signature not found' }, { status: 404 })
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
