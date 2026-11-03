import copy
import unittest
from plan_analysis import apply_annotations

class PlanAnnotationsTest(unittest.TestCase):
    def setUp(self):
        self.content={'title':'existing', 'concepts':[{'id':'c1','zones':[{'id':'z1','label':'old','title':'old'}]}]}
        self.asset={'id':'asset','caption':'provided'}
        self.result={'concepts':[{'id':'c1','zones':[{'id':'z1','label':'입구','title':'진입부','body':'제공 도면의 출입구','evidence':'owner_provided','x':25,'y':70}]}]}
    def test_valid_coordinates_preserve_source(self):
        original=copy.deepcopy(self.content)
        out=apply_annotations(self.content,self.asset,self.result)
        self.assertEqual(out['concepts'][0]['zones'][0]['position'],{'x':25,'y':70})
        self.assertEqual(self.content,original)
        self.assertEqual(out['title'],'existing')
    def test_unknown_location_stays_unplaced(self):
        self.result['concepts'][0]['zones'][0].update(x=None,y=None)
        self.assertNotIn('position',apply_annotations(self.content,self.asset,self.result)['concepts'][0]['zones'][0])
    def test_invalid_coordinates_and_ids_rejected(self):
        for value in [-1,101,float('nan'),True,'50']:
            result=copy.deepcopy(self.result);result['concepts'][0]['zones'][0]['x']=value
            with self.assertRaises(ValueError):apply_annotations(self.content,self.asset,result)
        self.result['concepts'][0]['zones'][0]['id']='other'
        with self.assertRaises(ValueError):apply_annotations(self.content,self.asset,self.result)

if __name__=='__main__':unittest.main()
