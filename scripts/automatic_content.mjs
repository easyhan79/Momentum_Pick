// Internal worker adapter. Captured stdout is data, never a workflow log.
import {automaticContent} from '../supabase/functions/_shared/automatic-publication.ts';
let source='';
for await (const chunk of process.stdin) {
 source+=chunk;
 if(source.length>500000)throw Error('automatic_input_limit');
}
try {
 const {draft,assets,runId,actor}=JSON.parse(source);
 process.stdout.write(JSON.stringify(automaticContent(draft,assets,runId,actor)));
} catch {
 // Never include input content or provider/credential text in diagnostics.
 process.stderr.write('automatic_content_invalid\n');
 process.exitCode=1;
}
