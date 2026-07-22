# Diagram Workflow SIGAP

Folder ini menyimpan diagram workflow dalam beberapa bentuk:

- `.mmd` adalah sumber Mermaid yang dapat diperbarui;
- `.svg` adalah gambar vektor untuk Microsoft Excel dan tidak pecah ketika diperbesar;
- `.png` adalah versi lengkap berukuran ringkas untuk preview dan dokumentasi;
- `spreadsheet/*.png` adalah versi resolusi tinggi yang dibagi tiga bagian untuk Google Sheets.

Di aplikasi spreadsheet, gunakan **Sisipkan/Insert > Gambar/Image**, bukan menu
impor workbook. Gunakan SVG pada Excel. Pada Google Sheets, sisipkan tiga PNG
spreadsheet secara berurutan agar teks tetap tajam tanpa memperbesar satu gambar
yang sangat panjang.

| Workflow | SVG untuk Excel | PNG lengkap | PNG untuk Google Sheets | Sumber Mermaid |
| --- | --- | --- | --- | --- |
| Permohonan Aset | [SVG](./workflow-permohonan-aset.svg) | [PNG](./workflow-permohonan-aset.png) | [Bagian 1](./spreadsheet/workflow-permohonan-aset-01.png), [Bagian 2](./spreadsheet/workflow-permohonan-aset-02.png), [Bagian 3](./spreadsheet/workflow-permohonan-aset-03.png) | [Mermaid](./workflow-permohonan-aset.mmd) |
| Permohonan Unit | [SVG](./workflow-permohonan-unit.svg) | [PNG](./workflow-permohonan-unit.png) | [Bagian 1](./spreadsheet/workflow-permohonan-unit-01.png), [Bagian 2](./spreadsheet/workflow-permohonan-unit-02.png), [Bagian 3](./spreadsheet/workflow-permohonan-unit-03.png) | [Mermaid](./workflow-permohonan-unit.mmd) |

Render ulang dengan Mermaid CLI dan pertahankan latar belakang transparan:

```powershell
npx --yes @mermaid-js/mermaid-cli -i docs/diagrams/workflow-permohonan-aset.mmd -o docs/diagrams/workflow-permohonan-aset.full.png -b transparent -w 1800 -s 2
npx --yes @mermaid-js/mermaid-cli -i docs/diagrams/workflow-permohonan-unit.mmd -o docs/diagrams/workflow-permohonan-unit.full.png -b transparent -w 1800 -s 2
npx --yes @mermaid-js/mermaid-cli -i docs/diagrams/workflow-permohonan-aset.mmd -o docs/diagrams/workflow-permohonan-aset.svg -b transparent
npx --yes @mermaid-js/mermaid-cli -i docs/diagrams/workflow-permohonan-unit.mmd -o docs/diagrams/workflow-permohonan-unit.svg -b transparent
```

Setelah render, buat PNG lengkap yang ringkas dan pecahan PNG resolusi tinggi:

```powershell
node docs/diagrams/split-workflow-pngs.mjs
```
