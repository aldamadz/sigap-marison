/**
 * MRN-21: Deteksi Fund Submission tanpa proyek (dana umum).
 *
 * `firstString` pada domain-runtime mengubah nilai null/undefined menjadi string kosong
 * ("") sebelum nilai ini sampai ke sini, sehingga guard harus memakai falsy check agar
 * null/undefined/"" sama-sama dianggap "tidak ada proyek". Regresi sebelumnya memakai
 * `=== null` dan gagal mengenali "" sehingga dana umum jatuh ke validasi effective
 * project/branch dan ditolak padahal proyek memang tidak diminta.
 *
 * @param {unknown} sourceProjectId - ID proyek eksternal yang diminta (dari requested_project).
 * @param {unknown} recordProjectId - ID proyek pada record surat / location snapshot.
 * @returns {boolean} true bila tidak ada proyek yang diminta maupun tercatat.
 */
export const isMarisonFundWithoutProject = (sourceProjectId, recordProjectId) => {
  return !sourceProjectId && !recordProjectId;
};