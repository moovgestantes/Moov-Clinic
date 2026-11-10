import {patientFromExam} from './exam-patient.js';
import {patientWorkspace,whatsappLink} from './patients.js';
import {createClient} from '@supabase/supabase-js';
import {examFindingStatus,examResultList,findExamDate,suggestGroup,extractUltrasound,visibleExamFindings} from './findings.js';
import {supabaseConfig} from './supabase-config.js';
import './style.css';
import './clinic.css';
import './gestar-layout.css';

const config=supabaseConfig(import.meta.env);
const db=config?createClient(config.url,config.key):null;
const demo=import.meta.env.DEV&&import.meta.env.VITE_MOOV_DEMO==='true'&&!db;
const app=document.querySelector('#app');
const dialog=document.querySelector('#dialog');
const toast=document.querySelector('#toast');
const bucket='moov-clinic-private';
const geminiPilot=Boolean(db)&&import.meta.env.VITE_MOOV_GEMINI_PILOT==='true';
const geminiEligible=file=>geminiPilot&&file?.type==='application/pdf'&&file.size>0&&file.size<=4_000_000;
const label={baixa:'Baixa',media:'Média',alta:'Alta'};
const sessionChanged=()=>new Error('Sua sessão mudou. Entre novamente para continuar.');
const formats=['application/pdf','image/jpeg','image/png','image/webp'];
const date=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza'});
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let member=demo?'Demonstração':'', tasks=[], attachments=[], filter='open', selected=null, version=0;
let notice, previewCleanup, screen='dashboard';
let taskQuery='',taskScope='all',taskPriority='all';
const canTreat=()=>!db||['Dra. Mayara','Bia','Beatriz'].includes(member);
const demoFiles=new Map();

function showNotice(message){
  toast.textContent=message;
  toast.classList.add('visible');
  clearTimeout(notice);
  notice=setTimeout(()=>toast.classList.remove('visible'),4000);
}
function requireData(response){
  if(response.error) throw new Error('O Supabase não concluiu a operação. Confira a conexão e o acesso.');
  return response.data;
}
async function loadTable(table){
  const rows=[];
  for(let offset=0;;offset+=500){
    const data=requireData(await db.from(table).select('*').order('created_at',{ascending:false}).order('id').range(offset,offset+499));
    rows.push(...data);
    if(data.length<500) return rows;
  }
}
async function refresh(){
  if(!db) return;
  const epoch=version;
  const [t,a,p,v]=await Promise.all([loadTable('clinic_tasks'),loadTable('clinic_attachments'),loadTable('clinic_patients'),loadTable('clinic_visits')]);
  if(epoch===version){tasks=t;attachments=a;workspace.load(p,v);}
}
async function writeTask(values,id,previousNotes){
  const epoch=version;
  let row;
  if(db){
    const table=db.from('clinic_tasks');
    let query=id?table.update(values).eq('id',id):table.insert(values);
    if(previousNotes!==undefined) query=query.eq('notes',previousNotes);
    row=requireData(await query.select().maybeSingle());
    if(!row) throw new Error('A pendência foi alterada em outra sessão. Copie o texto, feche esta janela e clique em Atualizar antes de tentar novamente.');
  }else{
    row={...(id?tasks.find(t=>t.id===id):{id:crypto.randomUUID(),created_at:new Date().toISOString(),completed_at:null}),...values};
  }
  if(epoch!==version) throw sessionChanged();
  tasks=[row,...tasks.filter(t=>t.id!==row.id)].sort((a,b)=>b.created_at.localeCompare(a.created_at));
  return row;
}

const button=(text,action,style='ghost')=>'<button type="button" class="'+style+'" data-action="'+action+'">'+esc(text)+'</button>';
const brand='<header class="login-brand"><div><img src="/moov-clinic-wordmark.png" alt="MOOV"><span>clinic</span></div><p>Dra. Mayara Madeira</p></header>';
const priority=value=>'<span class="badge pr-'+value+'">'+label[value]+'</span>';
async function writeClinical(table,values,id){
  const epoch=version;
  if(!db) return {id:id||crypto.randomUUID(),created_at:new Date().toISOString(),...values};
  const query=db.from(table);
  const row=requireData(await (id?query.update(values).eq('id',id):query.insert(values)).select().single());
  if(epoch!==version) throw sessionChanged();
  return row;
}
async function sendAI(values,endpoint='clinical-ai'){
  const epoch=version;
  const {session}=requireData(await db.auth.getSession());
  if(!session||epoch!==version) throw sessionChanged();
  const body=new FormData();
  for(const [key,value] of Object.entries(values)) body.set(key,value);
  const response=await fetch('/.netlify/functions/'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+session.access_token},body});
  const payload=await response.json().catch(()=>({error:'Inicie com netlify dev para testar a IA localmente.'}));
  if(epoch!==version) throw sessionChanged();
  if(!response.ok) throw new Error(payload.error||'A IA não concluiu o processamento.');
  return payload;
}
const workspace=patientWorkspace({esc,button,modal,notify:showNotice,save:writeClinical,send:db&&import.meta.env.VITE_MOOV_TRANSCRIPTION_ENABLED==='true'?sendAI:null,
  allowed:canTreat,render,attachmentCard,archivedReports,getTasks:()=>tasks,getAttachments:()=>attachments,setCleanup:fn=>previewCleanup=fn});
function navigation(open){
  const links=[['dashboard','Dashboard','▦'],['patients','Lista de pacientes','☷'],['tasks','Pendências','✓']];
  return '<header class="clinic-mobile-header"><button type="button" class="clinic-menu-toggle" data-action="menu" aria-controls="clinic-sidebar" aria-expanded="false"><span aria-hidden="true">☰</span> Menu</button><img src="/moov-clinic-wordmark.png" alt="MOOV Clinic"></header>'+
    '<button type="button" class="clinic-menu-backdrop" data-action="menu-close" aria-label="Fechar menu" tabindex="-1" hidden></button>'+
    '<aside class="clinic-sidebar" id="clinic-sidebar" aria-label="Navegação do MOOV Clinic"><button type="button" class="clinic-menu-close" data-action="menu-close" aria-label="Fechar menu">×</button><div class="clinic-identity"><img src="/moov-clinic-wordmark.png" alt="MOOV"><span>CLINIC</span></div>'+
    '<nav aria-label="Menu principal">'+links.map(([id,text,icon])=>'<button type="button" class="clinic-link" data-action="screen:'+id+'" '+(screen===id?'aria-current="page"':'')+'><span aria-hidden="true">'+icon+'</span>'+text+(id==='tasks'&&open?'<span class="nav-count">'+open+'</span>':'')+'</button>').join('')+'</nav>'+
    '<div class="clinic-user"><strong>'+esc(member)+'</strong><small>Área da equipe</small>'+(db?button('Sair','logout','clinic-light'):'')+'</div></aside>';
}
const activeTasks=()=>tasks.filter(t=>!workspace.patientArchived(t.patient_id));
function dashboard(open){
  const active=activeTasks();
  const ids=new Set(active.map(t=>t.id));
  const urgent=active.filter(t=>!t.completed_at&&t.priority==='alta').length;
  const reviews=attachments.filter(a=>ids.has(a.task_id)&&a.kind==='exame'&&!a.archived_at&&!a.reviewed_at).length;
  const metrics=[['Pendências abertas',open,'open'],['Prioridade alta',urgent,'urgent'],...(canTreat()?[['Laudos a conferir',reviews,'exams']]:[])];
  return '<section class="dashboard-hero"><div><span class="eyebrow">ÁREA DA EQUIPE</span><h1>Rotina da clínica</h1><p>Organize as próximas ações e acompanhe os laudos que aguardam conferência.</p></div><div class="actions">'+button('+ Nova pendência','new','gold')+button('Lista de pacientes','screen:patients','clinic-light')+'</div></section>'+
    '<div class="dashboard-stats">'+metrics.map(([label,value,id])=>'<button type="button" class="dashboard-stat" data-action="dashboard:'+id+'"><span>'+label+'</span><strong>'+value+'</strong></button>').join('')+'</div>'+
    '<section class="card dashboard-tasks"><div class="card-title"><h2>Próximas ações</h2>'+button('Ver pendências','screen:tasks','outline')+'</div>'+taskRows(active.filter(t=>!t.completed_at).sort((a,b)=>Number(b.priority==='alta')-Number(a.priority==='alta')).slice(0,5))+'</section>';
}
const normalizeSearch=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function filteredTasks(){
  const needle=normalizeSearch(taskQuery);
  const pendingExamIds=new Set(attachments.filter(a=>a.kind==='exame'&&!a.archived_at&&!a.reviewed_at).map(a=>a.task_id));
  const rank={alta:0,media:1,baixa:2};
  return activeTasks().filter(t=>{
    const status=filter==='all'||(filter==='urgent'?!t.completed_at&&t.priority==='alta':filter==='exams'?pendingExamIds.has(t.id):Boolean(t.completed_at)===(filter==='done'));
    const scope=taskScope==='all'||Boolean(t.patient_id)===(taskScope==='paciente');
    const priorityMatches=taskPriority==='all'||taskPriority===t.priority;
    return status&&scope&&priorityMatches&&(!needle||normalizeSearch([t.title,workspace.patientName(t.patient_id),t.assignee].join(' ')).includes(needle));
  }).sort((a,b)=>Number(Boolean(a.completed_at))-Number(Boolean(b.completed_at))||
    (!a.completed_at&&!b.completed_at?rank[a.priority]-rank[b.priority]:0)||b.created_at.localeCompare(a.created_at));
}
function taskFilters(){
  const options=(values,selected)=>values.map(([id,name])=>'<option value="'+id+'" '+(id===selected?'selected':'')+'>'+name+'</option>').join('');
  return '<form id="task-filters" class="task-filters"><label class="list-search"><span class="sr-only">Buscar pendência</span><input type="search" name="query" placeholder="Buscar por título, paciente ou responsável" maxlength="120" value="'+esc(taskQuery)+'"></label><details class="list-filters" '+(taskScope!=='all'||taskPriority!=='all'?'open':'')+'><summary>Filtros</summary><div class="list-filter-fields">'+
    '<label>Tipo<select name="scope">'+options([['all','Todos os tipos'],['geral','Geral'],['paciente','Vinculada a paciente']],taskScope)+'</select></label>'+
    '<label>Prioridade<select name="priority">'+options([['all','Todas'],...Object.entries(label)],taskPriority)+'</select></label>'+
    '<div class="actions">'+button('Limpar','task-clear')+'</div></div></details></form>';
}
function render(){
  if(!member) return;
  const active=activeTasks();
  const open=active.filter(t=>!t.completed_at).length;
  const current=tasks.find(t=>t.id===selected);
  const filtered=screen==='tasks'?filteredTasks():[];
  const taskView=()=>current?taskDetail(current):'<div class="page-title"><div><span class="eyebrow clinic-kicker">ROTINA DA CLÍNICA</span><h1>Pendências</h1></div><div class="actions">'+(db?button('Atualizar','refresh'):'')+button('+ Nova pendência','new','primary')+'</div></div>'+
    '<section class="card"><div class="toolbar"><div class="segments" aria-label="Status das pendências">'+[['open','Pendentes '+open],['done','Concluídas '+(active.length-open)],['all','Todas'],...(filter==='urgent'?[['urgent','Prioridade alta']]:filter==='exams'?[['exams','Laudos a conferir']]:[])].map(([id,text])=>'<button type="button" data-action="filter:'+id+'" class="'+(filter===id?'selected':'ghost')+'" aria-pressed="'+(filter===id)+'">'+text+'</button>').join('')+'</div></div>'+taskFilters()+'<p class="task-match-count" role="status">'+filtered.length+(filtered.length===1?' pendência encontrada':' pendências encontradas')+'</p><div id="task-filter-results">'+taskRows(filtered)+'</div></section>';
  app.innerHTML='<div class="clinic-shell clinic-layout">'+navigation(open)+'<div class="clinic-workspace"><main>'+
    (!db?'<div class="banner"><b>Demonstração</b> · Use apenas dados fictícios. Os dados desta sessão são temporários.</div>':'')+
    (screen==='patients'?workspace.view():screen==='dashboard'?dashboard(open):taskView())+
    '</main><footer>MOOV CLINIC <span>Área interna da equipe</span></footer></div></div>';
}
function taskRows(rows){
  if(!rows.length) return '<div class="empty"><strong>Nenhuma pendência nesta lista.</strong></div>';
  return rows.map(t=>{
    const count=attachments.filter(a=>a.task_id===t.id&&a.kind==='exame'&&!a.archived_at).length;
    return '<article class="row"><button type="button" class="checkbox '+(t.completed_at?'done':'')+'" data-action="toggle:'+t.id+'" aria-label="'+(t.completed_at?'Reabrir ':'Concluir ')+esc(t.title)+'">'+(t.completed_at?'✓':'')+'</button><div class="row-text"><strong>'+esc(t.title)+'</strong><small>'+esc([workspace.patientName(t.patient_id)||'Geral',t.assignee].filter(Boolean).join(' · '))+' · Criada em '+date.format(new Date(t.created_at))+(count?' · '+count+(count===1?' laudo':' laudos'):'')+'</small></div><div class="row-end">'+priority(t.priority)+(t.completed_at?'<span class="badge success">Concluída</span>':'')+button('Abrir','task:'+t.id)+'</div></article>';
  }).join('');
}
function attachmentCard(a){
  const exam=a.kind==='exame';
  const modality=a.exam_modality==='ultrassom'?'Ultrassom':'Laboratorial';
  const title=/^unknown(?:\.[a-z]+)?$/i.test(a.filename)?modality+' · laudo anexado':a.filename;
  const findings=exam?visibleExamFindings(a.findings,a.exam_modality):[];
  const resultLabel=findings.length===1?'1 resultado':findings.length+' resultados';
  const read=Boolean(a.read_at||a.reviewed_at);
  return '<article class="exam-report exam-compact"><div class="card-title"><div><h3>'+esc(title)+'</h3><p>'+
    (exam?modality+' · '+(a.exam_date?a.exam_date.split('-').reverse().join('/'):'Data não informada')+' · '+(a.archived_at?'Arquivado':a.reviewed_at?'Conferido':'A conferir'):(a.archived_at?'Documento · Na lixeira':'Documento'))+
    '</p>'+(exam&&!a.archived_at?'<span class="badge '+(read?'success':'neutral')+'">'+(read?'Lido':'Não lido')+'</span>':'')+'</div><div class="actions">'+button(exam?'Abrir laudo':'Visualizar','file:'+a.id,'outline')+
    (exam&&!a.archived_at&&!read&&canTreat()?button('Marcar como lido','read-exam:'+a.id):'')+
    (canTreat()?(a.archived_at?button('Restaurar','restore-exam:'+a.id):button('Editar','edit-exam:'+a.id)+button('Excluir','archive-exam:'+a.id,'danger-link')):'')+'</div></div>'+
    (exam?(findings.length?'<details class="exam-result-disclosure"><summary>Ver '+resultLabel+'</summary>'+examResultList(findings,esc,a.exam_modality,Boolean(a.reviewed_at))+'</details>':
      '<p class="hint">Nenhum resultado identificado com segurança.</p>'):'')+'</article>';
}
function archivedReports(files){
  const archived=files.filter(a=>a.archived_at);
  return archived.length?'<details class="exam-history"><summary>Lixeira e arquivados ('+archived.length+')</summary>'+archived.map(attachmentCard).join('')+'</details>':'';
}
function taskDetail(t){
  const files=attachments.filter(a=>a.task_id===t.id);
  const exams=files.filter(a=>a.kind==='exame'&&!a.archived_at);
  const previousFiles=files.filter(a=>a.kind!=='exame'&&!a.archived_at);
  return '<div class="task-detail" id="task-detail"><div class="task-back">'+button('‹ Pendências','close')+(db?button('Atualizar','refresh'):'')+'</div>'+
    '<section class="card"><div class="card-title"><div><h1>'+esc(t.title)+'</h1><p>'+esc(workspace.patientName(t.patient_id)||'Pendência geral')+' · Criada em '+date.format(new Date(t.created_at))+'</p></div><div class="actions">'+priority(t.priority)+whatsappLink(workspace.patientPhone(t.patient_id))+button('Editar','edit:'+t.id)+'</div></div>'+
    '<div class="task-section"><div class="card-title"><h2>Observações da equipe</h2>'+button('+ Adicionar observação','task-note:'+t.id,'outline')+'</div>'+
    (t.notes?'<div class="task-notes">'+esc(t.notes)+'</div>':'<p class="hint">Nenhuma observação registrada.</p>')+'</div>'+
    '<div class="task-section"><div class="card-title"><h2>Exames</h2>'+
    '<div class="actions">'+(!t.patient_id&&exams.length===1&&canTreat()?button('Cadastrar pelo laudo','exam-patient:'+t.id,'outline'):'')+
    (canTreat()&&!workspace.patientArchived(t.patient_id)?button('+ Anexar laudos','task-exam:'+t.id,'primary'):'')+'</div></div>'+
    (exams.length?exams.map(attachmentCard).join(''):'<p class="hint">Nenhum laudo anexado.</p>')+
    archivedReports(files.filter(a=>a.kind==='exame'))+
    (previousFiles.length?'<details class="exam-history"><summary>Arquivos anteriores ('+previousFiles.length+')</summary>'+previousFiles.map(attachmentCard).join('')+'</details>':'')+
    archivedReports(files.filter(a=>a.kind!=='exame'))+'</div></section></div>';
}

function addTaskNote(id){
  const task=tasks.find(item=>item.id===id);
  if(!task) return;
  const previous=task.notes??'';
  const stamp=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Fortaleza'}).format(new Date());
  const prefix=(previous?previous+'\n\n':'')+member+' · '+stamp+'\n';
  const remaining=4000-prefix.length;
  if(remaining<=0){showNotice('As observações atingiram o limite desta pendência.');return;}
  modal('Adicionar observação','<label>Observação da equipe<textarea name="note" required maxlength="'+Math.min(remaining,1500)+'" placeholder="Registre sua avaliação ou orientação"></textarea></label><p class="hint">A observação fica no MOOV Clinic. O WhatsApp pode ser aberto separadamente.</p>',
    'Salvar observação',async data=>{
      const note=data.note.trim();
      if(!note) throw new Error('Escreva uma observação.');
      await writeTask({notes:prefix+note},id,previous);
      showNotice('Observação salva.');
    });
}

function modal(title,body,submit,handler){
  dialog.innerHTML='<div class="modal-head"><h2 id="dialog-title">'+esc(title)+'</h2><button type="button" class="close" aria-label="Fechar">×</button></div><form><div class="modal-body">'+body+'<p class="error" role="alert" hidden></p></div>'+
    (submit?'<div class="modal-foot"><button type="button" class="ghost cancel">Cancelar</button><button class="primary" type="submit">'+submit+'</button></div>':'')+'</form>';
  dialog.querySelectorAll('.cancel,.close').forEach(b=>b.onclick=()=>{
    if(dialog.querySelector('[data-recording]')) return;
    dialog.close();
  });
  const form=dialog.querySelector('form');
  form.onsubmit=async event=>{
    event.preventDefault();
    if(!handler || form.dataset.busy) return;
    const error=form.querySelector('.error');
    const epoch=version;
    error.hidden=true;
    if(form.dataset.recording){error.textContent='Aguarde a gravação ou a transcrição terminar.';error.hidden=false;return;}
    const buttons=[...form.querySelectorAll('button')].map(b=>[b,b.disabled]);
    form.dataset.busy='true';
    form.querySelectorAll('button').forEach(b=>b.disabled=true);
    dialog.querySelector('.close').disabled=true;
    try{
      const next=await handler(Object.fromEntries(new FormData(form)),form);
      if(epoch===version){
        dialog.close();
        render();
        if(typeof next==='function')next();
      }
    }catch(e){
      error.textContent=e.message||'Não foi possível concluir. Tente novamente.';
      error.hidden=false;
    }finally{
      delete form.dataset.busy;
      for(const [b,wasDisabled] of buttons)b.disabled=wasDisabled;
      if(dialog.querySelector('.close')) dialog.querySelector('.close').disabled=false;
    }
  };
  if(!dialog.open) dialog.showModal();
  return form;
}
dialog.addEventListener('cancel',e=>{if(dialog.querySelector('[data-busy],[data-recording]')) e.preventDefault();});
dialog.addEventListener('close',()=>{if(!dialog.open){previewCleanup?.();previewCleanup=null;dialog.replaceChildren();}});

function editTask(id,patientId){
  const t=tasks.find(x=>x.id===id)??{};
  let chosen=patientId;
  const patientField=canTreat()?(t.patient_id?'<p class="hint">Vinculada a paciente · '+esc(workspace.patientName(t.patient_id))+'</p>':
    '<div class="fields"><label>Tipo de pendência<select name="task_type"><option value="geral">Pendência geral</option><option value="paciente" '+(chosen?'selected':'')+'>Vinculada a paciente</option></select></label>'+
    '<div data-patient-choice '+(chosen?'':'hidden')+'><label>Paciente<input type="search" name="patient_query" autocomplete="off" placeholder="Digite o nome do paciente" value="'+esc(workspace.patientName(chosen))+'" '+(chosen?'required':'disabled')+'></label><div class="task-patient-results" aria-label="Pacientes encontrados"></div></div></div>'):'';
  const form=modal(id?'Editar pendência':'Nova pendência',patientField+'<label>O que precisa ser resolvido?<input name="title" required maxlength="160" value="'+esc(t.title)+'"></label><label>Detalhes<textarea name="notes" maxlength="4000">'+esc(t.notes)+'</textarea></label>'+
    '<div class="fields"><label>Responsável<select name="assignee"><option value="">Em aberto</option>'+[member==='Beatriz'||t.assignee==='Beatriz'?'Beatriz':'Bia','Dra. Mayara'].map(n=>'<option '+(n===t.assignee?'selected':'')+'>'+n+'</option>').join('')+'</select></label>'+
    '<label>Prioridade<select name="priority">'+Object.entries(label).map(([k,v])=>'<option value="'+k+'" '+(k===(t.priority??'media')?'selected':'')+'>'+v+'</option>').join('')+'</select></label></div>',
    'Salvar pendência',async data=>{
      if(!data.title.trim()) throw new Error('Informe o título da pendência.');
      const match=data.task_type==='paciente'&&workspace.directory().find(p=>p.id===chosen);
      if(data.task_type==='paciente'&&!match)throw new Error('Busque o nome e clique no paciente encontrado.');
      const notesChanged=data.notes.trim()!==(t.notes??'');
      const row=await writeTask({title:data.title.trim(),...(notesChanged?{notes:data.notes.trim()}:{}),assignee:data.assignee||null,priority:data.priority,...(canTreat()&&!t.patient_id&&match?{patient_id:match.id}:{})},id,id&&notesChanged?t.notes??'':undefined);
      selected=row.id;
      if(!id){filter='open';if(screen==='dashboard')screen='tasks';}
      showNotice('Pendência salva.');
    });
  const type=form.elements.task_type;
  if(!type)return;
  const input=form.elements.patient_query;
  const picker=input.closest('[data-patient-choice]');
  const results=picker.querySelector('.task-patient-results');
  type.addEventListener('change',()=>{
    const linked=type.value==='paciente';
    picker.hidden=!linked;
    input.disabled=!linked;
    input.required=linked;
    if(linked)input.focus();
  });
  input.addEventListener('input',()=>{
    chosen=null;
    const query=normalizeSearch(input.value);
    if(!query){results.replaceChildren();return;}
    const matches=workspace.directory().filter(p=>normalizeSearch(p.name).includes(query)).slice(0,8);
    results.innerHTML=matches.length?matches.map(p=>'<button type="button" class="ghost" data-patient-id="'+esc(p.id)+'">'+
      esc(p.name)+(p.birth_date?' <small>'+esc(p.birth_date.split('-').reverse().join('/'))+'</small>':'')+'</button>').join(''):
      '<p class="hint" role="status">Nenhum paciente encontrado.</p>';
  });
  results.addEventListener('click',event=>{
    const row=event.target.closest('[data-patient-id]');
    if(!row)return;
    chosen=row.dataset.patientId;
    input.value=workspace.patientName(chosen);
    input.focus();
    results.replaceChildren();
  });
}

async function uploadFile(resolveTask,data,form,index,total){
  const epoch=version;
  const f=data.file;
  if(!f?.size||!formats.includes(f.type)||f.size>12*1024*1024) throw new Error('Selecione um PDF, JPG, PNG ou WebP de até 12 MB.');
  const updateProgress=message=>{form.querySelector('.upload-progress').textContent=index+'/'+total+' · '+message;};
  let extraction='none',findings=[],source='';
  const ultrasound=data.exam_modality==='ultrassom';
  const eligible=data.kind==='exame'&&canTreat()&&geminiEligible(f);
  let gemini=false,geminiFallback=false;
  if(eligible&&data.geminiConsent){
    updateProgress('Lendo PDF com Gemini…');
    try{
      const result=await sendAI({pdf:f,anonymous:'yes',modality:ultrasound?'ultrassom':'laboratorial'},'gemini-exam');
      if(!result.findings?.length)throw new Error('Nenhum resultado identificado.');
      findings=result.findings.map(item=>({...item,source:{...item.source,partial:Boolean(result.partial)}}));
      gemini=true;
      extraction='manual';
    }catch{
      if(epoch!==version)throw sessionChanged();
      geminiFallback=true;
    }
  }
  if(data.kind==='exame'&&!gemini){
    updateProgress('Lendo o exame…');
    try{
      const reader=await import('./extract.js');
      ({extraction,findings,source}=await reader.extractExam(f,f.type,updateProgress));
    }catch{
      extraction='manual';
    }
  }
  if(ultrasound&&!gemini) findings=extractUltrasound(source);
  if(data.kind==='exame'&&!eligible&&data.ai==='on'&&!ultrasound){
    if(!canTreat()||!db) throw new Error('Acesso clínico conectado necessário.');
    if(!source.trim()) throw new Error('O texto do laudo não foi reconhecido. Desmarque a IA para salvar e revisar manualmente.');
    if(source.length>24000) throw new Error('O texto do laudo excede o limite da IA. Desmarque a IA para usar a leitura local.');
    updateProgress('Extraindo resultados com IA…');
    const result=await sendAI({action:'exam',confirmed:'yes',text:source});
    if(result.findings.length) findings=result.findings;
  }
  if(epoch!==version) throw sessionChanged();
  updateProgress('Salvando laudo…');
  const task=await resolveTask();
  const id=crypto.randomUUID();
  const path=task+'/'+id;
  const payload={id,task_id:task,object_path:path,filename:f.name.slice(0,240),mime:f.type,kind:data.kind,extraction,findings};
  if(data.kind==='exame'){
    const dates=new Set(findings.filter(item=>item.source?.scope==='atual').map(item=>item.source.collectionDate).filter(Boolean));
    payload.exam_date=data.exam_date||(gemini?(dates.size===1?[...dates][0]:null):findExamDate(source));
    payload.exam_modality=ultrasound?'ultrassom':'laboratorial';
    payload.findings=ultrasound?findings:findings.map(item=>({...item,group:suggestGroup(item.name,source||item.source?.excerpt||'')}));
  }
  let saved;
  if(db){
    const files=db.storage.from(bucket);
    requireData(await files.upload(path,f,{contentType:f.type,upsert:false,cacheControl:'0'}));
    try{
      if(epoch!==version) throw sessionChanged();
      saved=requireData(await db.from('clinic_attachments').insert(payload).select().single());
    }catch(error){
      await files.remove([path]);
      throw error;
    }
  }else{
    demoFiles.set(path,f);
    saved={...payload,created_at:new Date().toISOString(),reviewed_at:null};
  }
  if(epoch!==version) throw sessionChanged();
  attachments.unshift(saved);
  return {fallback:geminiFallback,identity:data.identify&&!gemini?patientFromExam(source):null};
}
function attach(task,patientId){
  const existing=task?tasks.find(t=>t.id===task):null;
  const patient=existing?.patient_id??patientId;
  if(!canTreat()||!(task?existing:patient)||workspace.patientArchived(patient))return;
  const completed=new Set();
  const form=modal('Anexar laudos',
    '<label>Arquivos<input type="file" name="files" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple required></label>'+
    '<div class="upload-items"></div>'+
    '<p class="upload-progress" role="status"></p>',
    'Salvar laudos',async (data,form)=>{
      const files=[...form.elements.files.files];
      const key=file=>JSON.stringify([file.name,file.size,file.lastModified,file.type]);
      const pending=files.map((file,index)=>({file,index,key:key(file)})).filter(item=>!completed.has(item.key));
      if(pending.some(({file})=>!file.size||!formats.includes(file.type)||file.size>12*1024*1024)){
        throw new Error('Selecione arquivos PDF, JPG, PNG ou WebP de até 12 MB cada.');
      }
      const geminiConsent=pending.some(({file})=>geminiEligible(file))&&window.confirm(
        'Os PDFs selecionados foram anonimizados? Confirme para enviar os PDFs elegíveis ao Gemini. Cancelar mantém a leitura no aparelho.');
      let fallback=false;
      let saved=0;
      let identity=null;
      const identify=existing&&!patient&&pending.length===1&&!completed.size;

      const resolveTask=async()=>{
        if(!task){
          const created=await writeTask({title:'Conferir exames · '+workspace.patientName(patient).slice(0,140),notes:'',assignee:db?member:null,priority:'media',patient_id:patient});
          task=created.id;
        }
        return task;
      };
      for(const [position,item] of pending.entries()){
        if(completed.has(item.key))continue;
        try{
          const result=await uploadFile(resolveTask,{kind:'exame',file:item.file,geminiConsent,identify,
            exam_modality:data['modality_'+item.index],exam_date:data['date_'+item.index],ai:data['ai_'+item.index]},form,position+1,pending.length);
          fallback=result.fallback||fallback;
          identity=result.identity;
        }catch(error){
          if(form.isConnected)render();
          throw new Error(item.file.name+' · '+error.message+(completed.size?' Os laudos já salvos serão ignorados ao tentar novamente.':''));
        }
        completed.add(item.key);
        saved++;
      }
      showNotice(saved===0?'Laudos já anexados.':fallback?'Laudos salvos. Houve leitura local quando o Gemini ficou indisponível.':saved===1?'Laudo anexado.':saved+' laudos anexados.');
      if(identify&&saved===1)return ()=>registerFromExam(task,identity,pending[0].file);
    });
  form.elements.files.addEventListener('change',()=>{
    form.querySelector('.upload-items').innerHTML=[...form.elements.files.files].map((file,i)=>
      '<fieldset><legend>'+esc(file.name)+'</legend><div class="fields"><label>Tipo<select name="modality_'+i+'"><option value="laboratorial">Laboratorial</option><option value="ultrassom">Ultrassom (US)</option></select></label><label>Data do exame<input type="date" name="date_'+i+'"></label></div>'+
      (db&&!geminiEligible(file)?'<label class="inline"><input type="checkbox" name="ai_'+i+'"> Autorizar envio do texto laboratorial à OpenAI</label>':'')+'</fieldset>'
    ).join('');
  });
}

function registerFromExam(id,identity=null,file=null){
  const task=tasks.find(item=>item.id===id);
  const exams=attachments.filter(item=>item.task_id===id&&item.kind==='exame'&&!item.archived_at);
  if(!canTreat()||!task||task.patient_id||exams.length!==1)return;
  const exam=exams[0];
  const epoch=version;
  const form=modal('Paciente do laudo',
    '<div class="fields"><label>Nome completo<input name="patient_name" required maxlength="160" value="'+esc(identity?.name)+'"></label>'+
    '<label>Data de nascimento<input type="date" name="patient_birth" value="'+esc(identity?.birth_date)+'"></label></div>'+
    '<p class="hint" data-identify-status role="status"></p><div class="task-patient-results" data-matches></div>',
    'Criar cadastro',async(data,form)=>{
      const existing=form.dataset.linkPatient;
      if(existing){
        if(!workspace.directory().some(p=>p.id===existing))throw new Error('Paciente indisponível.');
        await writeTask({patient_id:existing},id);
        showNotice('Paciente vinculado. Laudo disponível no histórico.');
        return;
      }
      const name=data.patient_name.trim().replace(/\s+/g,' ');
      const birth_date=data.patient_birth||null;
      if(name.length<2)throw new Error('Informe o nome completo.');
      if(birth_date&&new Date(birth_date+'T00:00:00Z')>new Date())throw new Error('Confira a data de nascimento.');
      if(workspace.directory().some(p=>normalizeSearch(p.name)===normalizeSearch(name)&&(!p.birth_date||!birth_date||p.birth_date===birth_date))){
        throw new Error('Já existe um cadastro compatível. Use Vincular paciente.');
      }
      let patient;
      if(db){
        const {data:result,error}=await db.rpc('clinic_register_patient_from_exam',{task_id:id,patient_name:name,patient_birth_date:birth_date});
        if(error){
          if(error.code==='P0001')throw new Error(error.message);
          throw new Error('Não foi possível criar o cadastro pelo laudo.');
        }
        if(epoch!==version)throw sessionChanged();
        patient=Array.isArray(result)?result[0]:result;
        if(!patient?.id)throw new Error('Não foi possível confirmar o novo cadastro. Atualize a página.');
        tasks=tasks.map(item=>item.id===id?{...item,patient_id:patient.id}:item);
      }else{
        patient=await writeClinical('clinic_patients',{name,birth_date,phone:''});
        await writeTask({patient_id:patient.id},id);
      }
      workspace.addPatient(patient);
      showNotice('Paciente cadastrado. Laudo disponível no histórico.');
    });
  const name=form.elements.patient_name;
  const birth=form.elements.patient_birth;
  const status=form.querySelector('[data-identify-status]');
  const matches=form.querySelector('[data-matches]');
  const updateMatches=()=>{
    const query=normalizeSearch(name.value);
    const list=query.length>=2?workspace.directory().filter(p=>normalizeSearch(p.name).includes(query)).slice(0,6):[];
    matches.innerHTML=list.map(p=>'<button type="button" class="outline" data-link-patient="'+esc(p.id)+'">Vincular '+esc(p.name)+
      (p.birth_date?' <small>'+esc(p.birth_date.split('-').reverse().join('/'))+'</small>':'')+'</button>').join('');
  };
  let edited=false;
  form.addEventListener('input',()=>{edited=true;updateMatches();});
  matches.addEventListener('click',event=>{
    const control=event.target.closest('[data-link-patient]');
    if(!control)return;
    form.dataset.linkPatient=control.dataset.linkPatient;
    form.requestSubmit();
    delete form.dataset.linkPatient;
  });
  const suggest=values=>{
    if(!form.isConnected||epoch!==version)return;
    if(!edited){name.value=values.name??'';birth.value=values.birth_date??'';}
    status.textContent=values.name?'Confira os dados antes de vincular ou criar o cadastro.':'Dados não identificados no laudo.';
    updateMatches();
  };
  if(identity){suggest(identity);return;}
  status.textContent='Buscando dados no laudo…';
  void (async()=>{
    try{
      const blob=file??(db?requireData(await db.storage.from(bucket).download(exam.object_path)):demoFiles.get(exam.object_path));
      if(!form.isConnected||epoch!==version)return;
      const reader=await import('./extract.js');
      const {source}=await reader.extractExam(blob,exam.mime,()=>{});
      suggest(patientFromExam(source));
    }catch{suggest({});}
  })();
}

const flags={historical:['Histórico','neutral'],abnormal:['Alterado','rose'],within:['Dentro da referência do laudo','success'],above:['Alterado · acima da faixa','rose'],below:['Alterado · abaixo da faixa','rose'],review:['Revisão manual','neutral']};
const fields=[['name','Exame',100],['result','Resultado',50],['unit','Unidade',25],['reference','Referência do laudo',150],['group','Grupo (ex.: Hemograma)',60]];
const ultrasoundFields=[['name','Seção ou achado',100],['result','Trecho do laudo',1500],['status','Classificação',20]];
function resultEditor(a,form,editorFields){
  const ultrasound=a.exam_modality==='ultrassom';
  const list=form.querySelector('.findings');
  const cards=form.querySelector('.exam-summary');
  const sources=new WeakMap();
  form.examSources=sources;
  function refreshCards(){
    const entries=[...list.children].flatMap(row=>{
      const get=field=>row.querySelector('[data-field="'+field+'"]').value.trim();
      const name=get('name'),result=get('result');
      const unit=ultrasound?'':get('unit'),reference=ultrasound?'':get('reference'),group=ultrasound?'Ultrassom':get('group');
      const status=ultrasound?get('status'):null;
      const source=sources.get(row);
      const item={name,result,unit,reference,group,status,...(source?{source}:{})};
      const [text,tone]=flags[examFindingStatus(item,a.exam_modality)];
      row.querySelector('.badge').textContent=text;
      row.querySelector('.badge').className='badge '+tone;
      return name&&result?[item]:[];
    });
    cards.innerHTML=examResultList(entries,esc,a.exam_modality);
    cards.hidden=!entries.length;
  }
  function addRow(item={}){
    if(list.children.length>=100) return;
    const row=document.createElement('fieldset');
    row.className='finding';
    if(item.source)sources.set(row,item.source);
    row.innerHTML='<legend>Resultado</legend><div class="fields">'+editorFields.map(([key,text,max])=>key==='status'?'<label>'+text+'<select data-field="status">'+[['revisao','Revisão manual'],['normal','Normal'],['alterado','Alterado']].map(([value,label])=>'<option value="'+value+'" '+(value===item.status?'selected':'')+'>'+label+'</option>').join('')+'</select></label>':ultrasound&&key==='result'?'<label>'+text+'<textarea data-field="result" maxlength="'+max+'">'+esc(item.result)+'</textarea></label>':'<label>'+text+'<input data-field="'+key+'" maxlength="'+max+'" value="'+esc(item[key])+'"></label>').join('')+'</div><div class="actions"><span class="badge"></span><button type="button" class="ghost">Remover linha</button></div>';
    row.querySelector('button').onclick=()=>{row.remove();refreshCards();};
    list.append(row);
  }
  for(const item of visibleExamFindings(a.findings,a.exam_modality)) addRow(item);
  list.addEventListener('input',refreshCards);
  form.querySelector('[data-add-finding]').onclick=()=>{addRow();refreshCards();};
  refreshCards();
}

async function filePreview(a,form){
  const target=form.querySelector('.original-file');
  let active=true,pdf=null,objectUrl;
  previewCleanup=()=>{
    active=false;
    if(pdf) void pdf.destroy().catch(()=>{});
    if(objectUrl) URL.revokeObjectURL(objectUrl);
  };
  try{
    const blob=db?requireData(await db.storage.from(bucket).download(a.object_path)):demoFiles.get(a.object_path);
    if(!active) return;
    if(a.mime!=='application/pdf'){
      const image=document.createElement('img');
      image.alt='Imagem original do anexo';
      objectUrl=URL.createObjectURL(blob);
      image.src=objectUrl;
      target.replaceChildren(image);
      return;
    }
    const {openPdf,renderPage}=await import('./extract.js');
    const doc=await openPdf(blob);
    if(!active){await doc.destroy();return;}
    pdf=doc;
    const canvas=document.createElement('canvas');
    canvas.setAttribute('aria-label','Página do laudo original');
    const controls=document.createElement('div');
    controls.className='actions';
    controls.innerHTML='<button type="button" class="ghost">Anterior</button><span role="status"></span><button type="button" class="ghost">Próxima</button>';
    const [prev,next]=controls.querySelectorAll('button');
    const status=controls.querySelector('span');
    let current=1;
    const paint=async()=>{
      prev.disabled=next.disabled=true;
      status.textContent='Página '+current+' de '+pdf.numPages;
      try{
        await renderPage(pdf,current,canvas,1.3);
        if(active){prev.disabled=current===1;next.disabled=current===pdf.numPages;}
      }catch{
        if(active) status.textContent='Não foi possível abrir a página.';
      }
    };
    prev.onclick=()=>{current--;void paint();};
    next.onclick=()=>{current++;void paint();};
    target.replaceChildren(controls,canvas);
    await paint();
  }catch{
    if(active) target.textContent='Não foi possível visualizar o arquivo original.';
  }
}
function editAttachment(id){
  const item=attachments.find(a=>a.id===id&&!a.archived_at);
  if(!item)return;
  if(item.kind==='exame'){openFile(id,true);return;}
  modal('Editar arquivo','<label>Nome exibido<input name="filename" required maxlength="240" value="'+esc(item.filename)+'"></label>','Salvar',async data=>{
    const filename=data.filename.trim();
    if(!filename)throw new Error('Informe o nome do arquivo.');
    const epoch=version;
    const updated=db?requireData(await db.from('clinic_attachments').update({filename}).eq('id',id).is('archived_at',null).select().single()):{...item,filename};
    if(epoch!==version)throw sessionChanged();
    attachments=attachments.map(a=>a.id===id?updated:a);
    showNotice('Arquivo atualizado.');
  });
}

function openFile(id,editing=false){
  const a=attachments.find(a=>a.id===id);
  if(!a) return;
  const exam=a.kind==='exame';
  const editable=exam&&canTreat()&&!a.archived_at;
  const ultrasound=a.exam_modality==='ultrassom';
  const editorFields=ultrasound?ultrasoundFields:fields;
  const gemini=a.findings?.some(item=>item.source?.provider==='gemini');
  const partial=a.findings?.some(item=>item.source?.partial);
  const form=modal(editing?'Editar laudo':a.filename,'<details class="original" '+(editing?'':'open')+'><summary>Visualizar arquivo original</summary><div class="original-file">Carregando arquivo…</div></details>'+
    (editable?'<h3>Resultados do exame</h3><p class="hint">'+(a.reviewed_at?'':'A conferir com o laudo original. ')+(gemini?'Sugestões do piloto Gemini. '+(partial?'Parte da saída foi descartada ou atingiu o limite. ':''):a.extraction==='ocr'?'Leitura por imagem. ':a.extraction==='manual'?'Leitura parcial ou indisponível. ':'')+'</p>'+
    (a.reviewed_at?'<p class="hint">Última conferência em '+date.format(new Date(a.reviewed_at))+'.</p>':'')+
    (editing?'<label>Nome exibido<input name="filename" required maxlength="240" value="'+esc(a.filename)+'"></label>':'')+'<label>Data da realização ou coleta<input type="date" name="exam_date" value="'+esc(a.exam_date)+'"></label><div class="exam-summary exam-summary-list" aria-label="Resumo da leitura do exame"></div>'+(visibleExamFindings(a.findings,a.exam_modality).length?'':'<p class="hint">Nenhum resultado reconhecido.</p>')+'<details class="original" '+(editing||!visibleExamFindings(a.findings,a.exam_modality).length?'open':'')+'><summary>Editar resultados e grupos</summary><div class="findings"></div><button type="button" class="ghost" data-add-finding>+ Adicionar resultado</button></details><label class="inline"><input name="confirmed" type="checkbox" required> Conferi os resultados e as referências no laudo original.</label>':''),
    editable?'Salvar conferência':'',editable?async (data,form)=>{
      const findings=[...form.querySelectorAll('.finding')].map(row=>({...(ultrasound?{group:'Ultrassom'}:{}),...(form.examSources.get(row)?{source:form.examSources.get(row)}:{}),...Object.fromEntries(editorFields.map(([key])=>[key,row.querySelector('[data-field='+key+']').value.trim()]))}));
      if(!findings.length || findings.some(x=>!x.name||!x.result)) throw new Error('Informe o nome e o resultado de cada exame.');
      const epoch=version;
      if(editing&&!data.filename.trim())throw new Error('Informe o nome do laudo.');
      const values={findings,exam_date:data.exam_date||null,reviewed_at:new Date().toISOString(),...(editing?{filename:data.filename.trim()}:{})};
      const updated=db?requireData(await db.from('clinic_attachments').update(values).eq('id',id).select().single()):{...a,...values};
      if(epoch!==version) throw sessionChanged();
      attachments=attachments.map(a=>a.id===id?updated:a);
      showNotice('Conferência salva.');
    }:null);
  if(editable){
    resultEditor(a,form,editorFields);
    if(canTreat()&&!a.reviewed_at&&!gemini){
      const reread=document.createElement('button');
      reread.type='button';reread.className='outline';reread.textContent='Reler PDF ou imagem';
      form.querySelector('.original').after(reread);
      reread.onclick=()=>{if(window.confirm('Refazer a leitura do original? A extração pendente será substituída.'))void rereadExam(a,form,reread);};
    }
  }
  const original=form.querySelector('details');
  if(original.open) void filePreview(a,form);
  else original.addEventListener('toggle',()=>{if(original.open&&!previewCleanup) void filePreview(a,form);});
}

async function rereadExam(a,form,control){
  const epoch=version;
  if(!canTreat()||a.reviewed_at||form.dataset.busy)return;
  form.dataset.busy='true';
  const controls=[...form.querySelectorAll('button')].map(button=>[button,button.disabled]);
  controls.forEach(([button])=>button.disabled=true);
  control.textContent='Relendo laudo…';
  try{
    const blob=db?requireData(await db.storage.from(bucket).download(a.object_path)):demoFiles.get(a.object_path);
    const reader=await import('./extract.js');
    const parsed=await reader.extractExam(blob,a.mime,()=>{});
    if(epoch!==version)throw sessionChanged();
    const findings=a.exam_modality==='ultrassom'?extractUltrasound(parsed.source):
      parsed.findings.map(item=>({...item,group:suggestGroup(item.name,parsed.source)}));
    const values={findings,exam_date:a.exam_date||findExamDate(parsed.source)};
    const updated=db?requireData(await db.from('clinic_attachments').update(values).eq('id',a.id).is('reviewed_at',null).select().single()):{...a,...values};
    if(epoch!==version)throw sessionChanged();
    attachments=attachments.map(item=>item.id===a.id?updated:item);
    previewCleanup?.();previewCleanup=null;
    render();openFile(a.id,true);
    showNotice(findings.length?'Leitura atualizada. Confira o resultado.':'Leitura concluída sem resultados identificados.');
  }catch(e){if(epoch===version){const error=form.querySelector('.error');error.textContent=e.message||'Não foi possível reler o laudo.';error.hidden=false;}}
  finally{
    delete form.dataset.busy;
    controls.forEach(([button,disabled])=>button.disabled=disabled);
    control.textContent='Reler PDF ou imagem';
  }
}

function changeExamArchive(id,archive){
  const exam=attachments.find(item=>item.id===id);
  if(!canTreat()||!exam||Boolean(exam.archived_at)===archive)return;
  const action=archive?'Excluir da lista':'Restaurar';
  const message=archive?'O item sairá da lista ativa. O original e os dados ficarão disponíveis na lixeira para restauração.':'O item voltará para a lista ativa.';
  modal(action,'<p>'+message+'</p><p><strong>'+esc(exam.filename)+'</strong></p>',action,async ()=>{
    const epoch=version;
    const archived_at=archive?new Date().toISOString():null;
    let updated={...exam,archived_at};
    if(db){
      const response=await db.from('clinic_attachments').update({archived_at}).eq('id',id).select().single();
      if(response.error?.code==='PGRST204'||response.error?.code==='42703')throw new Error('Execute a migração arquivar_laudos.sql antes de arquivar ou restaurar.');
      updated=requireData(response);
    }
    if(epoch!==version)throw sessionChanged();
    attachments=attachments.map(item=>item.id===id?updated:item);
    showNotice(archive?'Item enviado para a lixeira.':'Item restaurado.');
  });
}

function setMobileMenu(open,restoreFocus=true){
  const shell=app.querySelector('.clinic-layout');
  const toggle=app.querySelector('.clinic-menu-toggle');
  const backdrop=app.querySelector('.clinic-menu-backdrop');
  if(!shell||!toggle||!backdrop)return;
  shell.classList.toggle('menu-open',open);
  toggle.setAttribute('aria-expanded',String(open));
  backdrop.hidden=!open;
  const sidebar=app.querySelector('#clinic-sidebar');
  app.querySelector('.clinic-workspace').inert=open;
  if(open){
    sidebar.setAttribute('role','dialog');
    sidebar.setAttribute('aria-modal','true');
    sidebar.querySelector('.clinic-menu-close').focus();
  }else{
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
    if(restoreFocus)toggle.focus();
  }
}
window.matchMedia('(max-width: 900px)').addEventListener('change',()=>{
  if(app.querySelector('.menu-open'))setMobileMenu(false,false);
});
app.addEventListener('keydown',event=>{
  if(!app.querySelector('.menu-open'))return;
  if(event.key==='Escape'){event.preventDefault();setMobileMenu(false);return;}
  if(event.key!=='Tab')return;
  const buttons=[...app.querySelectorAll('#clinic-sidebar button:not([disabled])')];
  if(event.shiftKey&&document.activeElement===buttons[0]){
    event.preventDefault();buttons.at(-1).focus();
  }else if(!event.shiftKey&&document.activeElement===buttons.at(-1)){
    event.preventDefault();buttons[0].focus();
  }
});
app.addEventListener('click',async e=>{
  const control=e.target.closest('[data-action]');
  if(!control) return;
  const [action,id]=control.dataset.action.split(':');
  if(workspace.handle(action,id)) return;
  switch(action){
    case 'menu': setMobileMenu(true);break;
    case 'menu-close': setMobileMenu(false);break;
    case 'screen': {
      const fromDrawer=Boolean(app.querySelector('.menu-open'));
      screen=id;if(id==='tasks'){filter='open';selected=null;}render();
      if(fromDrawer){
        const title=app.querySelector('main h1');
        if(title){title.tabIndex=-1;title.focus({preventScroll:true});}
      }
      break;
    }
    case 'patient-task': if(canTreat())editTask(null,id);break;
    case 'patient-exam': attach(null,id);break;
    case 'task-exam': attach(id,null);break;
    case 'exam-patient': registerFromExam(id);break;
    case 'task-note': addTaskNote(id);break;
    case 'dashboard': filter=id;taskQuery='';taskScope=taskPriority='all';selected=null;screen='tasks';render();break;
    case 'new': editTask(); break;
    case 'edit': editTask(id); break;
    case 'file': openFile(id); break;
    case 'edit-exam': if(canTreat())editAttachment(id);break;
    case 'read-exam': {
      const a=attachments.find(item=>item.id===id&&item.kind==='exame'&&!item.archived_at);
      if(!a||!canTreat())break;
      const epoch=version;
      control.disabled=true;
      try{
        const values={read_at:new Date().toISOString()};
        const updated=db?requireData(await db.from('clinic_attachments').update(values).eq('id',id).select().single()):{...a,...values};
        if(epoch!==version)break;
        attachments=attachments.map(item=>item.id===id?updated:item);
        render();
        showNotice('Exame marcado como lido.');
      }catch(error){if(epoch===version)showNotice(error.message);}
      finally{control.disabled=false;}
      break;
    }
    case 'archive-exam': changeExamArchive(id,true);break;
    case 'restore-exam': changeExamArchive(id,false);break;
    case 'close': selected=null;render();break;
    case 'filter': filter=id;selected=null;render();break;
    case 'task-clear': taskQuery='';taskScope=taskPriority='all';selected=null;render();break;
    case 'task':
      screen='tasks';selected=id;render();
      document.querySelector('#task-detail')?.scrollIntoView({block:'nearest'});
      break;
    case 'refresh':
    case 'logout':
    case 'toggle': {
      control.disabled=true;
      const epoch=version;
      try{
        if(action==='refresh') await refresh();
        if(action==='logout') requireData(await db.auth.signOut());
        if(action==='toggle'){
          const t=tasks.find(x=>x.id===id);
          if(!t) break;
          await writeTask({completed_at:t.completed_at?null:new Date().toISOString()},id);
          showNotice(t.completed_at?'Pendência reaberta.':'Pendência concluída.');
        }
        if(epoch===version&&action!=='logout') render();
      }catch(error){showNotice(error.message);}
      finally{control.disabled=false;}
    }
  }
});

function applyTaskFilters(form){
  const data=new FormData(form);
  taskQuery=String(data.get('query')??'').trim();
  taskScope=data.get('scope');
  taskPriority=data.get('priority');
  const rows=filteredTasks();
  app.querySelector('.task-match-count').textContent=rows.length+(rows.length===1?' pendência encontrada':' pendências encontradas');
  app.querySelector('#task-filter-results').innerHTML=taskRows(rows);
  if(selected&&!rows.some(task=>task.id===selected)){
    selected=null;
    app.querySelector('#task-detail')?.remove();
  }
}
function applyLiveSearch(event){
  if(event.isComposing)return;
  if(event.target.matches('#task-filters input[name="query"]'))applyTaskFilters(event.target.form);
  if(event.target.matches('#patient-search input[name="query"]'))workspace.search(event.target.value,event.target.form);
}
app.addEventListener('input',applyLiveSearch);
app.addEventListener('compositionend',applyLiveSearch);
app.addEventListener('change',event=>{
  if(event.target.matches('#task-filters select'))applyTaskFilters(event.target.form);
});

app.addEventListener('submit',event=>{
  if(event.target.id==='task-filters'){event.preventDefault();return;}
  if(event.target.id!=='patient-search') return;
  event.preventDefault();
  workspace.search(new FormData(event.target).get('query'),event.target);
});

function login(message=''){
  app.innerHTML='<main class="login"><div class="login-panel">'+brand+'<h1>Área da equipe</h1><section>'+
    '<form><label>E-mail cadastrado<input type="email" name="email" required autocomplete="username"></label><label>Senha<input type="password" name="password" required autocomplete="current-password"></label>'+
    '<p class="error" role="alert">'+esc(message)+'</p><button class="primary">Acessar minha área</button><button type="button" class="ghost" data-password-reset>Esqueci minha senha</button></form></section></div></main>';
  if(!db){
    const form=app.querySelector('form');
    form.onsubmit=event=>event.preventDefault();
    for(const control of form.elements)control.disabled=true;
    return;
  }
  app.querySelector('form').onsubmit=async e=>{
    e.preventDefault();
    const form=e.target, submit=form.querySelector('button');
    submit.disabled=true;
    try{
      const {error}=await db.auth.signInWithPassword(Object.fromEntries(new FormData(form)));
      if(error) form.querySelector('.error').textContent='Confira o e-mail e a senha e tente novamente.';
    }catch{form.querySelector('.error').textContent='Não foi possível conectar. Tente novamente.';}
    finally{submit.disabled=false;}
  };
  const reset=app.querySelector('[data-password-reset]');
  reset.onclick=async()=>{
    const form=reset.form, email=form.elements.email, status=form.querySelector('.error');
    if(!email.reportValidity())return;
    reset.disabled=true;
    try{
      const {error}=await db.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:location.origin+location.pathname});
      status.textContent=error?'Não foi possível solicitar o link agora. Confira a conexão e tente novamente.':'Se o e-mail estiver cadastrado, confira sua caixa de entrada para criar uma nova senha.';
    }catch{status.textContent='Não foi possível solicitar o link agora.';}
    finally{reset.disabled=false;}
  };

}
function resetPassword(){
  app.innerHTML='<main class="login"><div class="login-panel">'+brand+'<h1>Definir nova senha</h1><section><form><label>Nova senha<input type="password" name="password" required minlength="8" autocomplete="new-password"></label><label>Confirme a senha<input type="password" name="confirmation" required minlength="8" autocomplete="new-password"></label><p class="error" role="alert"></p><button class="primary">Salvar nova senha</button></form></section></div></main>';
  app.querySelector('form').onsubmit=async event=>{
    event.preventDefault();
    const form=event.target,status=form.querySelector('.error'),submit=form.querySelector('button');
    const {password,confirmation}=Object.fromEntries(new FormData(form));
    if(password!==confirmation){status.textContent='As senhas precisam ser iguais.';return;}
    submit.disabled=true;
    try{
      const {error}=await db.auth.updateUser({password});
      if(error){status.textContent='Não foi possível salvar. Confira os requisitos de senha ou solicite um novo link.';return;}
      await db.auth.signOut({scope:'local'});
      login('Senha atualizada. Entre com a nova senha.');
    }catch{status.textContent='Não foi possível concluir. Tente novamente.';}
    finally{submit.disabled=false;}
  };
}
if(demo){
  tasks=[{id:crypto.randomUUID(),title:'Conferir exames recebidos',notes:'Abra a pendência para anexar um laudo fictício.',assignee:'Dra. Mayara',priority:'alta',created_at:new Date().toISOString(),completed_at:null},
    {id:crypto.randomUUID(),title:'Revisar o checklist de abertura',assignee:'Bia',priority:'media',created_at:new Date().toISOString(),completed_at:null}];
  render();
}else if(!db){
  login('Acesso indisponível. A configuração da clínica está incompleta.');
}else{
  let userId,recovering=false;
  app.innerHTML='<p class="loading">Conectando ao MOOV Clinic…</p>';
  db.auth.onAuthStateChange((event,session)=>{
    const id=session?.user.id??null;
    if(event==='PASSWORD_RECOVERY'&&id){
      recovering=true;userId=id;++version;
      member='';tasks=[];attachments=[];selected=null;workspace.reset();
      if(dialog.open)dialog.close();
      resetPassword();return;
    }
    if(recovering&&id)return;
    recovering=false;
    if(id===userId && event!=='INITIAL_SESSION') return;
    userId=id;
    const epoch=++version;
    member='';tasks=[];attachments=[];selected=null;filter='open';taskQuery='';taskScope=taskPriority='all';screen='dashboard';workspace.reset();
    if(dialog.open) dialog.close();
    if(!id){login();return;}
    app.innerHTML='<p class="loading">Carregando pendências…</p>';
    setTimeout(async()=>{
      try{
        const access=requireData(await db.from('clinic_members').select('name').eq('user_id',id).maybeSingle());
        if(epoch!==version) return;
        if(!access){
          await db.auth.signOut();
          login('Esta conta ainda não está autorizada.');
          return;
        }
        await refresh();
        if(epoch!==version) return;
        member=access.name;
        render();
      }catch{
        if(epoch!==version) return;
        await db.auth.signOut();
        login('Não foi possível carregar o painel. Confira a conexão e tente novamente.');
      }
    },0);
  });
}
