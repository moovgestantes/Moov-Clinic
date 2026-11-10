import {wireRecording} from './recording.js';

const localDay=(value=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Fortaleza'}).format(value);
const day=value=>value?value.split('-').reverse().join('/'):'—';

export function whatsappLink(phone){
  const raw=String(phone??'').trim();
  if(!/^\+?[\d().\s-]+$/.test(raw))return '';
  const digits=raw.replace(/\D/g,'');
  const number=raw.startsWith('+')?digits:
    digits.length===10||digits.length===11?'55'+digits:digits.startsWith('55')?digits:'';
  if(!/^[1-9]\d{7,14}$/.test(number)||number.startsWith('55')&&!/^55[1-9]\d{9,10}$/.test(number))return '';
  return '<a class="whatsapp-link outline" href="https://wa.me/'+number+'" target="_blank" rel="noopener noreferrer"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8c-1.1 0-2.2-.2-3.2-.6L4 20l1.1-4.7A8 8 0 1 1 20 11.5Z"/><path d="M9 8.7c.3 2.8 2.5 5 5.3 5.3l1-1.4-2-.9-.8.7c-1-.4-1.6-1-2-2l.7-.8-.9-2L9 8.7Z"/></svg> WhatsApp</a>';
}

export function patientWorkspace({esc,button,modal,notify,save,send,allowed,render,attachmentCard,archivedReports,getTasks,getAttachments,setCleanup}){
  let patients=[], visits=[], current=null, active='resumo', search='', archived=false;
  const field=(name,title,value='',extra='')=>'<label>'+title+'<input name="'+name+'" value="'+esc(value)+'" '+extra+'></label>';
  const area=(name,title,value,max)=>'<label>'+title+'<textarea name="'+name+'" maxlength="'+max+'">'+esc(value)+'</textarea></label>';
  function reset(){patients=[];visits=[];current=null;active='resumo';search='';archived=false;}
  function load(p,v){patients=p;visits=v;}
  function selected(){return patients.find(p=>p.id===current);}
  const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  function patientResults(){
    const query=normalize(search);
    const list=patients.filter(p=>Boolean(p.archived_at)===archived&&normalize(p.name).includes(query)).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    return '<p class="patient-count" role="status">'+list.length+(list.length===1?' paciente encontrado':' pacientes encontrados')+'</p>'+
      '<div class="patient-list">'+(list.length?list.map(p=>'<article class="card patient-card"><div><h2>'+esc(p.name)+'</h2>'+
        (p.birth_date?'<p class="hint">Nascimento '+day(p.birth_date)+'</p>':'')+'</div>'+button('Ver perfil','patient-open:'+p.id,'outline')+'</article>').join(''):'<section class="card"><p class="hint">Nenhum paciente encontrado.</p></section>')+'</div>';
  }
  function listing(){
    return '<div class="page-title"><div><span class="eyebrow clinic-kicker">ATENDIMENTO</span><h1>Pacientes</h1></div>'+button('+ Novo paciente','patient-new','primary')+'</div>'+
      '<div class="segments patient-list-tabs" aria-label="Status do cadastro">'+button('Ativos','patient-active',archived?'ghost':'selected')+button('Arquivados','patient-archived',archived?'selected':'ghost')+'</div>'+
      '<form id="patient-search" class="clinic-search"><input type="search" name="query" aria-label="Buscar paciente" placeholder="Buscar paciente pelo nome" value="'+esc(search)+'"></form>'+
      '<div id="patient-search-results">'+patientResults()+'</div>';
  }
  function summary(p,counts){
    return '<section class="card patient-summary"><div class="card-title"><div><span class="eyebrow clinic-kicker">NOME</span><h2>'+esc(p.name)+'</h2></div>'+'<div class="actions">'+(p.archived_at?button('Restaurar cadastro','patient-restore:'+p.id,'outline'):button('Editar perfil','patient-edit:'+p.id,'outline')+button('Excluir paciente','patient-archive:'+p.id,'danger-link'))+'</div></div>'+
      (counts?'<div class="summary-block"><h3>Acompanhamento clínico</h3><dl>'+counts.map(([text,n])=>'<div><dt>'+text+'</dt><dd>'+n+'</dd></div>').join('')+'</dl></div>':'')+
      '<div class="summary-data"><h3>Dados do paciente</h3><dl><div><dt>Data de nascimento</dt><dd>'+day(p.birth_date)+'</dd></div><div><dt>Telefone</dt><dd>'+esc(p.phone||'—')+'</dd></div></dl></div></section>';
  }
  function view(){
    const p=selected();
    if(!p) return listing();
    return '<div class="patient-profile">'+button('‹ Lista de pacientes','patient-list')+
      '<div class="page-title profile-title"><div><span class="eyebrow clinic-kicker">PERFIL DO PACIENTE</span><h1>'+esc(p.name)+'</h1></div>'+whatsappLink(p.phone)+'</div>'+
      (allowed()?clinical(p):summary(p))+'</div>';
  }
  function clinical(p){
    const tasks=getTasks().filter(t=>t.patient_id===p.id);
    const ids=new Set(tasks.map(t=>t.id));
    const files=getAttachments().filter(a=>ids.has(a.task_id));
    const links=[['resumo','Resumo clínico'],['consultas','Consultas'],['exames','Exames'],['pendencias','Pendências']];
    const tabs='<nav class="profile-tabs" aria-label="Seções do paciente"><div class="segments">'+links.map(([k,v])=>'<button type="button" class="'+(active===k?'selected':'ghost')+'" data-action="patient-tab:'+k+'" aria-pressed="'+(active===k)+'">'+v+'</button>').join('')+'</div></nav>';
    if(active==='resumo') return tabs+summary(p,[['Consultas',visits.filter(v=>v.patient_id===p.id).length],['Exames',files.filter(a=>a.kind==='exame'&&!a.archived_at).length],['Pendências abertas',tasks.filter(t=>!t.completed_at).length]]);
    if(active==='consultas'){
      const rows=visits.filter(v=>v.patient_id===p.id).sort((a,b)=>b.visit_date.localeCompare(a.visit_date)||b.created_at.localeCompare(a.created_at));
      return tabs+'<section class="card">'+'<div class="card-title"><h2>Histórico de consultas</h2>'+(p.archived_at?'':button('+ Registrar consulta','visit-new','primary'))+'</div>'+
        (rows.length?rows.map(v=>'<div class="row"><div class="row-text"><strong>'+esc(v.reason)+'</strong><small>'+day(v.visit_date)+'</small></div>'+button('Abrir anamnese','visit-edit:'+v.id)+'</div>').join(''):'<p class="hint">Nenhuma consulta registrada.</p>')+'</section>';
    }
    if(active==='exames'){
      const exams=files.filter(a=>a.kind==='exame'&&!a.archived_at).sort((a,b)=>(b.exam_date||'').localeCompare(a.exam_date||'')||b.created_at.localeCompare(a.created_at));
      const documents=files.filter(a=>a.kind!=='exame'&&!a.archived_at);
      const groups=new Map();
      for(const exam of exams){
        const sent=exam.created_at?localDay(new Date(exam.created_at)):null;
        const key=exam.exam_date?'exam:'+exam.exam_date:'sent:'+(sent??'');
        if(!groups.has(key))groups.set(key,{
          title:exam.exam_date?'Realizado em '+day(exam.exam_date):sent?'Enviado em '+day(sent):'Sem data registrada',
          exams:[]
        });
        groups.get(key).exams.push(exam);
      }
      const [recent,...older]=groups.values();
      const groupView=group=>'<div class="patient-exam-group"><h3>'+group.title+'</h3>'+group.exams.map(attachmentCard).join('')+'</div>';
      return tabs+'<section class="card"><div class="card-title"><h2>Histórico de exames</h2>'+(p.archived_at?'':button('+ Anexar laudos','patient-exam:'+p.id,'primary'))+'</div>'+
        (recent?groupView(recent):'<p class="hint">Nenhum exame anexado.</p>')+
        (older.length?'<details class="exam-history"><summary>Ver exames anteriores ('+(exams.length-recent.exams.length)+')</summary>'+older.map(groupView).join('')+'</details>':'')+
        archivedReports(files)+(documents.length?'<details class="exam-history"><summary>Arquivos anteriores ('+documents.length+')</summary>'+documents.map(attachmentCard).join('')+'</details>':'')+'</section>';
    }
    return tabs+'<section class="card">'+'<div class="card-title"><h2>Pendências do paciente</h2>'+(p.archived_at?'':button('+ Nova pendência','patient-task:'+p.id,'primary'))+'</div>'+
      (tasks.length?tasks.map(t=>'<div class="row"><div class="row-text"><strong>'+esc(t.title)+'</strong><small>'+(t.completed_at?'Concluída':'Pendente')+'</small></div>'+button('Abrir pendência','task:'+t.id)+'</div>').join(''):'<p class="hint">Nenhuma pendência vinculada.</p>')+'</section>';
  }
  function editPatient(id){
    const p=patients.find(row=>row.id===id)??{};
    modal(id?'Editar cadastro':'Cadastrar paciente',field('name','Nome completo',p.name,'required maxlength="160"')+
      '<div class="fields">'+field('birth_date','Nascimento',p.birth_date,'type="date"')+field('phone','Telefone',p.phone,'type="tel" maxlength="40"')+'</div>',
      'Salvar cadastro',async data=>{
        if(!data.name.trim())throw new Error('Informe o nome da paciente.');
        const row=await save('clinic_patients',{name:data.name.trim(),birth_date:data.birth_date||null,phone:data.phone.trim()},id);
        patients=[row,...patients.filter(p=>p.id!==row.id)];
        current=row.id;active='resumo';notify('Cadastro salvo.');
      });
  }
  function archivePatient(id,archive){
    const patient=patients.find(p=>p.id===id);
    if(!patient||Boolean(patient.archived_at)===archive)return;
    modal(archive?'Excluir paciente':'Restaurar cadastro',
      '<p>'+esc(patient.name)+'</p>'+(archive?'<p class="hint">O cadastro sai da lista ativa. Consultas, laudos e pendências ficam no histórico e o cadastro pode ser restaurado.</p>':''),
      archive?'Excluir da lista ativa':'Restaurar',async()=>{
        const row=await save('clinic_patients',{archived_at:archive?new Date().toISOString():null},id);
        patients=patients.map(p=>p.id===id?{...p,...row}:p);
        current=null;
        archived=!archive;
        notify(archive?'Paciente arquivado.':'Cadastro restaurado.');
      });
  }
  function editVisit(id){
    if(!allowed()||!selected()) return;
    const patient=selected();
    const v=visits.find(row=>row.id===id)??{};
    const form=modal(id?'Anamnese · '+patient.name:'Nova consulta · '+patient.name,
      '<div class="fields">'+field('visit_date','Data da consulta',v.visit_date||localDay(),'type="date" required')+field('reason','Motivo da consulta',v.reason,'maxlength="160" required')+'</div>'+
      '<fieldset class="recording-panel"><legend>Áudio e transcrição por IA</legend>'+
      '<p class="hint">'+(send?'Grave ou importe o áudio e use Transcrever com IA. Revise o texto antes de salvar.':'Transcrição por IA indisponível.')+'</p><label class="inline"><input type="checkbox" name="record_consent"> Confirmei a autorização para gravar a consulta.</label>'+
      '<div class="actions"><button type="button" class="ghost" data-record>Gravar consulta</button><button type="button" class="ghost" data-stop disabled>Parar</button><button type="button" class="outline" data-transcribe disabled>Transcrever com IA</button></div>'+
      '<label class="audio-import">Importar áudio gravado<input type="file" name="audio_import" accept="audio/*,.m4a,.webm,.ogg,.mp3,.wav"></label><label hidden>Parte para ouvir<select data-record-parts></select></label><audio controls hidden></audio><p class="hint" data-record-status role="status">Até 60 minutos por gravação. O áudio fica temporariamente no navegador.</p></fieldset>'+
      area('transcript','Transcrição para conferência',v.transcript,60000)+
      area('anamnesis','Anamnese e evolução',v.anamnesis,30000)+area('plan','Conduta e plano',v.plan,15000),
      'Salvar consulta',async (data,form)=>{
        if(form.dataset.recording) throw new Error('Aguarde a gravação ou a transcrição terminar.');
        if(!data.reason.trim()) throw new Error('Informe o motivo da consulta.');
        const values={visit_date:data.visit_date,reason:data.reason.trim(),anamnesis:data.anamnesis.trim(),plan:data.plan.trim(),transcript:data.transcript.trim()};
        const row=await save('clinic_visits',id?values:{...values,patient_id:patient.id},id);
        visits=[{...row,patient_id:patient.id},...visits.filter(v=>v.id!==row.id)];
        notify('Consulta salva.');
      });
    setCleanup(wireRecording(form,send));
  }
  return {reset,load,view,selected,addPatient:row=>{patients=[row,...patients.filter(p=>p.id!==row.id)];}, directory:()=>patients.filter(p=>!p.archived_at).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')), patientArchived:id=>Boolean(patients.find(p=>p.id===id)?.archived_at), patientName:id=>patients.find(p=>p.id===id)?.name||'', patientPhone:id=>patients.find(p=>p.id===id)?.phone||'',
    handle(action,id){
      if(action==='patient-list'){current=null;render();}
      else if(action==='patient-active'||action==='patient-archived'){current=null;archived=action==='patient-archived';render();}
      else if(action==='patient-archive'||action==='patient-restore')archivePatient(id,action==='patient-archive');
      else if(action==='patient-open'){current=id;active='resumo';render();}
      else if(action==='patient-tab'){active=id;render();}
      else if(action==='patient-new'||action==='patient-edit') editPatient(id);
      else if(action==='visit-new'||action==='visit-edit') editVisit(id);
      else return false;
      return true;
    },
    search(query,form){search=query;form.nextElementSibling.innerHTML=patientResults();},
  };
}
