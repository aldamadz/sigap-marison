// =====================================================
// NEXT.JS APP ROUTER API
// /api/surat-registrations/route.ts
// Read-Only API for surat_registrasi table
// =====================================================

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Initialize Supabase Client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use SERVICE_ROLE_KEY for server-side
)

function methodNotAllowed() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed. This endpoint is read-only (GET only).' },
    { status: 405 }
  )
}

// GET /api/surat-registrations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Query parameters
    const id = searchParams.get('id')
    const status = searchParams.get('status')
    const entityId = searchParams.get('entity_id')
    const deptId = searchParams.get('dept_id')
    const officeId = searchParams.get('office_id')
    const picId = searchParams.get('pic_id')
    const createdBy = searchParams.get('created_by')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const offset = (page - 1) * limit
    const orderBy = searchParams.get('order_by') || 'created_at'
    const orderDirection = searchParams.get('order') || 'desc'
    
    // Build query
    let query = supabase
      .from('surat_registrasi')
      .select(`
        *,
        entity:master_entities(id, name, code),
        office:master_offices(id, name, code),
        department:master_departments(id, name, code),
        project:master_projects(id, name, code),
        letter_type:master_letter_types(id, name, code),
        creator:profiles!surat_registrasi_created_by_fkey(id, full_name, nik),
        pic:profiles!surat_registrasi_pic_id_fkey(id, full_name, nik)
      `, { count: 'exact' })
    
    // Apply filters
    if (id) {
      query = query.eq('id', id).single()
    } else {
      if (status) query = query.eq('status', status)
      if (entityId) query = query.eq('entity_id', entityId)
      if (deptId) query = query.eq('dept_id', deptId)
      if (officeId) query = query.eq('office_id', officeId)
      if (picId) query = query.eq('pic_id', picId)
      if (createdBy) query = query.eq('created_by', createdBy)
      
      // Search by no_surat or judul_surat
      if (search) {
        query = query.or(`no_surat.ilike.%${search}%,judul_surat.ilike.%${search}%`)
      }
      
      // Pagination and ordering
      query = query
        .order(orderBy, { ascending: orderDirection === 'asc' })
        .range(offset, offset + limit - 1)
    }
    
    const { data, error, count } = await query
    
    if (error) {
      console.error('Supabase Error:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }
    
    // If single record requested
    if (id) {
      if (!data) {
        return NextResponse.json(
          { success: false, error: 'Surat not found' },
          { status: 404 }
        )
      }
      return NextResponse.json({ success: true, data })
    }
    
    // Multiple records
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
    console.error('API Error:', error)
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
