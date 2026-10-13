const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderLessonReading(body){
  const lines=String(body).replace(/\r/g,'').split('\n');
  // Plain text stays plain. Structured lessons accept only headings and lists.
  if(!lines.some(line=>/^## .+/.test(line)))return '<article class="content-reading">'+escape(body)+'</article>';
  let html='<article class="content-reading structured-reading">',paragraph=[],list=[],section=false;
  const flush=()=>{if(paragraph.length){html+='<p>'+escape(paragraph.join(' '))+'</p>';paragraph=[];}if(list.length){html+='<ul>'+list.map(text=>'<li>'+escape(text)+'</li>').join('')+'</ul>';list=[];}};
  for(const line of lines){
    if(/^## .+/.test(line)){flush();if(section)html+='</section>';html+='<section class="lesson-section"><h2>'+escape(line.slice(3))+'</h2>';section=true;}
    else if(/^- .+/.test(line)){if(paragraph.length)flush();list.push(line.slice(2));}
    else if(!line.trim())flush();
    else {if(list.length)flush();paragraph.push(line);}
  }
  flush();return html+(section?'</section>':'')+'</article>';
}
