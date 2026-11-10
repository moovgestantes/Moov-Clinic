const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

export function patientFromExam(source){
  const lines=source.split(/\r?\n/).slice(0,120);
  const named=new Map(), generic=new Map(), dates=new Set();

  for(const line of lines){
    const match=line.trim().match(/^(nome\s+(?:do|da)\s+paciente|paciente|nome)\s*:\s*(.+)$/i);
    if(match){
      const name=match[2].split(/\s{2,}|\s+(?:data de nascimento|nascimento|idade|sexo|cpf|rg|p[áa]g(?:ina)?\.?)(?=\s|:|$)|[|;]/i)[0].trim();
      if(name.length<=160&&/^\p{L}[\p{L}\p{M}'’ -]+$/u.test(name)&&name.split(/\s+/).length>=2&&
        !/^(?:paciente fict[ií]ci[oa]|anonimizad[oa]|n[aã]o informad[oa]|dado omitido)$/i.test(name)){
        (match[1].toLowerCase()==='nome'?generic:named).set(normalize(name),name);
      }
    }
    const birth=line.match(/\b(?:data\s+(?:de|do)\s+nascimento|nascimento|d\.?n\.?)\s*[:.]?\s*(\d{2})[/.\-](\d{2})[/.\-](\d{4})(?!\d)/i);
    if(birth){
      const date=birth[3]+'-'+birth[2]+'-'+birth[1];
      const value=new Date(date+'T00:00:00Z');
      if(birth[3]>='1900'&&Number.isFinite(+value)&&value.toISOString().slice(0,10)===date&&value<=new Date()) dates.add(date);
    }
  }
  const names=named.size?named:generic;
  if(names.size!==1)return {};
  return {name:names.values().next().value,birth_date:dates.size===1?dates.values().next().value:''};
}
