const numeric = '-?\\d+(?:[.,]\\d+)?';
const unit = '(?:[%µμa-zA-Z][%µμa-zA-Z0-9./^²³-]{0,19})';
const row = new RegExp('^(.{2,100}?)\\s*:\\s*('+numeric+')\\s*('+unit+')(?:\\s+(.+))?$','i');
const separated = new RegExp('^(.{2,100}?)\\s{2,}('+numeric+')\\s*('+unit+')\\s{2,}(.+)$','i');

export function parseNumber(raw) {
  const value=String(raw).trim();
  if (!new RegExp('^'+numeric+'$').test(value)) return null;
  // A dot followed by three digits may be a thousands separator.
  if (/^-?[1-9]\d{0,2}\.\d{3}$/.test(value)) return null;
  const number=Number(value.replace(',','.'));
  return Number.isFinite(number) ? number : null;
}

export function classify(result, reference) {
  const value=parseNumber(result);
  const raw=String(reference).trim();
  if(value===null || !raw) return 'review';
  const interval=raw.match(new RegExp('^('+numeric+')\\s*(?:a|até|[-–])\\s*('+numeric+')$','i'));
  if(interval){
    const low=parseNumber(interval[1]), high=parseNumber(interval[2]);
    if(low===null || high===null || low>high) return 'review';
    return value<low?'below':value>high?'above':'within';
  }
  const threshold=raw.match(new RegExp('^(<=|>=|[<>≤≥])\\s*('+numeric+')$'));
  if(!threshold) return 'review';
  const limit=parseNumber(threshold[2]);
  if(limit===null) return 'review';
  switch(threshold[1]){
    case '<': return value>=limit?'above':'within';
    case '<=': case '≤': return value>limit?'above':'within';
    case '>': return value<=limit?'below':'within';
    default: return value<limit?'below':'within';
  }
}

const plain=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const knownTests=/^(?:calcio(?: total| ionico)?|creatinina(?: serica)?|glicose(?: em jejum)?|glicemia(?: de jejum)?|ureia|sodio|potassio|magnesio|fosforo|hemoglobina glicada(?: \(hba1c\))?|colesterol(?: total| hdl| ldl| vldl)?|triglicerideos|tsh|t4 livre|vitamina d|25-oh vitamina d|vitamina b12|ferritina|ferro serico)$/;
const acceptedUnit=/^(?:%|fl|pg|s|seg|segundos|ratio|index|(?:[munpµμ]?g|[munpµμk]?u|[munpµμk]?ui|[munpµμk]?iu|[munpµμ]?mol|meq|mm|ml|mil|milhoes|celulas|cels?|10\^\d+)\/(?:dl|ml|l|litro|[uµμ]l|mm[³3]|m[²2]|h|min|g|mg))$/i;
const referenceLabel=/^(?:valor(?:es)? de referencia|intervalo(?:s)? de referencia|referencia|ref\.?|vr)\s*(?::|$)/;
const ageLabel=/^(?:\d+\s*(?:a|ate|[-–])\s*\d+\s*(?:dia|mes|ano)|\d+\s*(?:dia|mes|ano)|adultos?\b|criancas?\b|adolescentes?\b|recem.nascidos?\b|mulheres?\b|homens?\b|feminino\b|masculino\b|gestantes?\b|acima de\b|menores? de\b|maiores? de\b)/;
const metadata=/^(?:nome|paciente|pag(?:ina)?|data|coleta|realizacao|emissao|liberacao|nascimento|idade|sexo|identidade|documento|cpf|crm|registro|pedido|protocolo|material|metodo|unidade|laboratorio|convenio|solicitante|medico|responsavel|assinatura|resultados?)\b/;
const resultRow=new RegExp('^resultado\\s*[:.]*\\s*('+numeric+')\\s*('+unit+')(?:\\s+(.+))?$','i');

function ignoredName(name){
  const key=plain(name);
  return !key||!/[a-z]/.test(key)||metadata.test(key)||ageLabel.test(key)||referenceLabel.test(key)||(/^\d/.test(key)&&!/^\d+(?:-oh|\s+hidroxi)\b/.test(key));
}

export function visibleExamFindings(findings,modality){
  return modality==='ultrassom'?findings:findings.filter(item=>!ignoredName(item.name));
}

function cleanReference(value,units){
  const cleaned=String(value??'').trim().replace(/^(?:valor(?:es)? de refer[eê]ncia|intervalo(?:s)? de refer[eê]ncia|refer[eê]ncia|ref\.?|vr)\s*:?\s*/i,'');
  return cleaned.toLowerCase().endsWith(' '+units.toLowerCase())?cleaned.slice(0,-units.length).trim():cleaned;
}

export function extractFindings(text){
  const results=[],seen=new Set();
  const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  let heading=null;
  for(const [index,line] of lines.entries()){
    const key=plain(line);
    const explicit=line.match(/^(?:exame|analito)\s*:\s*(.{2,90})$/i)?.[1];
    const candidate=explicit||line.replace(/[:.]+$/,'').trim();
    const candidateKey=plain(candidate);
    if((explicit||knownTests.test(candidateKey)||bloodCountNames.test(candidateKey))&&!ignoredName(candidate)){
      heading={name:candidate,index};continue;
    }
    const standalone=line.match(resultRow);
    const parts=line.match(row)??line.match(separated);
    if(!standalone&&!parts){
      if(!/^(?:material|metodo)\b/.test(key))heading=null;
      continue;
    }
    const [,name,value,units,remainder]=standalone?
      [null,heading&&index-heading.index<=8?heading.name:'',...standalone.slice(1)]:parts;
    heading=null;
    if(ignoredName(name)||!acceptedUnit.test(plain(units)))continue;
    let reference=cleanReference(remainder,units);
    const following=[];
    for(const next of lines.slice(index+1,index+9)){
      const normalized=plain(next);
      if(!referenceLabel.test(normalized)&&!ageLabel.test(normalized))break;
      following.push(next);
    }
    if(following.some(next=>ageLabel.test(plain(next))))reference='';
    else if(!reference&&following.length===1)reference=cleanReference(following[0],units);
    if(classify(value,reference)==='review')reference='';
    const signature=[plain(name),value,plain(units),reference].join('|');
    if(seen.has(signature))continue;
    seen.add(signature);
    results.push({name:name.trim(),result:value,unit:units,reference});
    if(results.length===100)break;
  }
  return results;
}

const bloodCountNames = /^(?:hemacias|eritrocitos|hemoglobina|hematocrito|vcm|hcm|chcm|rdw(?:-cv|-sd)?|leucocitos(?: totais)?|neutrofilos|segmentados|bastonetes|linfocitos|monocitos|eosinofilos|basofilos|plaquetas|vpm)$/;

export function suggestGroup(name, source) {
  const normalized = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return /\bhemograma\b/i.test(source) && bloodCountNames.test(normalized) ? 'Hemograma' : '';
}

export function findExamDate(source) {
  const matches = [...source.matchAll(/\b(?:data\s+(?:da|de)\s+)?(?:coleta|realiza[çc][ãa]o)\s*[:–-]?\s*(\d{2})\/(\d{2})\/(\d{4})\b/gi)];
  const dates = new Set(matches.flatMap(([,d,m,y])=>{
    const iso=y+'-'+m+'-'+d;
    const date=new Date(iso+'T00:00:00Z');
    return Number.isFinite(date.valueOf())&&date.toISOString().startsWith(iso+'T')?[iso]:[];
  }));
  return dates.size===1?[...dates][0]:null;
}

const sentenceSegmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('pt-BR', {granularity:'sentence'})
  : null;

export function ultrasoundConclusionPoints(text) {
  const blocks = String(text).replace(/\r\n/g,'\n')
    .split(/\n(?=\s*(?:[•–-]\s+|\d+[.)]\s+))/)
    .map(block=>block.replace(/^\s*(?:[•–-]|\d+[.)])\s+/,'').replace(/\s+/g,' ').trim())
    .filter(Boolean);
  return [...new Set(blocks.flatMap(block=>{
    if(!sentenceSegmenter) return [block];
    const sentences=[];
    for(const {segment} of sentenceSegmenter.segment(block)){
      const sentence=segment.trim();
      if(!sentence)continue;
      if(sentences.length && /\b(?:Dr|Dra|aprox|obs|ref)\.$/i.test(sentences.at(-1))){
        sentences[sentences.length-1]+=' '+sentence;
      }else sentences.push(sentence);
    }
    return sentences;
  }))];
}

function ultrasoundConclusionSummary(findings, escape) {
  const points=[...new Set(findings.filter(item=>item.name==='Conclusão do laudo'&&item.source?.scope!=='historico').flatMap(item=>ultrasoundConclusionPoints(item.result)))];
  if(!points.length)return '<p class="hint">Conclusão não identificada na leitura automática. Confira o laudo original.</p>';
  return '<section class="ultrasound-conclusion"><h4>Principais pontos da conclusão</h4><p class="hint">Trechos extraídos do laudo para conferência.</p><ul>'+
    points.map(point=>'<li>'+escape(point)+'</li>').join('')+'</ul></section>';
}

export function examFindingStatus(item,modality,verified=false){
  const source=item.source;
  if(source?.provider==='gemini'){
    if(source.scope==='historico')return 'historical';
    if(!verified||source.scope!=='atual')return 'review';
    if(modality!=='ultrassom'&&(!source.referenceEligible||!item.unit||
      String(source.referenceUnit).toLowerCase()!==String(item.unit).toLowerCase()))return 'review';
  }
  if(modality==='ultrassom')return item.status==='normal'?'within':item.status==='alterado'?'abnormal':'review';
  return classify(item.result,item.reference);
}
export function examSourceDetails(source,escape){
  if(source?.provider!=='gemini')return '';
  const date=source.collectionDate?String(source.collectionDate).split('-').reverse().join('/'):'Data não identificada';
  const scope={atual:'Atual',historico:'Histórico',incerto:'Coleta incerta'}[source.scope]||'Coleta incerta';
  return '<details class="exam-source"><summary>Fonte sugerida · '+(source.page?'pág. '+escape(source.page)+' · ':'')+escape(date)+' · '+scope+'</summary><small>'+escape(source.excerpt||'Trecho não identificado.')+'</small></details>';
}
export function examResultList(findings, escape, modality, verified=false) {
  const groups=new Map();
  for(const item of visibleExamFindings(findings,modality)){
    if(!item.name||!item.result) continue;
    const group=item.source?.scope==='historico'?'Histórico':item.group||'Outros resultados';
    if(!groups.has(group)) groups.set(group,[]);
    groups.get(group).push(item);
  }
  const status={
    within:[modality==='ultrassom'?'Normal':'Dentro da referência do laudo','success'],
    above:['Alterado · acima','rose'],
    below:['Alterado · abaixo','rose'],
    review:['Revisão manual','neutral'],
    abnormal:['Alterado','rose'],
    historical:['Histórico','neutral'],
  };
  return (modality==='ultrassom'?ultrasoundConclusionSummary(findings,escape):'')+[...groups].sort(([a],[b])=>a==='Hemograma'?-1:b==='Hemograma'?1:0).map(([group,items])=>
    '<section class="exam-group"><h4>'+escape(group)+'</h4><ul class="exam-result-list">'+items.map(item=>{
      const code=examFindingStatus(item,modality,verified);
      const [text,tone]=status[code];
      const value=escape([item.result,item.unit].filter(Boolean).join(' '));
      const description=modality==='ultrassom'&&item.name==='Conclusão do laudo'?
        '<details><summary>Ver trecho da conclusão</summary><small>'+value+'</small></details>':
        '<strong>'+escape(item.name)+'</strong><small>'+value+'</small>';
      return '<li><div>'+description+examSourceDetails(item.source,escape)+'</div><span class="badge '+tone+'">'+text+'</span></li>';
    }).join('')+'</ul></section>'
  ).join('');
}

export function extractUltrasound(source) {
  const normalize=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const findings=[];
  let group='', lines=[];
  const flush=()=>{
    if(!lines.length)return;
    const result=lines.join(group==='Conclusão do laudo'?'\n':' ').trim().slice(0,1500);
    const text=normalize(result).replace(/\s+/g,' ').replace(/[.!]$/,'').trim();
    const explicitNormal=/^(?:exame|estudo|ultrassonografia) (?:normal|sem alteracoes(?: significativas)?|dentro dos limites da normalidade)$|^sem alteracoes(?: significativas)?$/.test(text);
    const explicitAbnormal=/^(?:exame|estudo|ultrassonografia) alterad[oa]$/.test(text);
    findings.push({name:group,result,group:'Ultrassom',status:explicitNormal?'normal':explicitAbnormal?'alterado':'revisao'});
    lines=[];
  };
  for(const raw of source.split(/\r?\n/)){
    const line=raw.trim();
    if(!line)continue;
    const heading=line.match(/^(achados(?: ultrassonogr[aá]ficos)?|conclus[aã]o(?: diagn[oó]stica)?|impress[aã]o(?: diagn[oó]stica)?)\s*(?::\s*(.*))?$/i);
    if(heading){
      flush();
      group=/^achados/i.test(heading[1])?'Achados do laudo':'Conclusão do laudo';
      if(heading[2])lines.push(heading[2]);
    }else if(group && /^(?:paciente|crm|assinado|m[eé]dico|respons[aá]vel|recomenda[çc][õo]es|observa[çc][õo]es)\b/i.test(line)){
      flush();group='';
    }else if(group)lines.push(line);
  }
  flush();
  return findings.slice(0,12);
}
