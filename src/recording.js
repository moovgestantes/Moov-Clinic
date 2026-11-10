const formats=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'];
const sessionLimit=60*60*1000;
const segmentLimit=4*60*1000;
const uploadLimit=4_000_000;

export function wireRecording(form,send){
  const start=form.querySelector('[data-record]');
  const stop=form.querySelector('[data-stop]');
  const transcribe=form.querySelector('[data-transcribe]');
  const status=form.querySelector('[data-record-status]');
  const player=form.querySelector('audio');
  const parts=form.querySelector('[data-record-parts]');
  const consent=form.elements.record_consent;
  const importer=form.elements.audio_import;
  let state='idle',active=true,stream,recorder,url,clock,rollover,deadline,mime;
  let startedAt=0;
  const clips=[];
  const notify=text=>{status.textContent=text;};
  const update=()=>{
    start.disabled=state!=='idle';
    importer.disabled=state!=='idle';
    stop.disabled=state!=='recording';
    transcribe.disabled=state!=='idle'||!send||!clips.some(clip=>!clip.transcribed);
    if(state==='idle') delete form.dataset.recording;
    else form.dataset.recording='true';
  };
  const release=()=>{
    clearInterval(clock);clearTimeout(rollover);clearTimeout(deadline);
    stream?.getTracks().forEach(track=>track.stop());
    stream=null;
  };
  const play=()=>{
    if(url) URL.revokeObjectURL(url);
    const clip=clips[Number(parts.value)];
    if(!clip) return;
    url=URL.createObjectURL(clip.blob);
    player.src=url;
    player.hidden=false;
  };
  parts.onchange=play;
  function addClip(blob,label){
    clips.push({blob,transcribed:false});
    parts.add(new Option(label||'Parte '+clips.length,String(clips.length-1)));
    parts.closest('label').hidden=false;
    parts.value=String(clips.length-1);
    play();
  }
  importer.onchange=()=>{
    const file=importer.files[0];
    importer.value='';
    if(!file)return;
    if(!consent.checked){notify('Confirme a autorização antes de importar.');return;}
    if(!/^(?:audio\/|video\/webm)/i.test(file.type)||file.size>20_000_000){
      notify('Selecione um arquivo de áudio compatível de até 20 MB.');return;
    }
    addClip(file,file.name);
    update();
    notify(file.size>uploadLimit?'Áudio importado para ouvir. Para transcrever, use um trecho de até 4 MB.':'Áudio importado para ouvir.');
  };
  function finish(message){
    release();state='idle';update();
    notify(message||(clips.length?'Gravação pronta para ouvir.':'Nenhum áudio foi capturado.'));
  }
  function endSession(){
    state='stopping';update();
    if(recorder?.state==='recording') recorder.stop();
  }
  function recordSegment(){
    let segment;
    try{segment=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:32000});}
    catch(error){if(error.name!=='NotSupportedError')throw error;segment=new MediaRecorder(stream);}
    recorder=segment;
    const chunks=[];
    let bytes=0;
    segment.ondataavailable=event=>{
      if(!event.data.size)return;
      chunks.push(event.data);bytes+=event.data.size;
      if(bytes>=3_500_000&&segment.state==='recording') segment.stop();
    };
    segment.onstop=()=>{
      clearTimeout(rollover);
      if(!active)return;
      if(bytes)addClip(new Blob(chunks,{type:segment.mimeType||chunks[0].type}));
      if(state==='recording'){
        try{recordSegment();}
        catch{finish('A gravação foi interrompida. As partes capturadas continuam disponíveis.');}
      }else if(state==='stopping') finish();
      else update();
    };
    segment.onerror=()=>finish('O microfone foi interrompido. Confira as partes disponíveis.');
    segment.start(1000);
    rollover=setTimeout(()=>{if(segment.state==='recording')segment.stop();},segmentLimit);
  }
  start.onclick=async()=>{
    if(state!=='idle') return;
    if(!consent.checked){notify('Confirme a autorização antes de gravar.');return;}
    if(!window.isSecureContext){notify('Abra pelo endereço localhost do VS Code ou por HTTPS para usar o microfone.');return;}
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){notify('Este navegador não oferece gravação. Use Importar áudio gravado.');return;}
    state='opening';update();
    try{
      mime=formats.find(type=>MediaRecorder.isTypeSupported?.(type));
      const next=await navigator.mediaDevices.getUserMedia({audio:true});
      if(!active){next.getTracks().forEach(track=>track.stop());return;}
      stream=next;
      for(const track of stream.getTracks())track.onended=()=>{if(state==='recording')endSession();};
      startedAt=Date.now();state='recording';update();
      recordSegment();
      const tick=()=>{
        const seconds=Math.floor((Date.now()-startedAt)/1000);
        notify('Gravando · '+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'));
      };
      tick();clock=setInterval(tick,1000);
      deadline=setTimeout(endSession,sessionLimit);
    }catch(error){
      const messages={
        NotAllowedError:'Microfone bloqueado. Permita o acesso nas configurações do navegador ou importe um áudio.',
        NotFoundError:'Nenhum microfone encontrado. Conecte um microfone ou importe um áudio.',
        NotReadableError:'O microfone está indisponível. Confira o dispositivo, feche outros aplicativos ou importe um áudio.',
      };
      finish(messages[error.name]||'Não foi possível iniciar a gravação. Tente importar um áudio.');
    }
  };
  stop.onclick=()=>{if(state==='recording')endSession();};
  transcribe.onclick=async()=>{
    if(state!=='idle'||!send)return;
    if(!consent.checked){notify('Confirme a autorização antes de enviar.');return;}
    if(!window.confirm('Enviar o áudio ainda não transcrito à OpenAI?'))return;
    state='transcribing';update();
    try{
      for(const [index,clip] of clips.entries()){
        if(clip.transcribed)continue;
        if(!consent.checked)throw new Error('Envio pausado. Confirme a autorização para continuar.');
        if(clip.blob.size>uploadLimit)throw new Error('A parte '+(index+1)+' excede o limite de envio.');
        notify('Transcrevendo parte '+(index+1)+' de '+clips.length+'…');
        const type=clip.blob.type;
        const ext=type.includes('mp4')||type.includes('m4a')?'m4a':type.includes('ogg')?'ogg':type.includes('wav')?'wav':type.includes('mpeg')?'mp3':'webm';
        const result=await send({action:'transcribe',confirmed:'yes',audio:new File([clip.blob],'consulta.'+ext,{type})});
        if(!active)return;
        const target=form.elements.transcript;
        const next=[target.value.trim(),result.text.trim()].filter(Boolean).join('\n\n');
        if(next.length>target.maxLength)throw new Error('A transcrição atingiu o limite de texto desta consulta.');
        target.value=next;clip.transcribed=true;
      }
      notify('Transcrição pronta. Revise o texto antes de salvar.');
    }catch(error){if(active)notify(error.message);}
    finally{if(active){state='idle';update();}}
  };
  return ()=>{
    active=false;
    if(recorder?.state==='recording')recorder.stop();
    release();
    if(url)URL.revokeObjectURL(url);
  };
}
