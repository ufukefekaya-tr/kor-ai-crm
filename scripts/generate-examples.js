// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0.
// This exporter ONLY constructs an in-memory fictional demo. It never opens user data.
import {writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createStore} from '../server/store.js';
import {summarize, analysisSnapshot} from '../server/summaries.js';
const store=createStore({filename:':memory:',seed:true,now:()=> '2026-10-18T12:00:00.000Z'});
const reference={asOf:'2026-10-18T12:00:00.000Z'};
try{
  await mkdir('examples',{recursive:true});
  const records=Object.fromEntries(['reps','customers','visits','appointments','routes','targets','connectors'].map(kind=>[kind,store.all(kind)]));
  const outputs={'examples/fictional-records.json':{fictional:true,referenceDate:reference.asOf,collections:records},'examples/analysis.json':analysisSnapshot(store,reference),'examples/summary.json':summarize(store,reference)};
  const files=[];
  for(const [file,value] of Object.entries(outputs)){const content=JSON.stringify(value,null,2)+'\n';await writeFile(file,content);files.push({file,sha256:createHash('sha256').update(content).digest('hex')});}
  await writeFile('examples/manifest.json',JSON.stringify({fictional:true,referenceDate:reference.asOf,files},null,2)+'\n');
  console.log('Exported fictional records, explainable analysis and dashboard summary from an isolated in-memory demo.');
}finally{store.close();}
