// =====================================================
// NEXT.JS APP ROUTER API
// /api/surat-reservations/route.ts
// Read-Only API for surat_reservations table
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

// GET /api/surat-reservations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const id = searchParams.get('id')
    const status = searchParams.get('status')
    const reservedBy = searchParams.get('reserved_by')
    const entityId = searchParams.get('entity_id')
    const typeId = searchParams.get('type_id')
    const year = searchParams.get('year')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const offset = (page - 1) * limit
    const orderBy = searchParams.get('order_by') || 'created_at'
    const orderDirection = searchParams.get('order') || 'desc'

    let query = supabase
      .from('surat_reservations')
      .select('*', { count: 'exact' })

    if (id) {
      query = query.eq('id', id).single()
    } else {
      if (status) query = query.eq('status', status)
      if (reservedBy) query = query.eq('reserved_by', reservedBy)
      if (entityId) query = query.eq('entity_id', entityId)
      if (typeId) query = query.eq('type_id', typeId)
      if (year) query = query.eq('year', year)

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
          { success: false, error: 'Reservation not found' },
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

