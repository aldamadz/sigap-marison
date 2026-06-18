// frontend/src/services/visibility.service.ts
import { getCurrentUser } from './user-ui.service';
import { getUsers } from './user.service'; 
import { getOfficeWithDescendants } from './office.service';
import type { User } from '@/types/agenda';

/**
 * Logika Visibilitas:
 * - Admin -> Semua (Bisa filter kantor)
 * - User -> Self + Peers (Satu Atasan) + Subordinates (Rekursif ke bawah)
 */
export async function getVisibleUsers(officeId?: string | null): Promise<User[]> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return [];

    // Ambil semua user sekali saja untuk diproses secara lokal (Client-side filtering)
    const allUsers = await getUsers();

    let scopedUsers: User[] = [];

    // 1. Jika Admin, cakupannya adalah seluruh user
    if (currentUser.role === 'admin') {
      scopedUsers = allUsers;
    } else {
      // 2. Jika bukan Admin, hitung hirarki (Peers & Subordinates)
      const visibleIds = new Set<string>();
      
      // Selalu bisa melihat diri sendiri
      visibleIds.add(String(currentUser.id)); 

      // --- LOGIKA PEER (Teman Sejawat) ---
      // Jika punya parentId, cari user lain yang memiliki parentId yang sama
      if (currentUser.parentId) {
        const myParentId = String(currentUser.parentId);
        allUsers.forEach(u => {
          if (u.parentId && String(u.parentId) === myParentId) {
            visibleIds.add(String(u.id));
          }
        });
      }

      // --- LOGIKA DOWNSTREAM (Bawahan, Cucu, dst) ---
      const collectDownstream = (parentId: string) => {
        allUsers.forEach(u => {
          // Pastikan perbandingan string untuk keamanan ID
          if (u.parentId && String(u.parentId) === parentId) {
            // Jika ID belum ada di Set (mencegah infinite loop jika ada circular reference)
            if (!visibleIds.has(String(u.id))) {
              visibleIds.add(String(u.id));
              collectDownstream(String(u.id)); // Rekursi
            }
          }
        });
      };

      collectDownstream(String(currentUser.id));

      // Map ID ke objek User lengkap
      scopedUsers = allUsers.filter(u => visibleIds.has(String(u.id)));
    }

    // 3. Filter Kantor jika parameter diberikan (Termasuk Kantor Cabang di bawahnya)
    if (officeId && officeId !== 'ALL_OFFICES') {
      scopedUsers = await filterByOffice(scopedUsers, officeId);
    }

    return scopedUsers;
  } catch (error) {
    console.error("Error in getVisibleUsers:", error);
    return [];
  }
}

/**
 * Helper untuk menyaring user berdasarkan kantor dan sub-kantornya (Rekursif Office)
 */
async function filterByOffice(source: User[], officeId: string): Promise<User[]> {
  // Parsing ID karena Supabase/Postgres biasanya menggunakan integer untuk ID Office
  const numericId = parseInt(officeId, 10);
  if (isNaN(numericId)) return source;

  try {
    // Ambil struktur kantor (Kantor yang dipilih + semua turunannya)
    const relatedOffices = await getOfficeWithDescendants(String(numericId));
    
    // Kumpulkan semua ID kantor yang valid dalam Set agar pencarian O(1)
    const validOfficeIds = new Set<string>([
      String(numericId),
      ...(relatedOffices || []).map(o => String(o.id))
    ]);

    // Filter user: check apakah officeId user ada di dalam daftar kantor yang valid
    // Note: Pastikan di tipe User Anda menggunakan camelCase 'officeId' sesuai mapping profil
    return source.filter(u => {
      const uOfficeId = u.officeId || (u as any).office_id; // Fallback handle jika mapping belum konsisten
      return uOfficeId && validOfficeIds.has(String(uOfficeId));
    });
  } catch (error) {
    console.error("Error filtering by office:", error);
    return source; // Jika gagal, kembalikan tanpa filter kantor daripada data kosong
  }
}
