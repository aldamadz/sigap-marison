// =====================================================
// NEXT.JS APP ROUTER API
// /api/surat-signatures/route.ts
// Read-Only API for surat_signatures table
// =====================================================

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function methodNotAllowed() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed. This endpoint is read-only (GET only).' },
    { status: 405 }
  )
}

// GET /api/surat-signatures
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const id = searchParams.get('id')
    const suratId = searchParams.get('surat_id')
    const userId = searchParams.get('user_id')
    const roleName = searchParams.get('role_name')
    const status = searchParams.get('status')
    const isSigned = searchParams.get('is_signed')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const offset = (page - 1) * limit
    const orderBy = searchParams.get('order_by') || 'step_order'
    const orderDirection = searchParams.get('order') || 'asc'

    let query = supabase
      .from('surat_signatures')
      .select(`
        *,
        signer:profiles!surat_signatures_user_id_fkey(id, full_name, nik)
      `, { count: 'exact' })

    if (id) {
      query = query.eq('id', id).single()
    } else {
      if (suratId) query = query.eq('surat_id', suratId)
      if (userId) query = query.eq('user_id', userId)
      if (roleName) query = query.ilike('role_name', `%${roleName}%`)
      if (status) query = query.eq('status', status)
      if (isSigned === 'true' || isSigned === 'false') query = query.eq('is_signed', isSigned === 'true')

      query = query
        .order(orderBy, { ascending: orderDirection === 'asc' })
        .range(offset, offset + limit - 1)
    }

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    if (id) {
      if (!data) {
        return NextResponse.json(
          { success: false, error: 'Signature not found' },
          { status: 404 }
        )
      }
      return NextResponse.json({ success: true, data })
    }

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed

