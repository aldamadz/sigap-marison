type NoticeLine = { text: string; number?: number };
type NoticeBlock = { kind: 'paragraph' | 'bullet' | 'number'; lines: NoticeLine[] };

export function ReleaseNoticeContent({ items }: { items: string[] }) {
  const blocks: NoticeBlock[] = [];
  for (const item of items) {
    const text = item.trim();
    if (!text) continue;
    const bullet = /^[-*\u2022]\s+(.+)$/.exec(text);
    const numbered = /^([1-9]\d{0,2})[.)]\s+(.+)$/.exec(text);
    const kind = bullet ? 'bullet' : numbered ? 'number' : 'paragraph';
    const line: NoticeLine = { text: bullet?.[1] ?? numbered?.[2] ?? text };
    if (numbered) line.number = Number(numbered[1]);
    const previous = blocks.at(-1);
    if (kind !== 'paragraph' && previous?.kind === kind) previous.lines.push(line);
    else blocks.push({ kind, lines: [line] });
  }
  return <div className="space-y-3 break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
    {blocks.map((block, index) => block.kind === 'paragraph'
      ? <p key={index} className="whitespace-pre-wrap">{block.lines[0].text}</p>
      : block.kind === 'bullet'
        ? <ul key={index} className="list-outside list-disc space-y-2 pl-5">{block.lines.map((line, row) => <li key={row}>{line.text}</li>)}</ul>
        : <ol key={index} start={block.lines[0].number} className="list-outside list-decimal space-y-2 pl-7">{block.lines.map((line, row) => <li key={row} value={line.number}>{line.text}</li>)}</ol>)}
  </div>;
}
