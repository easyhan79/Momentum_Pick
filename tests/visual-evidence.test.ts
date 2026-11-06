import {test} from 'node:test';import assert from 'node:assert/strict';
import {visualEvidence} from '../showroom-web/src/lib/visualEvidence.ts';
const asset=(id:string,kind:any,generated=false,approved=true,conceptId='')=>({id,kind,generated,approved,conceptId,url:'https://synthetic.invalid/'+id,caption:'합성',alt:'합성'});
const concept={id:'concept-1',conceptName:'가설',headline:'검토',rationale:'조건 확인',feasibility:'not_checked' as const,zones:[]};
test('only approved provided originals and the active concept image may appear in comparison',()=>{
 const result=visualEvidence([asset('fake-before','photo',true),asset('unapproved','photo',false,false),asset('photo','photo'),asset('plan','provided_plan'),asset('old-image','concept',true,true,'concept-2'),asset('active','concept',true,true,'concept-1')],concept);
 assert.equal(result.photo?.id,'photo');assert.equal(result.plan?.id,'plan');assert.equal(result.generated?.id,'active');
 assert.deepEqual(visualEvidence([],concept),{photo:undefined,plan:undefined,generated:undefined});
});
