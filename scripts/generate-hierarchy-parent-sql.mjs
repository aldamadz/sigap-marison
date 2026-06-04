import fs from "node:fs";
import XLSX from "xlsx";

const inputFile = process.argv[2] || "employeeList (2).xlsx";
const outputFile = process.argv[3] || "hierarchy-parent-update.sql";
const previewFile = process.argv[4] || "hierarchy-mapping-preview.csv";

const normalize = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const includes = (value, keyword) => normalize(value).includes(normalize(keyword));
const sql = (value) => `'${String(value ?? "").replace(/'/g, "''")}'`;

const workbook = XLSX.readFile(inputFile);
const rows = XLSX.utils
  .sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" })
  .filter((row) => row.NIK && row["Nama Lengkap"])
  .map((row) => ({
    nik: String(row.NIK).trim(),
    name: String(row["Nama Lengkap"]).trim(),
    office: String(row.Cabang || "").trim(),
    job: String(row.Jabatan || "").trim(),
    position: String(row.Posisi || "").trim(),
    department: String(row.Bagian || "").trim(),
    level: String(row.Tingkatan || "").trim(),
  }));

const findOne = (predicate, current = null) => rows.find((row) => row.nik !== current?.nik && predicate(row)) || null;
const findInOffice = (office, predicate, current = null) =>
  rows.find((row) => row.nik !== current?.nik && row.office === office && predicate(row)) || null;
const findInOfficeDepartment = (office, department, predicate, current = null) =>
  rows.find((row) => row.nik !== current?.nik && row.office === office && row.department === department && predicate(row)) || null;

const isHeadOffice = (row) => normalize(row.office) === "kantor pusat";
const isBranchOffice = (row) => !isHeadOffice(row) && !includes(row.office, "kost");
const isKostOffice = (row) => includes(row.office, "kost") || includes(row.department, "operasional kost");
const isPresidentDirector = (row) =>
  includes(row.position, "direktur utama") ||
  includes(row.department, "direktur utama");
const isDirector = (row) =>
  includes(row.position, "direktur") ||
  includes(row.department, "direktur");
const isDirectorOnly = (row) => isDirector(row) && !isPresidentDirector(row);
const isSecretaryToDirectors = (row) => includes(row.position, "sekretaris direksi");
const isBranchManager = (row) => includes(row.position, "branch manager") && !includes(row.position, "assistant");
const isAssistantBranchManager = (row) => includes(row.position, "assistant branch manager");
const isManager = (row) => includes(row.position, "manager") && !includes(row.position, "assistant") && !isBranchManager(row);
const isAssistantManager = (row) => includes(row.position, "assistant manager") && !isAssistantBranchManager(row);
const isSupervisor = (row) => includes(row.position, "supervisor");
const isCoordinator = (row) => includes(row.position, "koordinator");
const isPelaksana = (row) => includes(row.job, "pelaksana");

const presidentDirector = () => findOne(isPresidentDirector);
const director = () => findOne(isDirectorOnly) || presidentDirector();

const branchTop = (row) => findInOffice(row.office, isAssistantBranchManager, row) || findInOffice(row.office, isBranchManager, row);
const branchManager = (row) => findInOffice(row.office, isBranchManager, row);
const departmentManager = (row) =>
  findInOfficeDepartment(row.office, row.department, isManager, row) ||
  findInOfficeDepartment("KANTOR PUSAT", row.department, isManager, row);
const departmentAssistant = (row) =>
  findInOfficeDepartment(row.office, row.department, isAssistantManager, row) ||
  findInOfficeDepartment("KANTOR PUSAT", row.department, isAssistantManager, row);
const departmentSupervisor = (row) =>
  findInOfficeDepartment(row.office, row.department, isSupervisor, row) ||
  findInOfficeDepartment("KANTOR PUSAT", row.department, isSupervisor, row);

const branchMarketingParent = (row) => {
  if (includes(row.position, "koordinator sales")) {
    return findInOffice(row.office, (candidate) => includes(candidate.position, "supervisor marketing"), row) || branchTop(row);
  }

  if (includes(row.position, "sales")) {
    return (
      findInOffice(row.office, (candidate) => includes(candidate.position, "koordinator sales"), row) ||
      findInOffice(row.office, (candidate) => includes(candidate.position, "supervisor marketing"), row) ||
      branchTop(row)
    );
  }
  return findInOffice(row.office, (candidate) => includes(candidate.position, "supervisor marketing"), row) || branchTop(row);
};

const branchTechnicalParent = (row) => {
  if (includes(row.position, "koordinator pengawas lapangan")) {
    return findInOffice(row.office, (candidate) => includes(candidate.position, "supervisor teknik"), row) || branchTop(row);
  }

  if (includes(row.position, "pengawas lapangan")) {
    return (
      findInOffice(row.office, (candidate) => includes(candidate.position, "koordinator pengawas lapangan"), row) ||
      findInOffice(row.office, (candidate) => includes(candidate.position, "supervisor teknik"), row) ||
      branchTop(row)
    );
  }
  return findInOffice(row.office, (candidate) => includes(candidate.position, "supervisor teknik"), row) || branchTop(row);
};

const staffPeerInOfficeDepartment = (row) =>
  findInOfficeDepartment(row.office, row.department, (candidate) => !isPelaksana(candidate), row);

const getParent = (row) => {
  if (isPresidentDirector(row)) return null;
  if (isDirectorOnly(row)) return presidentDirector();
  if (isSecretaryToDirectors(row)) return director();
  if (isBranchManager(row)) return director();
  if (isHeadOffice(row) && isManager(row)) return director();
  if (isAssistantBranchManager(row)) return branchManager(row);
  if (isAssistantManager(row)) return departmentManager(row);
  if (isKostOffice(row)) {
    if (isSupervisor(row)) return director();
    return findOne((candidate) => includes(candidate.position, "supervisor operasional kost"), row);
  }
  if (isBranchOffice(row)) {
    if (isPelaksana(row)) return staffPeerInOfficeDepartment(row) || branchTop(row);
    if (includes(row.department, "marketing cabang")) return branchMarketingParent(row);
    if (includes(row.department, "teknik")) return branchTechnicalParent(row);
    return branchTop(row);
  }
  if (isPelaksana(row)) return staffPeerInOfficeDepartment(row) || departmentSupervisor(row) || departmentAssistant(row) || departmentManager(row);
  if (isSupervisor(row)) return departmentAssistant(row) || departmentManager(row);
  if (isCoordinator(row)) return departmentSupervisor(row) || departmentAssistant(row) || departmentManager(row);
  return departmentSupervisor(row) || departmentAssistant(row) || departmentManager(row);
};

const mappings = rows.map((row) => ({ ...row, parent: getParent(row) }));
const values = mappings.map((row) => `(${sql(row.nik)}, ${row.parent ? sql(row.parent.nik) : "null"})`).join(",\n    ");

const updateSql = `with hierarchy_map(nik, parent_nik) as (
  values
    ${values}
),
resolved as (
  select
    child.id as child_id,
    parent.id as parent_id
  from hierarchy_map hm
  join public.profiles child on child.nik = hm.nik
  left join public.profiles parent on parent.nik = hm.parent_nik
  where child.deleted_at is null
)
update public.profiles p
set
  parent_id = resolved.parent_id,
  updated_at = now()
from resolved
where p.id = resolved.child_id;

select
  count(*) as updated_profiles
from public.profiles p
join hierarchy_map hm on hm.nik = p.nik
where p.deleted_at is null;
`;

const previewLines = [
  "NIK,Nama,Kantor,Bagian,Posisi,Parent NIK,Parent Nama,Parent Group",
  ...mappings.map((row) =>
    [
      row.nik,
      row.name,
      row.office,
      row.department,
      row.position,
      row.parent?.nik || "",
      row.parent?.name || "",
      "",
    ]
      .map((value) => {
        const text = String(value ?? "");
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      })
      .join(",")
  ),
];

fs.writeFileSync(outputFile, updateSql, "utf8");
fs.writeFileSync(previewFile, previewLines.join("\n"), "utf8");

console.log(`SQL written: ${outputFile}`);
console.log(`Preview written: ${previewFile}`);
console.log(`Rows: ${mappings.length}`);
console.log(`Direct parent rows: ${mappings.filter((row) => row.parent).length}`);
console.log(`Virtual/null parent rows: ${mappings.filter((row) => !row.parent).length}`);
