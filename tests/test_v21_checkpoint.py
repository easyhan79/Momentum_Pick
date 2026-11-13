import contextlib,io,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from scripts import v21_checkpoint as checkpoint

class CheckpointTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory();self.addCleanup(self.directory.cleanup);self.root=Path(self.directory.name)
        archive=self.root/'docs'/'archive';archive.mkdir(parents=True);self.state=archive/'SPACEPICK_V2_1_RUN_STATE.json';self.progress=archive/'SPACEPICK_V2_1_PROGRESS.md'
        self.state.write_text(json.dumps({'schemaVersion':1,'stageOrder':['S0','S1','S2'],'stages':{},'lastCompletedStage':None}));self.progress.write_text('# synthetic progress\n')
        self.addCleanup(patch.stopall);patch.object(checkpoint,'ROOT',self.root).start();patch.object(checkpoint.subprocess,'check_output',side_effect=lambda command,**kw:'a'*40 if 'rev-parse' in command else ' M synthetic.ts\n' if 'status' in command else 'feature/synthetic').start()
    def run_checkpoint(self,*args,**kwargs):
        with contextlib.redirect_stdout(io.StringIO()):checkpoint.checkpoint(*args,**kwargs)
        return json.loads(self.state.read_text())
    def test_stage_and_push_checkpoints_are_valid_atomic_and_resume_without_reset(self):
        state=self.run_checkpoint('S0','local_complete','mapped','start S1',check='synthetic check passed',complete=True,pushed=True)
        self.assertEqual(state['lastCompletedStage'],'S0');self.assertEqual(state['lastPushedCommit'],'a'*40)
        state=self.run_checkpoint('S1','in_progress','partial API','continue exact unit')
        self.assertEqual(state['lastCompletedStage'],'S0');self.assertEqual(state['currentStage'],'S1');self.assertEqual(state['nextAction'],'continue exact unit');self.assertEqual(state['workingTreeChanges'],['synthetic.ts']);self.assertEqual(state['lastSuccessfulCheck']['command'],'synthetic check passed')
        self.assertFalse(list(self.root.glob('*.tmp')));self.assertIn('partial API',self.progress.read_text())
    def test_unknown_limit_is_not_inferred_and_explicit_pause_retains_checkpoint(self):
        self.run_checkpoint('S0','local_complete','done','start S1',complete=True)
        self.run_checkpoint('S1','paused_limit','explicit notification','resume partial unit')
        state=self.run_checkpoint('S1','in_progress','resumed verified diff','continue')
        self.assertEqual(state['lastCompletedStage'],'S0');self.assertEqual(state['status'],'in_progress');self.assertIn('explicit notification',self.progress.read_text())
    def test_invalid_stage_or_status_cannot_overwrite_existing_state(self):
        before=self.state.read_text()
        for stage,status in [('bad','in_progress'),('S0','pretend_complete')]:
            with self.assertRaises(ValueError):self.run_checkpoint(stage,status,'bad','bad')
            self.assertEqual(self.state.read_text(),before)
    def test_failed_atomic_replace_preserves_last_readable_checkpoint(self):
        before=self.state.read_text()
        with patch.object(checkpoint.os,'replace',side_effect=OSError('synthetic failure')):
            with self.assertRaises(OSError):self.run_checkpoint('S0','in_progress','partial','resume')
        self.assertEqual(self.state.read_text(),before);json.loads(self.state.read_text())
