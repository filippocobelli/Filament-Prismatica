// FilamentBox — parser fatture filamenti (v1.7.0). Usato dal browser e dai test node.
(function(root){
  function itemsToLines(items){
    const rows=[];
    for(const it of items){
      if(!it.str||!it.str.trim()) continue;
      const x=it.transform[4], y=it.transform[5];
      let row=rows.find(r=>Math.abs(r.y-y)<2.5);
      if(!row){row={y,parts:[]};rows.push(row);}
      row.parts.push({x,w:it.width||0,s:it.str});
    }
    rows.sort((a,b)=>b.y-a.y);
    return rows.map(r=>{
      r.parts.sort((a,b)=>a.x-b.x);
      let out='',end=null;
      for(const p of r.parts){
        if(end!==null) out+=(p.x-end>4)?'  ':(p.x-end>0.5?' ':'');
        out+=p.s; end=p.x+p.w;
      }
      return out.replace(/\s+$/,'');
    });
  }

  const MAT_DEFAULTS={PLA:[190,230,60],PETG:[230,260,70],ABS:[240,270,90],ASA:[240,270,90],TPU:[220,240,35],Nylon:[260,290,90],PC:[260,290,100],PVA:[190,210,50]};
  function materialOf(name){
    const n=(name||'').toUpperCase();
    if(/^PLA/.test(n)) return 'PLA';
    if(/^PETG|^PET\b/.test(n)) return 'PETG';
    if(/^ABS/.test(n)) return 'ABS';
    if(/^ASA/.test(n)) return 'ASA';
    if(/^TPU/.test(n)) return 'TPU';
    if(/^PA|NYLON/.test(n)) return 'Nylon';
    if(/^PC/.test(n)) return 'PC';
    if(/^PVA/.test(n)) return 'PVA';
    return (name||'PLA').split(/[\s-]/)[0];
  }
  const COLOR_WORDS=[
    [/bianc|white/i,'#FFFFFF'],[/ner|black/i,'#000000'],[/ross|red|scarlat/i,'#C12E1F'],
    [/giall|yellow/i,'#F4D31F'],[/arancio|orange/i,'#FF6A13'],[/verd|green/i,'#00AE42'],
    [/blu|blue/i,'#0A2989'],[/azzurr|cyan|sky/i,'#56B7E6'],[/viola|purple|lilla/i,'#5E43B7'],
    [/rosa|pink/i,'#F55A74'],[/grigi|gray|grey|titan/i,'#8E9089'],[/argent|silver/i,'#A6A9AA'],
    [/marron|brown|cioccol/i,'#7D6556'],[/beige|sabbia|sand/i,'#E8DBB7'],[/or[oa]\b|gold/i,'#E4BD68'],
    [/trasparen|clear|transparent/i,'#E6F1F5']
  ];
  function colorFromWords(name){for(const [re,hx] of COLOR_WORDS) if(re.test(name)) return hx; return null;}

  function parseInvoice(lines, colorTable){
    colorTable=colorTable||{};
    const text=lines.join('\n');
    const pick=re=>{const m=text.match(re);return m?m[1]:''};
    const meta={
      vendor:/bambu\s*lab/i.test(text)?'Bambu Lab':'',
      invoice:pick(/Invoice Number:\s*(\S+)/i)||pick(/Fattura\s*(?:n\.?|numero)[:\s]*(\S+)/i),
      order:pick(/Order Number:\s*(\S+)/i),
      date:pick(/Invoice Date:\s*([\d-]+)/i),
    };
    const isHeader=l=>/^\s*Items\s+Qty/i.test(l);
    const prevNonEmpty=i=>{let j=i-1;while(j>=0&&(!lines[j].trim()||isHeader(lines[j])))j--;return j;};
    const skuIdx=lines.map((l,i)=>/\bSKU:/i.test(l)?i:-1).filter(i=>i>=0);
    const nameIdx=skuIdx.map(si=>prevNonEmpty(si));
    const items=[];
    skuIdx.forEach((si,k)=>{
      const ni=nameIdx[k];
      let name=(lines[ni]||'').trim(), gift=false;
      if(/^gift\b/i.test(name)){gift=true;name=name.replace(/^gift\s*/i,'');}
      const gi=prevNonEmpty(ni);
      if(gi>=0&&/^\s*gift\s*$/i.test(lines[gi])) gift=true;
      let end;
      if(k+1<skuIdx.length){ end=nameIdx[k+1]; const g=prevNonEmpty(end); if(g>si&&/^\s*gift\s*$/i.test(lines[g])) end=g; }
      else { end=lines.findIndex((l,i)=>i>si&&/Items Subtotal|Subtotal|Grand total|Totale/i.test(l)); if(end<0) end=lines.length; }
      const block=lines.slice(si,end).filter(l=>!isHeader(l)).map(l=>l.trim()).join(' ').replace(/\s+/g,' ');
      const m=block.match(/SKU:\s*([A-Z0-9][A-Z0-9.\-]*)(?:\s+(SPLFREE|SPL)\b)?/i);
      if(!m) return;
      let sku=m[1]; if(sku.endsWith('-')&&m[2]) sku+=m[2];
      const qm=block.match(/(?:^|\s)(\d{1,3})\s+€\s?\d/);
      const qty=qm?parseInt(qm[1]):1;
      const prices=[...block.matchAll(/€\s?([\d.,]+)/g)].map(x=>parseFloat(x[1].replace(',','.')));
      const subtotal=prices.length?prices[prices.length-1]:null;
      let variant='';
      const vi=block.search(/Variant:/i);
      if(vi>=0){
        variant=block.slice(vi+8)
          .replace(/\b\d{1,3}\s+(?=€)/g,'')
          .replace(/€\s?[\d.,]+/g,'')
          .replace(/[A-Z]{2}\s+IVA\s*\(\d+%\)/g,'').replace(/VAT\s*\(\d+%\)/ig,'')
          .replace(/\s+/g,' ').trim();
      }
      const parts=variant.split('/').map(s=>s.trim()).filter(Boolean);
      const colorPart=parts[0]||'';
      const colorCode=(colorPart.match(/\((\d+)\)/)||[])[1]||'';
      const colorName=colorPart.replace(/\(\d+\)/,'').trim();
      const kind=parts.some(p=>/refill|ricarica/i.test(p))?'Ricarica':parts.some(p=>/bobina|spool/i.test(p))?'Con bobina':'';
      let grams=null;
      for(const p of parts){const w=p.match(/([\d.,]+)\s*(kg|g)\b/i);if(w){grams=parseFloat(w[1].replace(',','.'))*(w[2].toLowerCase()==='kg'?1000:1);}}
      const skuParts=sku.split('-');
      if(!grams&&skuParts[3]&&/^\d+$/.test(skuParts[3])) grams=+skuParts[3];
      const variantId=skuParts.slice(0,2).join('-');
      const known=colorTable[variantId];
      const material=materialOf(name);
      const t=MAT_DEFAULTS[material]||[190,220,60];
      items.push({
        name, sku, variantId, qty, gift, kind, colorCode,
        colorName: colorName||(known&&known[1])||'',
        colorHex: (known&&known[0])||colorFromWords(colorName)||'#888888',
        colorFromTable: !!known,
        material, totalWeight: grams||1000,
        nozzleMin:t[0], nozzleMax:t[1], bedTemp:t[2],
        unitPrice: subtotal!=null&&qty?Math.round(subtotal/qty*100)/100:null,
      });
    });
    return {meta, items};
  }
  const api={itemsToLines,parseInvoice,materialOf};
  if(typeof module!=='undefined') module.exports=api; else root.InvoiceParser=api;
})(typeof window!=='undefined'?window:globalThis);
