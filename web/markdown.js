// Deliberately text-only Markdown rendering: no HTML, remote media or executable links.
export function renderMarkdown(target, markdown) {
  target.replaceChildren();
  const lines=markdown.replace(/\r\n/g,'\n').split('\n');
  const append=(tag,text,parent=target)=>{const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;};
  let i=0;
  while(i<lines.length){
    const line=lines[i];
    if(!line.trim()){i++;continue;}
    if(/^```/.test(line)){const code=[];i++;while(i<lines.length&&!/^```/.test(lines[i]))code.push(lines[i++]);i++;append('code',code.join('\n'),append('pre',''));continue;}
    const heading=/^(#{1,6})\s+(.+)$/.exec(line);
    if(heading){append('h'+heading[1].length,heading[2]);i++;continue;}
    if(line.includes('|')&&/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i+1]||'')){
      const table=append('table',''),head=append('thead','',table),body=append('tbody','',table);
      const row=(text,parent,tag)=>{const tr=append('tr','',parent);for(const cell of text.trim().replace(/^\||\|$/g,'').split('|'))append(tag,cell.trim(),tr);};
      row(line,head,'th');i+=2;while(i<lines.length&&lines[i].includes('|'))row(lines[i++],body,'td');continue;
    }
    const list=/^\s*(?:[-*+] |\d+\. )/.exec(line);
    if(list){const ul=append(/^\s*\d/.test(line)?'ol':'ul','');while(i<lines.length&&/^\s*(?:[-*+] |\d+\. )/.test(lines[i]))append('li',lines[i++].replace(/^\s*(?:[-*+] |\d+\. )/,''),ul);continue;}
    const paragraph=[line];i++;while(i<lines.length&&lines[i].trim()&&!/^(?:#|```|[-*+] |\d+\. )/.test(lines[i]))paragraph.push(lines[i++]);append('p',paragraph.join('\n'));
  }
}
