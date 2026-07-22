# Diagram Workflow SIGAP

Folder ini menyimpan diagram workflow dalam dua bentuk:

- `.mmd` adalah sumber Mermaid yang dapat diperbarui;
- `.png` adalah hasil render transparan untuk presentasi dan dokumentasi.

| Workflow | PNG | Sumber Mermaid |
| --- | --- | --- |
| Permohonan Aset | [workflow-permohonan-aset.png](./workflow-permohonan-aset.png) | [workflow-permohonan-aset.mmd](./workflow-permohonan-aset.mmd) |
| Permohonan Unit | [workflow-permohonan-unit.png](./workflow-permohonan-unit.png) | [workflow-permohonan-unit.mmd](./workflow-permohonan-unit.mmd) |

Render ulang dengan Mermaid CLI dan pertahankan latar belakang transparan:

```powershell
npx --yes @mermaid-js/mermaid-cli -i docs/diagrams/workflow-permohonan-aset.mmd -o docs/diagrams/workflow-permohonan-aset.png -b transparent -w 1800 -s 2
npx --yes @mermaid-js/mermaid-cli -i docs/diagrams/workflow-permohonan-unit.mmd -o docs/diagrams/workflow-permohonan-unit.png -b transparent -w 1800 -s 2
```
