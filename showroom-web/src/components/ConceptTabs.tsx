import { useRef } from 'react';
import { Coffee, Palette, PartyPopper } from 'lucide-react';
import type { Concept } from '../types/showroom';

export function ConceptTabs({ concepts, activeId, onSelect }: { concepts: Concept[]; activeId: string; onSelect: (id: string) => void }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const icons = [Coffee, PartyPopper, Palette];
  return <div className="concept-tabs" role="tablist" aria-label="활용 컨셉 선택">{concepts.map((concept, index) => {
    const Icon = icons[index % icons.length];
    const selected = concept.id === activeId;
    return <button key={concept.id} ref={el => { buttons.current[index] = el; }} role="tab" id={`tab-${concept.id}`} aria-selected={selected} aria-controls="concept-panel" tabIndex={selected ? 0 : -1} className={`concept-tab ${selected ? 'selected' : ''}`} onClick={() => onSelect(concept.id)} onKeyDown={e => {
      let next = index;
      if (e.key === 'ArrowRight') next = (index + 1) % concepts.length;
      else if (e.key === 'ArrowLeft') next = (index - 1 + concepts.length) % concepts.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = concepts.length - 1;
      else return;
      e.preventDefault(); onSelect(concepts[next].id); buttons.current[next]?.focus();
    }}><span className="tab-icon"><Icon size={23} strokeWidth={1.5} /></span><span><span className="small-label">CONCEPT 0{index + 1}</span><strong>{concept.conceptName}</strong></span><span className="tab-mark">↗</span></button>;
  })}</div>;
}
