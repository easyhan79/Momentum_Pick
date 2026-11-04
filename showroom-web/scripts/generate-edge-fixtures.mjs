import { readFile, writeFile } from 'node:fs/promises';

const fixtures = new URL('../src/fixtures/', import.meta.url);
const base = JSON.parse(await readFile(new URL('sparse-commercial.fixture.json', fixtures), 'utf8'));
Object.assign(base, { id: 'edges-demo', title: '존 경계값 검토 예시', subtitle: '있는 정보만,\n정확한 범위로 보여줍니다.' });
base.concepts = [0, 1, 6].map(n => ({
  id: `edge-${n}`, conceptName: `존 ${n}개 검토`, headline: `제공된 구역 ${n}개`,
  rationale: '합성 데이터로 표시 개수와 상태 전환을 확인합니다.', feasibility: 'not_checked',
  zones: Array.from({ length: n }, (_, i) => ({ id: `z-${i}`, label: `구역 ${i + 1}`, title: `구역 ${i + 1} 상세`, indoorOutdoor: 'site' })),
}));
await writeFile(new URL('zones-edge.fixture.json', fixtures), JSON.stringify(base, null, 2) + '\n');
const unsafe = structuredClone(base);
Object.assign(unsafe, { id: 'untrusted-demo', title: '<img src=x onerror=alert(1)>', summary: '<script>window.__injected=true</script>' + '긴 텍스트 '.repeat(60) });
unsafe.concepts[1].zones[0].title = '<svg onload=alert(1)>텍스트</svg>';
unsafe.assets = [{ id: 'unsafe', url: 'javascript:alert(1)', alt: '위험 URL 검증', caption: '링크 안전성 검토 예시', kind: 'example', approved: true }];
await writeFile(new URL('untrusted-text.fixture.json', fixtures), JSON.stringify(unsafe, null, 2) + '\n');
console.log('Edge fixtures generated.');
