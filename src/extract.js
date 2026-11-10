import { extractFindings } from './findings.js';

export async function openPdf(blob) {
  const [{getDocument,GlobalWorkerOptions},{default:worker}] = await Promise.all([
    import('pdfjs-dist'),import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc=worker;
  return getDocument({data:await blob.arrayBuffer(),isEvalSupported:false,disableFontFace:true}).promise;
}

export async function renderPage(pdf, index, canvas, scale) {
  const page=await pdf.getPage(index);
  const viewport=page.getViewport({scale});
  canvas.width=Math.ceil(viewport.width);
  canvas.height=Math.ceil(viewport.height);
  await page.render({canvas,viewport}).promise;
}

async function readText(page) {
  const content=await page.getTextContent();
  const lines=[];
  let line='', previous;
  for(const item of content.items){
    if(!('str' in item)) continue;
    const [, , , , x,y]=item.transform;
    if(previous && Math.abs(y-previous.y)>3){
      lines.push(line); line=''; previous=null;
    }
    if(previous && x-previous.end>2) line+=x-previous.end>10?'  ':' ';
    line+=item.str;
    previous={y,end:x+item.width};
    if(item.hasEOL){lines.push(line);line='';previous=null;}
  }
  return [...lines,line].join('\n');
}

async function recognize(images, progress) {
  const [{createWorker},{default:workerPath},{default:corePath}]=await Promise.all([
    import('tesseract.js'),import('tesseract.js/dist/worker.min.js?url'),
    import('tesseract.js-core/tesseract-core-lstm.wasm.js?url'),
  ]);
  // Vite copies the language file under its fixed filename via the public directory.
  const path=import.meta.env.DEV?'/node_modules/@tesseract.js-data/por/4.0.0_best_int/':'/ocr/';
  const langPath=new URL(path,window.location.origin).href;
  const worker=await createWorker('por',1,{workerPath,corePath,langPath,workerBlobURL:false,cacheMethod:'none',
    logger:message=>{
      if(message.status==='recognizing text') progress('Lendo imagem do exame… '+Math.round(message.progress*100)+'%');
    },
  });
  try {
    const blocks=[];
    for await(const image of images){
      const {data}=await worker.recognize(image);
      blocks.push(data.text);
    }
    return blocks.join('\n');
  } finally {
    await worker.terminate();
  }
}

export async function extractExam(blob,mime,progress) {
  if(mime!=='application/pdf'){
    const text=await recognize([blob],progress);
    return {extraction:'ocr',findings:extractFindings(text),source:text};
  }
  const pdf=await openPdf(blob);
  try {
    const texts=[], scanned=[];
    for(let i=1;i<=Math.min(pdf.numPages,30);i++){
      const text=await readText(await pdf.getPage(i));
      if(text.trim().length<20) scanned.push(i);
      texts.push(text);
    }
    const source=texts.join('\n');
    if(!scanned.length) return {extraction:'text',findings:extractFindings(source),source};
    const pages=async function*(){
      for(const index of scanned.slice(0,6)){
        const canvas=document.createElement('canvas');
        await renderPage(pdf,index,canvas,1.9);
        yield canvas;
      }
    };
    try {
      const ocr=await recognize(pages(),progress);
      const fullText=source+'\n'+ocr;
      return {extraction:'ocr',findings:extractFindings(fullText),source:fullText};
    } catch {
      return {extraction:'manual',findings:extractFindings(source),source};
    }
  } finally {
    await pdf.destroy();
  }
}
