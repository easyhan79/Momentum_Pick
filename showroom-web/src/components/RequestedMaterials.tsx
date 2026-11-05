export function RequestedMaterials({topics,onClear}:{topics:string[];onClear?:()=>void}){
 if(!topics.length)return null;
 return <aside className="requested-materials" aria-label="선택한 확인·자료 요청"><h3>함께 확인하고 싶은 자료 {topics.length}건</h3><ul>{topics.map(topic=><li key={topic}>{topic}</li>)}</ul><p>문의와 함께 전달할 요청 목록입니다. 자료 제공 가능 여부와 공개 범위는 담당자가 확인합니다.</p>{onClear&&<button type="button" className="button button-outline" onClick={onClear}>자료 선택 비우기</button>}</aside>;
}
