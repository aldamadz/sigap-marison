# Diagram Workflow SIGAP

Folder ini menyimpan diagram workflow dalam dua bentuk:

- `.mmd` adalah sumber Mermaid yang dapat diperbarui;
- `.png` adalah hasil render transparan untuk presentasi dan dokumentasi.

PNG akhir dibatasi maksimal `4096 px` pada sisi terpanjang agar kompatibel dengan
Excel dan Google Sheets tanpa menghilangkan kanal transparansi. Di aplikasi
spreadsheet, gunakan **Sisipkan/Insert > Gambar/Image**, bukan menu impor workbook.

| Workflow | PNG | Sumber Mermaid |
| --- | --- | --- |
| Permohonan Aset | [workflow-permohonan-aset.png](./workflow-permohonan-aset.png) | [workflow-permohonan-aset.mmd](./workflow-permohonan-aset.mmd) |
| Permohonan Unit | [workflow-permohonan-unit.png](./workflow-permohonan-unit.png) | [workflow-permohonan-unit.mmd](./workflow-permohonan-unit.mmd) |

Render ulang dengan Mermaid CLI dan pertahankan latar belakang transparan:

```powershell
npx --yes @mermaid-js/mermaid-cli -i docs/diagrams/workflow-permohonan-aset.mmd -o docs/diagrams/workflow-permohonan-aset.png -b transparent -w 1800 -s 2
npx --yes @mermaid-js/mermaid-cli -i docs/diagrams/workflow-permohonan-unit.mmd -o docs/diagrams/workflow-permohonan-unit.png -b transparent -w 1800 -s 2
```

Setelah render, optimalkan dimensi dengan `sharp` agar aplikasi spreadsheet tidak
gagal memproses kanvas yang terlalu tinggi:

```powershell
node -e "const sharp=require('sharp'); const files=['docs/diagrams/workflow-permohonan-aset.png','docs/diagrams/workflow-permohonan-unit.png']; Promise.all(files.map(async f=>{const out=f+'.optimized.png'; await sharp(f).resize({height:4096,withoutEnlargement:true}).png({compressionLevel:9,adaptiveFiltering:true}).toFile(out); require('fs').renameSync(out,f)}))"
```
